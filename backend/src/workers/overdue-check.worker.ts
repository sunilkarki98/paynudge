import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/infrastructure/redis'
import { QUEUE_NAMES } from '@/modules/queues/queue-names'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { scheduleRecurringCheck } from '@/modules/queues/overdue-check-queue'
import { determineNextAction } from '@/modules/ai/next-action-engine'
import { transitionInvoice, InvoiceFSMEvent } from '@/modules/invoice/invoice.fsm'
import type { OverdueCheckJobData } from '@/modules/queues/overdue-check-queue'

const log = logger.child({ module: 'overdue-check-worker' })

/**
 * Overdue Check Worker — Refactored to use Finite State Machine (FSM).
 * 
 * Instead of complex if/else blocks, this worker now delegates the lifecycle 
 * logic to the transitionInvoice engine.
 */
async function processOverdueCheck(job: Job<OverdueCheckJobData>): Promise<void> {
  const { 
    invoiceId, daysOverdue, 
    chaseUntilPaid, chaseIntervalDays, 
    contactChannel
  } = job.data

  log.info('Processing FSM-driven overdue check', { jobId: job.id, invoiceId, state: daysOverdue })

  // 1. Fetch current context
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { 
      client: { select: { behaviorType: true, engagementScore: true, behaviorProfile: true } },
      user: { select: { shieldMode: true } },
      aiMetadata: { select: { riskScore: true } }
    },
  })

  if (!invoice) {
    log.warn('Invoice not found during overdue check', { invoiceId })
    return
  }

  // 2. Terminal State Safety
  if (['PAID', 'VOIDED', 'WRITTEN_OFF'].includes(invoice.state)) {
    log.info('Invoice in terminal state, skipping check', { invoiceId, state: invoice.state })
    return
  }

  // 3. AI Behavioral Recommendation
  const behaviorType = invoice.client?.behaviorType || 'UNKNOWN'
  const engagementScore = invoice.client?.engagementScore ? Number(invoice.client?.engagementScore) : 0
  
  const decision = determineNextAction({
    riskScore: invoice.aiMetadata && (invoice.aiMetadata as any).riskScore === 'HIGH' ? 80 : 50,
    riskLevel: (invoice.aiMetadata as any)?.riskScore || 'MEDIUM',
    behaviorType: behaviorType as any,
    engagementScore,
    invoiceAmount: Number(invoice.amount),
    daysOverdue,
    stage: invoice.reminderStage
  })

  if (decision.action === 'WAIT') {
    log.info('AI suggested WAIT. Rescheduling.', { invoiceId, reason: decision.reason })
    if (chaseUntilPaid) {
      await scheduleRecurringCheck(job.data, daysOverdue + Math.ceil(chaseIntervalDays / 2)) 
    }
    return
  }

  // 4. FSM Transition
  let event: InvoiceFSMEvent = 'CHECKPOINT_REACHED'
  if (daysOverdue === -3) event = 'REACH_DUE_SOON'
  else if (daysOverdue === 0) event = 'REACH_DUE_DATE'

  const result = transitionInvoice(event, {
    currentState: invoice.state,
    chasingProfile: invoice.chasingProfile,
    balance: Number(invoice.balance),
    amount: Number(invoice.amount),
    isGhost: behaviorType === 'AVOIDANT' || behaviorType === 'HIGH_RISK_GHOST' || invoice.client?.behaviorProfile === 'GHOST',
    isShieldMode: invoice.user.shieldMode
  })

  // 5. Persist State Change + Side Effects atomically via Outbox
  if (result.nextState !== invoice.state || result.sideEffect === 'SEND_REMINDER') {
    let finalChannel = contactChannel || 'EMAIL'
    if (decision.action === 'SWITCH_CHANNEL') {
      finalChannel = 'SMS'
      log.info('AI suggested channel switch to SMS', { invoiceId })
    }

    await prisma.$transaction(async (tx) => {
      // State transition with optimistic lock
      if (result.nextState !== invoice.state) {
        const updated = await tx.invoice.updateMany({
          where: { 
            id: invoiceId, 
            version: invoice.version,  // Optimistic lock
          },
          data: {
            state: result.nextState,
            lastStateChangeAt: new Date(),
            stateMetadata: {
              lastTransitionEvent: event,
              reason: result.reason,
              aiDecision: decision.reason
            },
            version: { increment: 1 },
          }
        })

        if (updated.count === 0) {
          log.warn('Optimistic lock conflict — invoice was modified concurrently, skipping', { invoiceId })
          return // Transaction will rollback (no side effects emitted)
        }

        log.info('Invoice state transitioned', { invoiceId, from: invoice.state, to: result.nextState, reason: result.reason })
      }

      // Write side-effect to Outbox (emitted by outbox worker)
      if (result.sideEffect === 'SEND_REMINDER') {
        await tx.outboxEvent.create({
          data: {
            eventType: 'invoice.overdue',
            payload: {
              ...job.data,
              dueDate: new Date(job.data.dueDate).toISOString(),
              contactChannel: finalChannel,
              stage: invoice.reminderStage + 1,
            },
          }
        })
      }
    })
  }

  // 7. Schedule next recurring check if at terminal chasing states
  if (chaseUntilPaid && (result.nextState === 'FINAL_NOTICE' || result.nextState === 'RECURRING_CHASE')) {
    await scheduleRecurringCheck(job.data, daysOverdue + chaseIntervalDays)
  }
}

/**
 * Create and start the overdue check worker.
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
    log.info('Overdue check completed', { jobId: job.id, invoiceId: job.data.invoiceId })
  })

  worker.on('failed', (job, err) => {
    log.error('Overdue check failed', { jobId: job?.id, invoiceId: job?.data.invoiceId, error: err.message })
  })

  log.info('FSM-Enabled Overdue check worker started', { concurrency, queue: QUEUE_NAMES.OVERDUE_CHECK })

  return worker
}
