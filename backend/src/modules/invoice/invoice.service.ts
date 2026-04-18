import { prisma } from '@/lib/prisma'
import { eventBus } from '@/modules/events/event-bus'
import { logger } from '@/lib/logger'
import { Prisma, ChasingProfile, ContactChannel } from '@prisma/client'

const log = logger.child({ module: 'invoice-service' })

/**
 * Invoice Service — the only place where invoice mutations happen.
 * 
 * Every mutation emits an event. The invoice module has ZERO knowledge
 * of email sending or queues — it only knows about events.
 * This is the core of the clean architecture separation.
 */

interface CreateInvoiceData {
  userId: string
  clientId?: string | null
  clientName: string
  clientEmail: string
  amount: number
  dueDate: Date
  description?: string | null
  whatsappNumber?: string | null
  smsNumber?: string | null
  chasingProfile?: string
  contactChannel?: string
  reminderTone?: string
  chaseUntilPaid?: boolean
}

/**
 * Create a new invoice and emit invoice.created event.
 * The event triggers downstream scheduling of reminders.
 */
export async function createInvoice(data: CreateInvoiceData) {
  const invoice = await prisma.invoice.create({
    data: {
      userId: data.userId,
      clientId: data.clientId || null,
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      amount: new Prisma.Decimal(data.amount.toFixed(2)),
      dueDate: data.dueDate,
      description: data.description || null,
      whatsappNumber: data.whatsappNumber || null,
      smsNumber: data.smsNumber || null,
      chasingProfile: (data.chasingProfile as ChasingProfile) || ChasingProfile.NORMAL,
      contactChannel: (data.contactChannel as ContactChannel) || ContactChannel.EMAIL,
      reminderTone: (data.reminderTone as any) || 'PROFESSIONAL',
      chaseUntilPaid: data.chaseUntilPaid || false,
      paymentLink: {
        create: {}
      }
    },
    include: {
      paymentLink: true
    }
  })

  log.info('Invoice created', { invoiceId: invoice.id, userId: data.userId })

  // Fire event — notification module will handle scheduling
  const amount = invoice.amount instanceof Prisma.Decimal
    ? invoice.amount.toNumber()
    : Number(invoice.amount)

  eventBus.emit('invoice.created', {
    invoiceId: invoice.id,
    userId: invoice.userId,
    clientEmail: invoice.clientEmail,
    clientName: invoice.clientName,
    amount,
    dueDate: invoice.dueDate,
    whatsappNumber: invoice.whatsappNumber,
    smsNumber: invoice.smsNumber,
    chasingProfile: invoice.chasingProfile,
    contactChannel: invoice.contactChannel,
    paymentLinkToken: invoice.paymentLink?.token,
    reminderTone: invoice.reminderTone,
    chaseUntilPaid: invoice.chaseUntilPaid,
    chaseIntervalDays: invoice.chaseIntervalDays,
  })

  return invoice
}

/**
 * Mark an invoice as paid.
 * 
 * Uses atomic update with status check to prevent race conditions:
 * only transitions UNPAID → PAID. If the invoice is already paid,
 * updateMany returns count=0 and we skip the event.
 * 
 * Emitting invoice.paid triggers cancellation of ALL pending
 * reminder and overdue-check jobs for this invoice.
 */
export async function markInvoiceAsPaid(invoiceId: string, userId: string) {
  // Atomic transition: only update if currently UNPAID
  const result = await prisma.invoice.updateMany({
    where: {
      id: invoiceId,
      userId,
      status: 'UNPAID',
    },
    data: {
      status: 'PAID',
      reminderStage: 0,
      updatedAt: new Date(),
    },
  })

  if (result.count === 0) {
    log.info('Invoice already paid or not found', { invoiceId, userId })
    return null
  }

  log.info('Invoice marked as paid', { invoiceId, userId })

  // Fire event — notification module cancels pending jobs
  eventBus.emit('invoice.paid', { invoiceId, userId })

  // Return updated invoice
  return prisma.invoice.findUnique({ where: { id: invoiceId } })
}

/**
 * Mark an invoice as unpaid (reopen).
 * Does NOT re-schedule reminders — that requires creating a new invoice
 * or manually triggering via admin action to prevent accidental reminder storms.
 *
 * Uses updateMany with userId to prevent unauthorized access (IDOR protection).
 */
export async function markInvoiceAsUnpaid(invoiceId: string, userId: string) {
  const result = await prisma.invoice.updateMany({
    where: {
      id: invoiceId,
      userId,
      status: 'PAID',
    },
    data: {
      status: 'UNPAID',
      // Preserve reminderStage — don't restart from 0
    },
  })

  if (result.count === 0) {
    log.info('Invoice already unpaid or not found', { invoiceId, userId })
    return null
  }

  log.info('Invoice marked as unpaid', { invoiceId, userId })
  return prisma.invoice.findUnique({ where: { id: invoiceId } })
}

/**
 * Delete an invoice safely.
 *
 * IMPORTANT: Emits invoice.paid event BEFORE deletion to cancel all
 * pending BullMQ jobs (email, SMS, WhatsApp, overdue checks). Without
 * this, orphaned jobs would fire on deleted invoices, causing errors
 * and wasted retries in WhatsApp/SMS workers.
 */
export async function deleteInvoice(invoiceId: string, userId: string) {
  // Verify ownership
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
  })

  if (!invoice) {
    return null
  }

  // Cancel all pending jobs by emitting the paid event
  // (the notification subscriber handles cancellation across all queues)
  if (invoice.status === 'UNPAID') {
    try {
      eventBus.emit('invoice.paid', { invoiceId, userId })
    } catch (err) {
      log.error('Failed to emit cleanup event before deletion', { invoiceId, error: err })
    }
  }

  // Delete the invoice (cascade deletes ReminderLogs via schema)
  await prisma.invoice.delete({ where: { id: invoiceId } })

  log.info('Invoice deleted with job cleanup', { invoiceId, userId })
  return invoice
}

/**
 * Get paginated invoices with optional filters.
 */
export async function getInvoices(userId: string, options: { page: number; limit: number; statusFilter?: string; search?: string }) {
  const skip = (options.page - 1) * options.limit

  let statusCondition: any = {}
  if (options.statusFilter === 'PAID') {
    statusCondition = { status: 'PAID' }
  } else if (options.statusFilter === 'UNPAID') {
    statusCondition = { status: 'UNPAID' }
  } else if (options.statusFilter === 'OVERDUE') {
    statusCondition = {
      status: 'UNPAID',
      dueDate: { lt: new Date() },
    }
  } else if (options.statusFilter === 'PENDING') {
    statusCondition = {
      status: 'UNPAID',
      dueDate: { gte: new Date() },
    }
  }

  const searchCondition = options.search
    ? {
        OR: [
          { clientName: { contains: options.search, mode: 'insensitive' as const } },
          { clientEmail: { contains: options.search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where: { userId, ...statusCondition, ...searchCondition },
      orderBy: { createdAt: 'desc' },
      skip,
      take: options.limit,
    }),
    prisma.invoice.count({
      where: { userId, ...statusCondition, ...searchCondition },
    }),
  ])

  return { invoices, total }
}

/**
 * Get an invoice by ID with reminder logs.
 */
export async function getInvoiceById(id: string, userId: string) {
  return prisma.invoice.findFirst({
    where: { id, userId },
    include: {
      reminderLogs: {
        orderBy: { sentAt: 'desc' },
        take: 10,
      },
    },
  })
}

/**
 * Update non-status details of an invoice.
 */
export async function updateInvoiceDetails(id: string, userId: string, updateData: Record<string, any>) {
  return prisma.invoice.update({
    where: { id },
    data: updateData,
  })
}
