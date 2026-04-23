import { createQueue } from '@/infrastructure/queue'
import { QUEUE_NAMES } from './queue-names'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'email-queue' })

/**
 * Email job payload — everything the worker needs to process an email.
 */
export interface EmailJobData {
  invoiceId: string
  userId: string
  clientEmail: string
  clientName: string
  amount: number
  dueDate: string // ISO string for JSON serialization
  stage: number   // 1=due, 2=3day, 3=7day, 4=14day
  idempotencyKey: string
  daysOverdue: number
  paymentLinkToken?: string
  reminderTone?: string
  customMessage?: string
}

/**
 * Get or create the email queue singleton.
 */
export function getEmailQueue() {
  return createQueue(QUEUE_NAMES.EMAIL)
}

/**
 * Enqueue an immediate email job with idempotency.
 * 
 * The jobId IS the idempotency key. BullMQ will reject a job if a job
 * with the same ID already exists in the queue — this is our first line
 * of defense against duplicates. The worker also checks the DB as a
 * second layer.
 */
export async function enqueueEmailJob(data: EmailJobData): Promise<void> {
  const queue = getEmailQueue()
  const jobId = data.idempotencyKey // e.g. "email:<invoiceId>:stage:2"

  try {
    await queue.add('send-reminder', data, {
      jobId,
      // Override default attempts for email — 5 retries with exponential backoff
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 30_000, // 30s, 60s, 120s, 240s, 480s
      },
    })

    log.info('Email job enqueued', {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
    })
  } catch (err) {
    // BullMQ throws if jobId already exists — this is expected (idempotency)
    if (err instanceof Error && err.message.includes('Job already exists')) {
      log.info('Email job already exists (idempotent skip)', {
        jobId,
        invoiceId: data.invoiceId,
      })
      return
    }
    throw err
  }
}

/**
 * Enqueue a delayed email job (for scheduling payment_due reminders at dueDate).
 * 
 * @param data - Email job payload
 * @param delayMs - Milliseconds from now to delay execution
 */
export async function enqueueDelayedEmailJob(
  data: EmailJobData,
  delayMs: number
): Promise<void> {
  const queue = getEmailQueue()
  const jobId = data.idempotencyKey

  try {
    await queue.add('send-reminder', data, {
      jobId,
      delay: Math.max(0, delayMs), // BullMQ requires non-negative delay
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
    })

    log.info('Delayed email job enqueued', {
      jobId,
      invoiceId: data.invoiceId,
      stage: data.stage,
      delayMs,
      scheduledFor: new Date(Date.now() + delayMs).toISOString(),
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Job already exists')) {
      log.info('Delayed email job already exists (idempotent skip)', {
        jobId,
        invoiceId: data.invoiceId,
      })
      return
    }
    throw err
  }
}

/**
 * Cancel all pending email jobs for an invoice.
 * Called when an invoice is marked as paid.
 * 
 * Uses deterministic job IDs — no need to scan the queue.
 * O(1) per job, O(4) total per invoice.
 */
export async function cancelPendingEmailJobs(invoiceId: string): Promise<number> {
  const queue = getEmailQueue()
  let cancelled = 0

  for (const stage of [1, 2, 3, 4]) {
    const jobId = `email:${invoiceId}:stage:${stage}`
    try {
      const job = await queue.getJob(jobId)
      if (job) {
        const state = await job.getState()
        // Only remove jobs that haven't started processing
        if (state === 'delayed' || state === 'waiting') {
          await job.remove()
          cancelled++
          log.info('Cancelled pending email job', { jobId, invoiceId, stage, state })
        }
      }
    } catch (err) {
      log.warn('Failed to cancel email job', {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return cancelled
}
