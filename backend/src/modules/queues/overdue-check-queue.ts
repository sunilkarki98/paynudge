import { createQueue } from '@/infrastructure/queue'
import { QUEUE_NAMES } from './queue-names'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'overdue-check-queue' })

/**
 * Overdue check job payload.
 * These jobs are scheduled at invoice creation time for each overdue checkpoint.
 * When processed, they check if the invoice is still unpaid and emit overdue events.
 */
export interface OverdueCheckJobData {
  invoiceId: string
  userId: string
  clientEmail: string
  clientName: string
  amount: number
  dueDate: string // ISO string
  daysOverdue: number // 3, 7, or 14
  stage: number       // 2, 3, or 4
  contactChannel: string
  whatsappNumber?: string | null
  smsNumber?: string | null
  paymentLinkToken?: string
  reminderTone: string
  chaseUntilPaid: boolean
  chaseIntervalDays: number
}

/**
 * Get or create the overdue check queue singleton.
 */
export function getOverdueCheckQueue() {
  return createQueue(QUEUE_NAMES.OVERDUE_CHECK)
}

/**
 * Calculate the optimal delivery time based on behavioral psychology.
 * Avoids Friday evenings and weekends, pushing the delivery to Tuesday 10:00 AM.
 */
export function calculateOptimalDeliveryTime(targetDate: Date): Date {
  const date = new Date(targetDate)
  const day = date.getUTCDay() // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hours = date.getUTCHours()

  let shiftDays = 0

  if (day === 5 && hours >= 17) {
    // Friday after 5 PM UTC -> shift 4 days to Tuesday
    shiftDays = 4
  } else if (day === 6) {
    // Saturday -> shift 3 days to Tuesday
    shiftDays = 3
  } else if (day === 0) {
    // Sunday -> shift 2 days to Tuesday
    shiftDays = 2
  }

  if (shiftDays > 0) {
    date.setUTCDate(date.getUTCDate() + shiftDays)
    date.setUTCHours(10, 0, 0, 0) // 10:00 AM UTC
  }

  return date
}

/**
 * Schedule overdue check jobs for an invoice.
 * Called once on invoice creation.
 * 
 * Schedules 3 delayed jobs:
 *  - dueDate + 3 days → stage 2 (polite follow-up)
 *  - dueDate + 7 days → stage 3 (firm reminder)
 *  - dueDate + 14 days → stage 4 (final notice)
 * 
 * Job IDs are deterministic for idempotency and cancellation.
 */
export async function scheduleOverdueChecks(data: {
  invoiceId: string
  userId: string
  clientEmail: string
  clientName: string
  amount: number
  dueDate: Date
  chasingProfile: string
  contactChannel: string
  whatsappNumber?: string | null
  smsNumber?: string | null
  paymentLinkToken?: string
  reminderTone: string
  chaseUntilPaid: boolean
  chaseIntervalDays: number
  customIntervals?: any
}): Promise<void> {
  const queue = getOverdueCheckQueue()

  let checkpoints: { daysOverdue: number; stage: number }[] = []
  
  if (data.customIntervals && typeof data.customIntervals === 'object') {
    const { stage2Days, stage3Days, stage4Days } = data.customIntervals
    checkpoints = [
      { daysOverdue: Number(stage2Days) || 3, stage: 2 },
      { daysOverdue: Number(stage3Days) || 7, stage: 3 },
      { daysOverdue: Number(stage4Days) || 14, stage: 4 },
    ]
  } else {
    if (data.chasingProfile === 'STRICT') {
      checkpoints = [
        { daysOverdue: 1, stage: 2 },
        { daysOverdue: 3, stage: 3 },
        { daysOverdue: 5, stage: 4 },
      ]
    } else if (data.chasingProfile === 'RELAXED') {
      checkpoints = [
        { daysOverdue: 7, stage: 2 },
        { daysOverdue: 14, stage: 3 },
        { daysOverdue: 30, stage: 4 },
      ]
    } else {
      // defaults to NORMAL
      checkpoints = [
        { daysOverdue: -3, stage: 0 }, // Pre-Due Risk Alert
        { daysOverdue: 3, stage: 2 },
        { daysOverdue: 7, stage: 3 },
        { daysOverdue: 14, stage: 4 },
      ]
    }
  }

  // Ensure all custom profiles get the Pre-Due check if missing
  if (!checkpoints.some((c) => c.daysOverdue === -3)) {
    checkpoints.unshift({ daysOverdue: -3, stage: 0 })
  }

  for (const checkpoint of checkpoints) {
    const jobId = `overdue:${data.invoiceId}:day:${checkpoint.daysOverdue}`
    let targetTime = new Date(data.dueDate.getTime() + checkpoint.daysOverdue * 24 * 60 * 60 * 1000)
    
    // Apply Smart Scheduling
    targetTime = calculateOptimalDeliveryTime(targetTime)
    
    const delayMs = Math.max(0, targetTime.getTime() - Date.now())

    try {
      await queue.add(
        'check-overdue',
        {
          invoiceId: data.invoiceId,
          userId: data.userId,
          clientEmail: data.clientEmail,
          clientName: data.clientName,
          amount: data.amount,
          dueDate: data.dueDate.toISOString(),
          daysOverdue: checkpoint.daysOverdue,
          stage: checkpoint.stage,
          contactChannel: data.contactChannel,
          whatsappNumber: data.whatsappNumber || null,
          smsNumber: data.smsNumber || null,
          paymentLinkToken: data.paymentLinkToken,
          reminderTone: data.reminderTone,
          chaseUntilPaid: data.chaseUntilPaid,
          chaseIntervalDays: data.chaseIntervalDays,
        } satisfies OverdueCheckJobData,
        {
          jobId,
          delay: delayMs,
          attempts: 3, // Fewer retries — checking is cheap
          backoff: {
            type: 'exponential',
            delay: 10_000,
          },
        }
      )

      log.info('Overdue check scheduled', {
        jobId,
        invoiceId: data.invoiceId,
        daysOverdue: checkpoint.daysOverdue,
        stage: checkpoint.stage,
        scheduledFor: targetTime.toISOString(),
      })
    } catch (err) {
      if (err instanceof Error && err.message.includes('Job already exists')) {
        log.info('Overdue check already scheduled (idempotent skip)', {
          jobId,
          invoiceId: data.invoiceId,
        })
        continue
      }
      throw err
    }
  }
}

/**
 * Schedule a single recurring check job (used for "chase until paid").
 * Emits a stage 5+ check.
 */
export async function scheduleRecurringCheck(data: OverdueCheckJobData, newDaysOverdue: number): Promise<void> {
  const queue = getOverdueCheckQueue()
  
  const jobId = `overdue:${data.invoiceId}:day:${newDaysOverdue}:recurring`
  // We calculate delay from current time + interval days
  let targetTime = new Date(new Date(data.dueDate).getTime() + newDaysOverdue * 24 * 60 * 60 * 1000)
  
  // Apply Smart Scheduling
  targetTime = calculateOptimalDeliveryTime(targetTime)
  
  const delayMs = Math.max(0, targetTime.getTime() - Date.now())

  try {
    await queue.add(
      'check-overdue',
      {
        ...data,
        daysOverdue: newDaysOverdue,
        stage: data.stage + 1, // Keep incrementing stage to track how many times chased
      },
      {
        jobId,
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
      }
    )
    log.info('Recurring overdue check scheduled', { jobId, invoiceId: data.invoiceId, newDaysOverdue, scheduledFor: targetTime.toISOString() })
  } catch (err) {
    if (err instanceof Error && err.message.includes('Job already exists')) {
      return
    }
    throw err
  }
}

/**
 * Cancel all pending overdue check jobs for an invoice.
 * Called when an invoice is marked as paid.
 */
export async function cancelPendingOverdueChecks(invoiceId: string): Promise<number> {
  const queue = getOverdueCheckQueue()
  let cancelled = 0

  // Cancel across all possible checkpoint configurations
  for (const day of [-3, 1, 3, 5, 7, 14, 30]) {
    const jobId = `overdue:${invoiceId}:day:${day}`
    try {
      const job = await queue.getJob(jobId)
      if (job) {
        const state = await job.getState()
        if (state === 'delayed' || state === 'waiting') {
          await job.remove()
          cancelled++
          log.info('Cancelled pending overdue check', { jobId, invoiceId, day, state })
        }
      }
    } catch (err) {
      log.warn('Failed to cancel overdue check', {
        jobId,
        invoiceId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return cancelled
}
