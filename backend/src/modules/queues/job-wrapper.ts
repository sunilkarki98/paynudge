import { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { Prisma, Invoice } from '@prisma/client'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'idempotency-guard' })

export interface BaseReminderJobData {
  invoiceId: string
  stage: number
  idempotencyKey: string
  reminderTone?: string
}

export interface BusinessLogicResult {
  plainText: string
  persuasionStrategy?: string
}

/**
 * A Higher-Order Function that wraps any reminder job (Email, SMS, WhatsApp)
 * to securely handle Database Idempotency Locks, Race Conditions, and Stage Rollbacks.
 * 
 * @param channel The communication channel logging the event
 * @param job The BullMQ job instance
 * @param executeBusiness The specific LLM and Sending logic for this channel
 */
export async function withIdempotencyGuard<T extends BaseReminderJobData>(
  channel: 'email' | 'sms' | 'whatsapp',
  job: Job<T>,
  executeBusiness: (invoice: Invoice) => Promise<BusinessLogicResult>
): Promise<void> {
  const { invoiceId, stage, idempotencyKey, reminderTone } = job.data

  log.info(`Processing ${channel} job`, {
    jobId: job.id,
    invoiceId,
    stage,
    attempt: job.attemptsMade + 1,
    idempotencyKey,
  })

  // ── Step 1: Check if invoice still needs this reminder ──
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      reminderStage: true,
      idempotencyKeys: true,
      userId: true,
    },
  })

  if (!invoice) {
    log.warn('Invoice not found, skipping job', { invoiceId, jobId: job.id })
    return
  }

  if (invoice.status === 'PAID') {
    log.info('Invoice already paid, skipping', { invoiceId, jobId: job.id, channel })
    await prisma.reminderLog.create({
      data: {
        invoiceId,
        stage,
        status: 'skipped',
        error: 'Invoice already paid',
        jobId: job.id ?? null,
        idempotencyKey,
      },
    })
    return
  }

  // ── Step 2: Idempotency check via atomic DB operation ──
  const updateResult = await prisma.invoice.updateMany({
    where: {
      id: invoiceId,
      status: 'UNPAID',
      NOT: { idempotencyKeys: { has: idempotencyKey } },
    },
    data: {
      reminderStage: stage,
      lastReminderSentAt: new Date(),
      idempotencyKeys: { push: idempotencyKey },
    },
  })

  if (updateResult.count === 0) {
    log.info('Idempotency check failed — already processed', { invoiceId, idempotencyKey, jobId: job.id })
    await prisma.reminderLog.create({
      data: { invoiceId, stage, status: 'skipped', error: 'Idempotency key already exists', jobId: job.id ?? null, idempotencyKey },
    })
    return
  }

  // ── Step 3: Run specific business execution ──
  try {
    const result = await executeBusiness(invoice as unknown as Invoice)

    // ── Step 4: Log success natively ──
    await prisma.reminderLog.create({
      data: {
        invoiceId,
        stage,
        status: 'sent',
        jobId: job.id ?? null,
        idempotencyKey,
        channel,
        tone: reminderTone,
        messageBody: result.plainText,
        persuasionStrategy: result.persuasionStrategy,
      },
    })

    // Dispatch audit event dynamically
    const { eventBus } = await import('@/modules/events/event-bus')
    eventBus.emit('invoice.overdue', { invoiceId, stage } as never)
    
    await prisma.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: 'reminder_sent',
        metadata: { channel, stage, tone: reminderTone },
      }
    })

    log.info(`Reminder ${channel} sent successfully`, { invoiceId, stage, jobId: job.id })
  } catch (error) {
    log.error(`${channel} send failed, rolling back idempotency key for retry`, {
      invoiceId,
      stage,
      attempt: job.attemptsMade + 1,
      maxAttempts: job.opts.attempts,
      error: error instanceof Error ? error.message : String(error),
    })

    const currentInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { idempotencyKeys: true, reminderStage: true },
    })
    
    if (currentInvoice) {
      await prisma.$transaction([
        prisma.$executeRaw`UPDATE "Invoice" SET "idempotencyKeys" = array_remove("idempotencyKeys", ${idempotencyKey}) WHERE id = ${invoiceId}`,
        prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            reminderStage: Math.max(0, stage - 1),
            lastReminderSentAt: null,
          },
        })
      ])
    }

    await prisma.reminderLog.create({
      data: {
        invoiceId,
        stage,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        jobId: job.id ?? null,
        idempotencyKey,
      },
    })

    throw error // Re-throw to allow BullMQ to handle retry backoff
  }
}
