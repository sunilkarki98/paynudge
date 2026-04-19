import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/infrastructure/redis'
import { QUEUE_NAMES } from '@/modules/queues/queue-names'
import { eventBus } from '@/modules/events/event-bus'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { scheduleRecurringCheck } from '@/modules/queues/overdue-check-queue'
import { determineNextAction } from '@/modules/ai/next-action-engine'
import type { OverdueCheckJobData } from '@/modules/queues/overdue-check-queue'

const log = logger.child({ module: 'overdue-check-worker' })

/**
 * Overdue Check Worker — checks if invoices are still unpaid at overdue checkpoints.
 * 
 * This replaces the cron's "scan all invoices" approach with targeted,
 * per-invoice checks scheduled at invoice creation time.
 * 
 * When an invoice is still unpaid at a checkpoint:
 *  - Emits invoice.overdue event with daysOverdue and stage
 *  - The notification subscriber picks up the event and enqueues an email job
 * 
 * When an invoice has been paid:
 *  - Does nothing. The job completes silently.
 *  - The paid event handler should have already removed this job,
 *    but we handle the race case gracefully.
 */

async function processOverdueCheck(job: Job<OverdueCheckJobData>): Promise<void> {
  const { invoiceId, userId, clientEmail, clientName, amount, dueDate, daysOverdue, stage, contactChannel, whatsappNumber, smsNumber, chaseUntilPaid, chaseIntervalDays, paymentLinkToken, reminderTone } = job.data

  log.info('Processing overdue check', {
    jobId: job.id,
    invoiceId,
    daysOverdue,
    stage,
  })

  // Check current invoice status
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      reminderStage: true,
      clientId: true,
      aiMetadata: true,
    },
  })

  if (!invoice) {
    log.warn('Invoice not found during overdue check', { invoiceId })
    return
  }

  if (invoice.status === 'PAID') {
    log.info('Invoice already paid, skipping overdue check', {
      invoiceId,
      daysOverdue,
    })
    return
  }

  // Determine user settings and client behavior
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { shieldMode: true } })
  const shieldMode = user?.shieldMode || false

  let behaviorType = 'UNKNOWN'
  let engagementScore = 0

  if (invoice.clientId) {
    const client = await prisma.client.findUnique({
      where: { id: invoice.clientId },
      select: { behaviorType: true, engagementScore: true }
    })
    
    if (client) {
      behaviorType = client.behaviorType || 'UNKNOWN'
      engagementScore = client.engagementScore ? Number(client.engagementScore) : 0
    }
  }

  const decision = determineNextAction({
    riskScore: invoice.aiMetadata?.riskScore === 'HIGH' ? 80 : 50, // rough proxy
    riskLevel: invoice.aiMetadata?.riskScore || 'MEDIUM',
    behaviorType: behaviorType as any,
    engagementScore,
    invoiceAmount: Number(amount),
    daysOverdue,
    stage
  })

  // Handle Pre-Due Checkpoint
  if (daysOverdue === -3 && stage === 0) {
    if (['HIGH_RISK_GHOST', 'AVOIDANT'].includes(behaviorType)) {
      log.info('Emitting pre-due risk warning for high-risk client', { invoiceId, behaviorType })
      eventBus.emit('invoice.predue_warning', {
        invoiceId,
        userId,
        clientName,
        dueDate: new Date(dueDate),
        behaviorType,
      })
    } else {
      log.info('Skipping pre-due warning for safe client', { invoiceId, behaviorType })
    }
    return
  }

  if (decision.action === 'WAIT') {
    log.info('Next action engine suggested WAIT. Rescheduling.', { invoiceId, reason: decision.reason })
    if (chaseUntilPaid) {
      await scheduleRecurringCheck(job.data, daysOverdue + Math.ceil(chaseIntervalDays / 2)) 
    }
    return
  }

  let finalChannel = contactChannel
  if (decision.action === 'SWITCH_CHANNEL') {
    finalChannel = 'SMS'
    log.info('Next action engine suggested channel switch to SMS', { invoiceId })
  }

  // Only emit overdue if we haven't already sent a reminder for this stage
  if (invoice.reminderStage >= stage) {
    log.info('Invoice already at or past this reminder stage, skipping', {
      invoiceId,
      currentStage: invoice.reminderStage,
      checkStage: stage,
    })
    return
  }

  // Invoice is still unpaid at this checkpoint — emit overdue event
  log.info('Invoice overdue confirmed', {
    invoiceId,
    daysOverdue,
    stage,
    currentStage: invoice.reminderStage,
  })

  eventBus.emit('invoice.overdue', {
    invoiceId,
    userId,
    clientEmail,
    clientName,
    amount,
    dueDate: new Date(dueDate),
    daysOverdue,
    stage,
    contactChannel: finalChannel || 'EMAIL',
    whatsappNumber: whatsappNumber || null,
    smsNumber: smsNumber || null,
    paymentLinkToken,
    reminderTone,
    chaseUntilPaid,
    chaseIntervalDays,
  })

  // If chase-until-paid is enabled, schedule the NEXT check right now
  if (chaseUntilPaid) {
    const nextDaysOverdue = daysOverdue + chaseIntervalDays
    // Only schedule if it's the final stage (4) or already recurring (5+)
    if (stage >= 4) {
      await scheduleRecurringCheck(job.data, nextDaysOverdue)
      log.info('Scheduled next recurring check', { invoiceId, nextDaysOverdue })
    }
  }
}

/**
 * Create and start the overdue check worker.
 * Higher concurrency is fine here — we're just doing DB reads + event emits.
 */
export function startOverdueCheckWorker(concurrency = 10): Worker<OverdueCheckJobData> {
  const connection = createRedisConnection()

  const worker = new Worker<OverdueCheckJobData>(
    QUEUE_NAMES.OVERDUE_CHECK,
    processOverdueCheck,
    {
      connection,
      concurrency,
      stalledInterval: 30_000,
      lockDuration: 30_000,
    }
  )

  worker.on('completed', (job) => {
    log.info('Overdue check completed', {
      jobId: job.id,
      invoiceId: job.data.invoiceId,
      daysOverdue: job.data.daysOverdue,
    })
  })

  worker.on('failed', (job, err) => {
    log.error('Overdue check failed', {
      jobId: job?.id,
      invoiceId: job?.data.invoiceId,
      error: err.message,
    })
  })

  worker.on('error', (err) => {
    log.error('Overdue check worker error', { error: err.message })
  })

  log.info('Overdue check worker started', {
    concurrency,
    queue: QUEUE_NAMES.OVERDUE_CHECK,
  })

  return worker
}
