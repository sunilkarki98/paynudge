import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { Prisma, ChasingProfile, ContactChannel, InvoiceState } from '@prisma/client'
import { transitionInvoice } from './invoice.fsm'

const log = logger.child({ module: 'invoice-service' })

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
  behaviorType?: string | null
}

/**
 * Create a new invoice and emit invoice.created event.
 */
export async function createInvoice(data: CreateInvoiceData) {
  return prisma.$transaction(async (tx) => {
    let clientId = data.clientId

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
          behaviorType: data.behaviorType || undefined, // Update behavior if provided
        },
        create: {
          userId: data.userId,
          name: data.clientName,
          email: data.clientEmail,
          behaviorType: data.behaviorType || null,
        }
      })
      clientId = client.id
    } else if (data.behaviorType) {
      // If clientId exists but behaviorType is provided, update the client
      await tx.client.update({
        where: { id: clientId },
        data: { behaviorType: data.behaviorType }
      })
    }

    const invoice = await tx.invoice.create({
      data: {
        userId: data.userId,
        clientId: clientId || null,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        amount: new Prisma.Decimal(data.amount.toFixed(2)),
        balance: new Prisma.Decimal(data.amount.toFixed(2)), // Initial balance = amount
        state: 'DRAFT' as InvoiceState, // Start in DRAFT
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

    log.info('Invoice created in DRAFT state', { invoiceId: invoice.id, userId: data.userId })

    // Note: Reminders are only scheduled when the invoice is "Published"
    // We will automatically publish it for now to match legacy behavior
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { 
        state: 'PENDING',
        lastStateChangeAt: new Date(),
        stateMetadata: { reason: 'Initial publishing' }
      }
    })

    await tx.outboxEvent.create({
      data: {
        eventType: 'invoice.created',
        payload: {
          invoiceId: invoice.id,
          userId: invoice.userId,
          clientEmail: invoice.clientEmail,
          clientName: invoice.clientName,
          amount: invoice.amount.toString(),
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
        } as any,
      }
    })

    return invoice
  })
}

/**
 * Mark an invoice as paid.
 * Atomic transition to PAID.
 */
export async function markInvoiceAsPaid(invoiceId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        userId,
        state: { notIn: ['PAID', 'VOIDED', 'WRITTEN_OFF'] },
      },
      data: {
        status: 'PAID',
        state: 'PAID',
        balance: 0,
        reminderStage: 0,
        lastStateChangeAt: new Date(),
        updatedAt: new Date(),
        version: { increment: 1 },
      },
    })

    if (result.count === 0) return null

    log.info('Invoice marked as paid via FSM', { invoiceId, userId })

    await tx.outboxEvent.create({
      data: {
        eventType: 'invoice.paid',
        payload: { invoiceId, userId },
      }
    })

    return tx.invoice.findUnique({ where: { id: invoiceId } })
  })
}

/**
 * Handle a client opt-out (STOP command).
 */
export async function handleOptOut(invoiceId: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { client: true }
    })

    if (!invoice) return null

    // Call FSM
    const { nextState, sideEffect, reason } = transitionInvoice('OPT_OUT', {
      currentState: invoice.state,
      chasingProfile: invoice.chasingProfile,
      balance: Number(invoice.balance),
      amount: Number(invoice.amount),
    })

    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        state: nextState,
        lastStateChangeAt: new Date(),
        stateMetadata: { reason }
      }
    })

    // If FSM says cancel jobs, emit the paid event (which acts as a general cancel signal)
    if (sideEffect === 'CANCEL_JOBS') {
      await tx.outboxEvent.create({
        data: {
          eventType: 'invoice.paid',
          payload: { invoiceId, userId: invoice.userId },
        }
      })
    }

    return updated
  })
}

/**
 * Mark an invoice as unpaid (reopen).
 */
export async function markInvoiceAsUnpaid(invoiceId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUnique({ where: { id: invoiceId } })
    if (!existing) return null

    const result = await tx.invoice.updateMany({
      where: {
        id: invoiceId,
        userId,
        state: 'PAID',
      },
      data: {
        status: 'UNPAID',
        state: 'PENDING',
        balance: existing.amount,
        lastStateChangeAt: new Date(),
      },
    })

    if (result.count === 0) return null

    log.info('Invoice reopened to PENDING', { invoiceId, userId })
    return tx.invoice.findUnique({ where: { id: invoiceId } })
  })
}

/**
 * Delete an invoice safely.
 */
export async function deleteInvoice(invoiceId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, userId } })
    if (!invoice) return null

    if (invoice.state !== 'PAID') {
      await tx.outboxEvent.create({
        data: {
          eventType: 'invoice.paid',
          payload: { invoiceId, userId },
        }
      })
    }

    await tx.invoice.delete({ where: { id: invoiceId } })
    return invoice
  })
}

/**
 * Get paginated invoices with state-aware filters.
 */
export async function getInvoices(userId: string, options: { page: number; limit: number; statusFilter?: string; search?: string }) {
  const skip = (options.page - 1) * options.limit

  let filterCondition: any = {}
  if (options.statusFilter === 'PAID') {
    filterCondition = { state: 'PAID' }
  } else if (options.statusFilter === 'OVERDUE') {
    filterCondition = {
      OR: [
        { state: { startsWith: 'OVERDUE' } },
        { state: 'FINAL_NOTICE' }
      ]
    }
  } else if (options.statusFilter === 'PENDING') {
    filterCondition = {
      state: { in: ['PENDING', 'DUE_SOON', 'DUE', 'GRACE_PERIOD'] }
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
      where: { userId, ...filterCondition, ...searchCondition },
      orderBy: { createdAt: 'desc' },
      skip,
      take: options.limit,
    }),
    prisma.invoice.count({
      where: { userId, ...filterCondition, ...searchCondition },
    }),
  ])

  return { invoices, total }
}

export async function getInvoiceById(id: string, userId: string) {
  return prisma.invoice.findFirst({
    where: { id, userId },
    include: {
      reminderLogs: { orderBy: { sentAt: 'desc' }, take: 10 },
      aiMetadata: true
    },
  })
}

export async function updateInvoiceDetails(id: string, userId: string, updateData: Record<string, any>) {
  // Use updateMany with both id + userId to enforce ownership authorization.
  // prisma.update only accepts unique fields in WHERE — updateMany allows compound filters.
  const result = await prisma.invoice.updateMany({
    where: { id, userId },
    data: updateData,
  })

  if (result.count === 0) return null

  return prisma.invoice.findUnique({ where: { id } })
}

export async function sendManualReminder(invoiceId: string, userId: string, overrideChannels?: string[], customMessage?: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: { paymentLink: true },
    })

    if (!invoice) throw new Error('Invoice not found')
    if (invoice.state === 'PAID') throw new Error('Cannot send reminder for a paid invoice')

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
      overrideChannels,
      customMessage,
    }

    await tx.outboxEvent.create({
      data: {
        eventType: 'invoice.overdue',
        payload: payload as any,
      }
    })

    await tx.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: 'manual_reminder_queued',
        metadata: { daysOverdue, stage: nextStage },
      },
    })

    return { success: true, channels: [], errors: [], message: 'Reminder queued' }
  })
}

export async function getReminderHistory(invoiceId: string, userId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    select: { id: true },
  })
  if (!invoice) return null

  const [reminders, trackings, events] = await Promise.all([
    prisma.reminderLog.findMany({ where: { invoiceId }, orderBy: { sentAt: 'desc' } }),
    prisma.invoiceTracking.findMany({ where: { invoiceId }, orderBy: { createdAt: 'desc' } }),
    prisma.invoiceEvent.findMany({ 
      where: { invoiceId, eventType: { notIn: ['email_opened', 'link_clicked', 'payment_page_viewed'] } },
      orderBy: { createdAt: 'desc' } 
    })
  ])

  const unifiedHistory: any[] = [
    ...reminders.map(r => ({ ...r, _type: 'reminder', _date: r.sentAt })),
    ...trackings.map(t => ({ ...t, _type: 'tracking', _date: t.createdAt })),
    ...events.map(e => ({ ...e, _type: 'event', _date: e.createdAt }))
  ]

  return unifiedHistory.sort((a, b) => b._date.getTime() - a._date.getTime())
}
