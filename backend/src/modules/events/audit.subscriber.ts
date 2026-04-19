import { eventBus } from './event-bus'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type {
  InvoiceCreatedEvent,
  InvoicePaymentDueEvent,
  InvoiceOverdueEvent,
  InvoicePaidEvent,
  InvoicePredueWarningEvent,
  InvoiceTrackingEvent,
} from './event-types'
import { syncClientBehavior } from '../ai/client-behavior-profile'

const log = logger.child({ module: 'audit-subscriber' })

/**
 * Audit Subscriber — Listens to all domain events and persists them to the database
 * for the immutable audit trail feature.
 */

async function onInvoiceCreated(event: InvoiceCreatedEvent): Promise<void> {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: event.invoiceId,
      eventType: 'created',
      metadata: {
        amount: event.amount,
        dueDate: event.dueDate,
        contactChannel: event.contactChannel,
        chasingProfile: event.chasingProfile,
        chaseUntilPaid: event.chaseUntilPaid,
      },
    },
  })
}

async function onInvoicePaymentDue(event: InvoicePaymentDueEvent): Promise<void> {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: event.invoiceId,
      eventType: 'payment_due',
      metadata: {
        amount: event.amount,
        contactChannel: event.contactChannel,
      },
    },
  })
}

async function onInvoiceOverdue(event: InvoiceOverdueEvent): Promise<void> {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: event.invoiceId,
      eventType: 'overdue',
      metadata: {
        daysOverdue: event.daysOverdue,
        stage: event.stage,
        contactChannel: event.contactChannel,
      },
    },
  })
}

async function onInvoicePaid(event: InvoicePaidEvent): Promise<void> {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: event.invoiceId,
      eventType: 'paid',
      metadata: {
        userId: event.userId,
      },
    },
  })

  // Sync behavior asynchronously since this is a strong signal
  const invoice = await prisma.invoice.findUnique({ where: { id: event.invoiceId } })
  if (invoice?.clientId) {
    syncClientBehavior(invoice.clientId).catch(err => 
      log.error('Failed to sync behavior on paid event', { error: err.message })
    )
  }
}

async function onInvoiceTrackingEvent(event: InvoiceTrackingEvent): Promise<void> {
  // Sync behavior asynchronously to update engagement score
  const invoice = await prisma.invoice.findUnique({ where: { id: event.invoiceId } })
  if (invoice?.clientId) {
    syncClientBehavior(invoice.clientId).catch(err => 
      log.error('Failed to sync behavior on tracking event', { error: err.message })
    )
  }
}

async function onInvoicePredueWarning(event: InvoicePredueWarningEvent): Promise<void> {
  await prisma.invoiceEvent.create({
    data: {
      invoiceId: event.invoiceId,
      eventType: 'predue_warning',
      metadata: {
        clientName: event.clientName,
        dueDate: event.dueDate,
        behaviorType: event.behaviorType,
      },
    },
  })
}

/**
 * Register all audit event handlers.
 * Must be called once at application startup.
 */
export function registerAuditSubscribers(): void {
  eventBus.on('invoice.created', onInvoiceCreated)
  eventBus.on('invoice.payment_due', onInvoicePaymentDue)
  eventBus.on('invoice.overdue', onInvoiceOverdue)
  eventBus.on('invoice.paid', onInvoicePaid)
  eventBus.on('invoice.predue_warning', onInvoicePredueWarning)
  eventBus.on('invoice.tracking_event', onInvoiceTrackingEvent)

  log.info('Audit subscribers registered')
}
