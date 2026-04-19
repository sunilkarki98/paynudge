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
  return prisma.$transaction(async (tx) => {
    let clientId = data.clientId

    // Ensure orphan invoices are linked by upserting the client record automatically
    if (!clientId) {
      const client = await tx.client.upsert({
        where: {
          userId_email: {
            userId: data.userId,
            email: data.clientEmail,
          }
        },
        update: {
          name: data.clientName,
        },
        create: {
          userId: data.userId,
          name: data.clientName,
          email: data.clientEmail,
        }
      })
      clientId = client.id
    }

    const invoice = await tx.invoice.create({
      data: {
        userId: data.userId,
        clientId: clientId || null,
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

    const user = await tx.user.findUnique({
      where: { id: data.userId },
      select: { customIntervals: true }
    })

    log.info('Invoice created', { invoiceId: invoice.id, userId: data.userId })

    // Fire event — write to transactional outbox
    const payload = {
      invoiceId: invoice.id,
      userId: invoice.userId,
      clientEmail: invoice.clientEmail,
      clientName: invoice.clientName,
      amount: invoice.amount.toString(), // Preserve decimal precision
      dueDate: invoice.dueDate,
      whatsappNumber: invoice.whatsappNumber,
      smsNumber: invoice.smsNumber,
      chasingProfile: invoice.chasingProfile,
      contactChannel: invoice.contactChannel,
      paymentLinkToken: invoice.paymentLink?.token,
      reminderTone: invoice.reminderTone,
      chaseUntilPaid: invoice.chaseUntilPaid,
      chaseIntervalDays: invoice.chaseIntervalDays,
      customIntervals: user?.customIntervals,
    }

    await tx.outboxEvent.create({
      data: {
        eventType: 'invoice.created',
        payload: payload as any,
      }
    })

    return invoice
  })
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
  return prisma.$transaction(async (tx) => {
    // Atomic transition: only update if currently UNPAID
    const result = await tx.invoice.updateMany({
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

    // Fire event — write to transactional outbox
    await tx.outboxEvent.create({
      data: {
        eventType: 'invoice.paid',
        payload: { invoiceId, userId },
      }
    })

    // Return updated invoice
    return tx.invoice.findUnique({ where: { id: invoiceId } })
  })
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
  return prisma.$transaction(async (tx) => {
    // Verify ownership
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, userId },
    })

    if (!invoice) {
      return null
    }

    // Cancel all pending jobs by emitting the paid event to outbox
    if (invoice.status === 'UNPAID') {
      try {
        await tx.outboxEvent.create({
          data: {
            eventType: 'invoice.paid',
            payload: { invoiceId, userId },
          }
        })
      } catch (err) {
        log.error('Failed to write cleanup event to outbox before deletion', { invoiceId, error: err })
      }
    }

    // Delete the invoice (cascade deletes ReminderLogs via schema)
    await tx.invoice.delete({ where: { id: invoiceId } })

    log.info('Invoice deleted with job cleanup', { invoiceId, userId })
    return invoice
  })
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

/**
 * Send a manual reminder for an invoice.
 * Directly calls email/SMS senders (bypasses BullMQ since it's user-initiated).
 */
export async function sendManualReminder(invoiceId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: { paymentLink: true },
    })

    if (!invoice) throw new Error('Invoice not found')
    if (invoice.status === 'PAID') throw new Error('Cannot send reminder for a paid invoice')

    const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)))
    const nextStage = Math.max(1, invoice.reminderStage + 1)

    const payload = {
      invoiceId: invoice.id,
      userId: invoice.userId,
      clientEmail: invoice.clientEmail,
      clientName: invoice.clientName,
      amount: invoice.amount.toString(),
      dueDate: invoice.dueDate,
      daysOverdue,
      stage: nextStage,
      contactChannel: invoice.contactChannel,
      whatsappNumber: invoice.whatsappNumber,
      smsNumber: invoice.smsNumber,
      paymentLinkToken: invoice.paymentLink?.token,
      reminderTone: invoice.reminderTone,
      chaseUntilPaid: invoice.chaseUntilPaid,
      chaseIntervalDays: invoice.chaseIntervalDays,
    }

    // Queue reminder using outbox
    await tx.outboxEvent.create({
      data: {
        eventType: 'invoice.overdue',
        payload: payload as any,
      }
    })

    // Create audit event
    await tx.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: 'manual_reminder_queued',
        metadata: { daysOverdue, stage: nextStage },
      },
    })

    log.info('Manual reminder queued', { invoiceId, nextStage })

    return { success: true, channels: [], errors: [], message: 'Reminder queued' }
  })
}

/**
 * Get full reminder history for an invoice, including tracking and audit events.
 */
export async function getReminderHistory(invoiceId: string, userId: string) {
  // Verify ownership
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    select: { id: true },
  })
  if (!invoice) return null

  const reminders = await prisma.reminderLog.findMany({
    where: { invoiceId },
    orderBy: { sentAt: 'desc' },
  })

  const trackings = await prisma.invoiceTracking.findMany({
    where: { invoiceId },
    orderBy: { createdAt: 'desc' },
  })

  const events = await prisma.invoiceEvent.findMany({
    where: { 
      invoiceId,
      eventType: {
        notIn: ['email_opened', 'link_clicked', 'payment_page_viewed']
      }
    },
    orderBy: { createdAt: 'desc' },
  })

  const unifiedHistory: any[] = []

  reminders.forEach((r) => unifiedHistory.push({ ...r, _type: 'reminder', _date: r.sentAt }))
  trackings.forEach((t) => unifiedHistory.push({ ...t, _type: 'tracking', _date: t.createdAt }))
  events.forEach((e) => unifiedHistory.push({ ...e, _type: 'event', _date: e.createdAt }))

  // Sort unified history by date descending
  unifiedHistory.sort((a, b) => b._date.getTime() - a._date.getTime())

  return unifiedHistory
}
