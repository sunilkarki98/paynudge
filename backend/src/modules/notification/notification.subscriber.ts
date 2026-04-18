import { eventBus } from '@/modules/events/event-bus'
import {
  enqueueDelayedEmailJob,
  cancelPendingEmailJobs,
  type EmailJobData,
} from '@/modules/queues/email-queue'
import {
  scheduleOverdueChecks,
  cancelPendingOverdueChecks,
} from '@/modules/queues/overdue-check-queue'
import { logger } from '@/lib/logger'
import type {
  InvoiceCreatedEvent,
  InvoicePaymentDueEvent,
  InvoiceOverdueEvent,
  InvoicePaidEvent,
} from '@/modules/events/event-types'

const log = logger.child({ module: 'notification-subscriber' })

/**
 * Notification Subscriber — bridges events to queues.
 * 
 * This is the ONLY module that knows about both events AND queues.
 * The invoice module only knows about events.
 * The workers only know about queues.
 * 
 * This separation means:
 *  - Invoice logic doesn't know how/when emails are sent
 *  - Email workers don't know how they got their jobs
 *  - Changing notification timing only requires editing THIS file
 */

/**
 * Handle invoice.created:
 *  1. Schedule a delayed email for payment_due at dueDate
 *  2. Schedule overdue check jobs at +3d, +7d, +14d
 */
async function onInvoiceCreated(event: InvoiceCreatedEvent): Promise<void> {
  log.info('Handling invoice.created', { invoiceId: event.invoiceId })

  const dueDate = new Date(event.dueDate)
  // 1. Dispatch Payment Due Reminders according to contactChannel
  const delayMs = Math.max(0, dueDate.getTime() - Date.now())

  const shouldSendEmail = ['EMAIL', 'BOTH', 'EMAIL_AND_SMS', 'ALL'].includes(event.contactChannel)
  const shouldSendWhatsapp = ['WHATSAPP', 'BOTH', 'ALL'].includes(event.contactChannel)
  const shouldSendSms = ['SMS', 'EMAIL_AND_SMS', 'ALL'].includes(event.contactChannel)

  if (shouldSendEmail) {
    const emailData: EmailJobData = {
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientEmail: event.clientEmail,
      clientName: event.clientName,
      amount: event.amount,
      dueDate: dueDate.toISOString(),
      stage: 1,
      idempotencyKey: `email:${event.invoiceId}:stage:1`,
      daysOverdue: 0,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
    }
    await enqueueDelayedEmailJob(emailData, delayMs)
  }

  if (shouldSendWhatsapp && event.whatsappNumber) {
    const { enqueueDelayedWhatsAppJob } = await import('@/modules/queues/whatsapp-queue') // Dynamic import to prevent circular deps
    await enqueueDelayedWhatsAppJob({
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientName: event.clientName,
      whatsappNumber: event.whatsappNumber,
      amount: event.amount,
      dueDate: dueDate.toISOString(),
      stage: 1,
      daysOverdue: 0,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
      idempotencyKey: `whatsapp:${event.invoiceId}:stage:1`,
    }, delayMs)
  }

  if (shouldSendSms && event.smsNumber) {
    const { enqueueDelayedSMSJob } = await import('@/modules/queues/sms-queue')
    await enqueueDelayedSMSJob({
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientName: event.clientName,
      smsNumber: event.smsNumber,
      amount: event.amount,
      dueDate: dueDate.toISOString(),
      stage: 1,
      idempotencyKey: `sms:${event.invoiceId}:stage:1`,
      daysOverdue: 0,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
    }, delayMs)
  }

  // 2. Schedule overdue check jobs based on strict/normal/relaxed
  await scheduleOverdueChecks({
    invoiceId: event.invoiceId,
    userId: event.userId,
    clientEmail: event.clientEmail,
    clientName: event.clientName,
    amount: event.amount,
    dueDate,
    chasingProfile: event.chasingProfile,
    contactChannel: event.contactChannel,
    whatsappNumber: event.whatsappNumber,
    smsNumber: event.smsNumber,
    paymentLinkToken: event.paymentLinkToken,
    reminderTone: event.reminderTone,
    chaseUntilPaid: event.chaseUntilPaid,
    chaseIntervalDays: event.chaseIntervalDays,
  })

  log.info('All jobs scheduled for new invoice', {
    invoiceId: event.invoiceId,
    paymentDueIn: `${Math.round(delayMs / (1000 * 60 * 60))}h`,
  })
}

/**
 * Handle invoice.payment_due:
 * This event is fired when a due-date email job is processed.
 * The email job itself handles sending — this is just for logging/metrics.
 */
async function onInvoicePaymentDue(event: InvoicePaymentDueEvent): Promise<void> {
  log.info('Invoice payment due event received', {
    invoiceId: event.invoiceId,
    dueDate: event.dueDate.toISOString(),
  })
}

/**
 * Handle invoice.overdue:
 * Fired by the overdue-check worker when it discovers an invoice is still unpaid.
 * Enqueues an immediate email job for the appropriate stage.
 */
async function onInvoiceOverdue(event: InvoiceOverdueEvent): Promise<void> {
  log.info('Invoice overdue event received', {
    invoiceId: event.invoiceId,
    daysOverdue: event.daysOverdue,
    stage: event.stage,
  })

  // Dispatch Overdue Reminders based on preferred contact channel
  
  const shouldSendEmail = ['EMAIL', 'BOTH', 'EMAIL_AND_SMS', 'ALL'].includes(event.contactChannel)
  const shouldSendWhatsapp = ['WHATSAPP', 'BOTH', 'ALL'].includes(event.contactChannel)
  const shouldSendSms = ['SMS', 'EMAIL_AND_SMS', 'ALL'].includes(event.contactChannel)

  if (shouldSendEmail) {
    const emailData: EmailJobData = {
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientEmail: event.clientEmail,
      clientName: event.clientName,
      amount: event.amount,
      dueDate: new Date(event.dueDate).toISOString(),
      stage: event.stage,
      idempotencyKey: `email:${event.invoiceId}:stage:${event.stage}`,
      daysOverdue: event.daysOverdue,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
    }
    const { enqueueEmailJob } = await import('@/modules/queues/email-queue')
    await enqueueEmailJob(emailData)
  }

  if (shouldSendWhatsapp && event.whatsappNumber) {
    const { enqueueWhatsAppJob } = await import('@/modules/queues/whatsapp-queue')
    await enqueueWhatsAppJob({
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientName: event.clientName,
      whatsappNumber: event.whatsappNumber,
      amount: event.amount,
      dueDate: new Date(event.dueDate).toISOString(),
      stage: event.stage,
      daysOverdue: event.daysOverdue,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
      idempotencyKey: `whatsapp:${event.invoiceId}:stage:${event.stage}`,
    })
  }

  if (shouldSendSms && event.smsNumber) {
    const { enqueueSMSJob } = await import('@/modules/queues/sms-queue')
    await enqueueSMSJob({
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientName: event.clientName,
      smsNumber: event.smsNumber,
      amount: event.amount,
      dueDate: new Date(event.dueDate).toISOString(),
      stage: event.stage,
      idempotencyKey: `sms:${event.invoiceId}:stage:${event.stage}`,
      daysOverdue: event.daysOverdue,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
    })
  }
}

/**
 * Handle invoice.paid:
 * Cancel ALL pending reminder and overdue-check jobs for this invoice.
 * This is the key advantage over cron — instant cancellation, no wasted work.
 */
async function onInvoicePaid(event: InvoicePaidEvent): Promise<void> {
  log.info('Invoice paid — cancelling all pending jobs', {
    invoiceId: event.invoiceId,
  })

  // Import WhatsApp and SMS queues directly just to cancel
  const { cancelPendingWhatsAppJobs } = await import('@/modules/queues/whatsapp-queue')
  const { cancelPendingSMSJobs } = await import('@/modules/queues/sms-queue')

  const [emailsCancelled, overdueChecksCancelled, whatsappCancelled, smsCancelled] = await Promise.all([
    cancelPendingEmailJobs(event.invoiceId),
    cancelPendingOverdueChecks(event.invoiceId),
    cancelPendingWhatsAppJobs(event.invoiceId),
    cancelPendingSMSJobs(event.invoiceId),
  ])

  log.info('Pending jobs cancelled for paid invoice', {
    invoiceId: event.invoiceId,
    emailsCancelled,
    overdueChecksCancelled,
    whatsappCancelled,
    smsCancelled
  })
}

/**
 * Register all notification event handlers.
 * Must be called once at application startup.
 */
export function registerNotificationSubscribers(): void {
  eventBus.on('invoice.created', onInvoiceCreated)
  eventBus.on('invoice.payment_due', onInvoicePaymentDue)
  eventBus.on('invoice.overdue', onInvoiceOverdue)
  eventBus.on('invoice.paid', onInvoicePaid)

  log.info('Notification subscribers registered')
}
