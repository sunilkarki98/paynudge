import { createQueue } from '@/infrastructure/queue'
import { QUEUE_NAMES } from './queue-names'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'whatsapp-queue' })

export interface WhatsAppJobData {
  invoiceId: string
  userId: string
  whatsappNumber: string
  clientName: string
  amount: number
  dueDate: string // ISO string
  stage: number
  daysOverdue: number
  paymentLinkToken?: string
  reminderTone?: string
  idempotencyKey: string
}

export function getWhatsAppQueue() {
  return createQueue(QUEUE_NAMES.WHATSAPP)
}

export async function enqueueWhatsAppJob(data: WhatsAppJobData): Promise<void> {
  const queue = getWhatsAppQueue()
  const jobId = data.idempotencyKey

  try {
    await queue.add('send-whatsapp', data, {
      jobId,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
    })

    log.info('WhatsApp job enqueued', {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      whatsappNumber: data.whatsappNumber
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Job already exists')) {
      log.info('WhatsApp job already exists (idempotent skip)', {
        jobId,
        invoiceId: data.invoiceId,
      })
      return
    }
    throw err
  }
}

export async function enqueueDelayedWhatsAppJob(
  data: WhatsAppJobData,
  delayMs: number
): Promise<void> {
  const queue = getWhatsAppQueue()
  const jobId = data.idempotencyKey

  try {
    await queue.add('send-whatsapp', data, {
      jobId,
      delay: Math.max(0, delayMs),
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
    })

    log.info('Delayed WhatsApp job enqueued', {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      delayMs,
      scheduledFor: new Date(Date.now() + delayMs).toISOString(),
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Job already exists')) {
      log.info('Delayed WhatsApp job already exists (idempotent skip)', {
        jobId,
        invoiceId: data.invoiceId,
      })
      return
    }
    throw err
  }
}

export async function cancelPendingWhatsAppJobs(invoiceId: string): Promise<number> {
  const queue = getWhatsAppQueue()
  let cancelled = 0

  for (const stage of [1, 2, 3, 4]) {
    const jobId = `whatsapp:${invoiceId}:stage:${stage}`
    try {
      const job = await queue.getJob(jobId)
      if (job) {
        const state = await job.getState()
        if (state === 'delayed' || state === 'waiting') {
          await job.remove()
          cancelled++
          log.info('Cancelled pending whatsapp job', { jobId, invoiceId, stage, state })
        }
      }
    } catch (err) {
      log.warn('Failed to cancel whatsapp job', {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return cancelled
}
