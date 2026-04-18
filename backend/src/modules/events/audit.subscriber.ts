import { eventBus } from './event-bus'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type {
  InvoiceCreatedEvent,
  InvoicePaymentDueEvent,
  InvoiceOverdueEvent,
  InvoicePaidEvent,
} from './event-types'

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

  log.info('Audit subscribers registered')
}
