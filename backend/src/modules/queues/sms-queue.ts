import { createQueue } from '@/infrastructure/queue'
import { QUEUE_NAMES } from './queue-names'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'sms-queue' })

export interface SMSJobData {
  invoiceId: string
  userId: string
  smsNumber: string
  clientName: string
  amount: number
  dueDate: string // ISO string
  stage: number
  idempotencyKey: string
  daysOverdue: number
  paymentLinkToken?: string
  reminderTone?: string
  customMessage?: string
}

export function getSMSQueue() {
  return createQueue(QUEUE_NAMES.SMS)
}

export async function enqueueSMSJob(data: SMSJobData): Promise<void> {
  const queue = getSMSQueue()
  const jobId = data.idempotencyKey

  try {
    await queue.add('send-sms', data, {
      jobId,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
    })

    log.info('SMS job enqueued', {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      smsNumber: data.smsNumber,
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Job already exists')) {
      log.info('SMS job already exists (idempotent skip)', {
        jobId,
        invoiceId: data.invoiceId,
      })
      return
    }
    throw err
  }
}

export async function enqueueDelayedSMSJob(
  data: SMSJobData,
  delayMs: number
): Promise<void> {
  const queue = getSMSQueue()
  const jobId = data.idempotencyKey

  try {
    await queue.add('send-sms', data, {
      jobId,
      delay: Math.max(0, delayMs),
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
    })

    log.info('Delayed SMS job enqueued', {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      delayMs,
      scheduledFor: new Date(Date.now() + delayMs).toISOString(),
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Job already exists')) {
      log.info('Delayed SMS job already exists (idempotent skip)', {
        jobId,
        invoiceId: data.invoiceId,
      })
      return
    }
    throw err
  }
}

export async function cancelPendingSMSJobs(invoiceId: string): Promise<number> {
  const queue = getSMSQueue()
  let cancelled = 0

  for (const stage of [1, 2, 3, 4]) {
    const jobId = `sms:${invoiceId}:stage:${stage}`
    try {
      const job = await queue.getJob(jobId)
      if (job) {
        const state = await job.getState()
        if (state === 'delayed' || state === 'waiting') {
          await job.remove()
          cancelled++
          log.info('Cancelled pending SMS job', { jobId, invoiceId, stage, state })
        }
      }
    } catch (err) {
      log.warn('Failed to cancel SMS job', {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return cancelled
}
