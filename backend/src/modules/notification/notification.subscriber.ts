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
 * Shared utility to cancel all pending background jobs for an invoice.
 * Used when an invoice is Paid, Voided, Disputed, or has a pending payment verification.
 */
async function stopReminders(invoiceId: string): Promise<void> {
  log.info('Stopping all reminders for invoice', { invoiceId })

  // Dynamic imports for queues to prevent circular dependencies
  const { cancelPendingWhatsAppJobs } = await import('@/modules/queues/whatsapp-queue')
  const { cancelPendingSMSJobs } = await import('@/modules/queues/sms-queue')

  const [emails, overdue, whatsapp, sms] = await Promise.all([
    cancelPendingEmailJobs(invoiceId),
    cancelPendingOverdueChecks(invoiceId),
    cancelPendingWhatsAppJobs(invoiceId),
    cancelPendingSMSJobs(invoiceId),
  ])

  log.info('Jobs cancelled successfully', { invoiceId, emails, overdue, whatsapp, sms })
}

/**
 * Handle invoice.created:
 *  1. Schedule a delayed email for payment_due at dueDate
 *  2. Schedule overdue check jobs
 */
async function onInvoiceCreated(event: InvoiceCreatedEvent): Promise<void> {
  log.info('Handling invoice.created', { invoiceId: event.invoiceId })

  const dueDate = new Date(event.dueDate)
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
      amount: Number(event.amount),
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
    const { enqueueDelayedWhatsAppJob } = await import('@/modules/queues/whatsapp-queue')
    await enqueueDelayedWhatsAppJob({
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientName: event.clientName,
      whatsappNumber: event.whatsappNumber,
      amount: Number(event.amount),
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
      amount: Number(event.amount),
      dueDate: dueDate.toISOString(),
      stage: 1,
      idempotencyKey: `sms:${event.invoiceId}:stage:1`,
      daysOverdue: 0,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
    }, delayMs)
  }

  await scheduleOverdueChecks({
    invoiceId: event.invoiceId,
    userId: event.userId,
    clientEmail: event.clientEmail,
    clientName: event.clientName,
    amount: Number(event.amount),
    dueDate,
    chasingProfile: event.chasingProfile,
    contactChannel: event.contactChannel,
    whatsappNumber: event.whatsappNumber,
    smsNumber: event.smsNumber,
    paymentLinkToken: event.paymentLinkToken,
    reminderTone: event.reminderTone,
    chaseUntilPaid: event.chaseUntilPaid,
    chaseIntervalDays: event.chaseIntervalDays,
    customIntervals: event.customIntervals,
  })
}

/**
 * Handle invoice.overdue:
 * Fired by the overdue-check worker via FSM.
 */
async function onInvoiceOverdue(event: InvoiceOverdueEvent): Promise<void> {
  log.info('Invoice overdue event received', {
    invoiceId: event.invoiceId,
    daysOverdue: event.daysOverdue,
    stage: event.stage,
  })
  
  const shouldSendEmail = event.overrideChannels
    ? event.overrideChannels.includes('EMAIL')
    : ['EMAIL', 'BOTH', 'EMAIL_AND_SMS', 'ALL'].includes(event.contactChannel)
    
  const shouldSendWhatsapp = event.overrideChannels
    ? event.overrideChannels.includes('WHATSAPP')
    : ['WHATSAPP', 'BOTH', 'ALL'].includes(event.contactChannel)
    
  const shouldSendSms = event.overrideChannels
    ? event.overrideChannels.includes('SMS')
    : ['SMS', 'EMAIL_AND_SMS', 'ALL'].includes(event.contactChannel)

  if (shouldSendEmail) {
    const emailData: EmailJobData = {
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientEmail: event.clientEmail,
      clientName: event.clientName,
      amount: Number(event.amount),
      dueDate: new Date(event.dueDate).toISOString(),
      stage: event.stage,
      idempotencyKey: `email:${event.invoiceId}:stage:${event.stage}`,
      daysOverdue: event.daysOverdue,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
      customMessage: event.customMessage,
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
      amount: Number(event.amount),
      dueDate: new Date(event.dueDate).toISOString(),
      stage: event.stage,
      daysOverdue: event.daysOverdue,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
      idempotencyKey: `whatsapp:${event.invoiceId}:stage:${event.stage}`,
      customMessage: event.customMessage,
    })
  }

  if (shouldSendSms && event.smsNumber) {
    const { enqueueSMSJob } = await import('@/modules/queues/sms-queue')
    await enqueueSMSJob({
      invoiceId: event.invoiceId,
      userId: event.userId,
      clientName: event.clientName,
      smsNumber: event.smsNumber,
      amount: Number(event.amount),
      dueDate: new Date(event.dueDate).toISOString(),
      stage: event.stage,
      idempotencyKey: `sms:${event.invoiceId}:stage:${event.stage}`,
      daysOverdue: event.daysOverdue,
      paymentLinkToken: event.paymentLinkToken,
      reminderTone: event.reminderTone,
      customMessage: event.customMessage,
    })
  }
}

/**
 * Handle termination events (Paid, Voided, Disputed, etc.)
 */
async function onInvoiceTermination(event: InvoicePaidEvent): Promise<void> {
  await stopReminders(event.invoiceId)
}

/**
 * Register all notification event handlers.
 */
export function registerNotificationSubscribers(): void {
  eventBus.on('invoice.created', onInvoiceCreated)
  eventBus.on('invoice.overdue', onInvoiceOverdue)
  
  // All these events lead to stopping automated reminders
  eventBus.on('invoice.paid', onInvoiceTermination)
  eventBus.on('invoice.voided', onInvoiceTermination)
  eventBus.on('invoice.disputed', onInvoiceTermination)
  eventBus.on('invoice.unverified_payment', onInvoiceTermination)

  log.info('Notification subscribers registered with FSM support')
}
