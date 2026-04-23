import { Request, Response } from 'express'
import { prisma } from '@/lib/prisma'
import { createInvoiceSchema, updateInvoiceSchema, paginationSchema, validateBody } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { Prisma, InvoiceState } from '@prisma/client'
import { 
  createInvoice, 
  markInvoiceAsPaid, 
  markInvoiceAsUnpaid, 
  deleteInvoice,
  getInvoices as getInvoicesService,
  getInvoiceById,
  updateInvoiceDetails,
  sendManualReminder,
  getReminderHistory
} from '@/modules/invoice/invoice.service'

const log = logger.child({ module: 'invoice-controller' })

// ─── GET /api/invoices ───────────────────────────────────

export async function getInvoices(req: Request, res: Response): Promise<void> {
  try {
    const pagination = validateBody(paginationSchema, req.query)
    if (!pagination.success) {
      res.status(400).json({ error: pagination.error })
      return
    }

    const { page, limit } = pagination.data
    const statusFilter = (req.query.status as string)?.toUpperCase()
    const search = req.query.search as string

    const { invoices, total } = await getInvoicesService(req.user!.userId, {
      page,
      limit,
      statusFilter,
      search
    })

    res.json({
      data: invoices,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    log.error('Get invoices error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── POST /api/invoices ──────────────────────────────────

export async function createInvoiceHandler(req: Request, res: Response): Promise<void> {
  try {
    const validation = validateBody(createInvoiceSchema, req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }

    const { clientName, clientEmail, amount, dueDate, description, clientId } = validation.data

    let finalWhatsapp = validation.data.whatsappNumber || null
    let finalSms = validation.data.smsNumber || null
    let finalChasing = validation.data.chasingProfile || 'NORMAL'
    let finalContact = validation.data.contactChannel || 'EMAIL'

    // If client is linked, inherit their smart chasing config
    if (clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId } })
      if (client) {
        finalWhatsapp = client.whatsappNumber
        finalSms = client.smsNumber
        finalChasing = client.chasingProfile
        finalContact = client.contactChannel
      }
    }

    const invoice = await createInvoice({
      userId: req.user!.userId,
      clientId: clientId ? String(clientId) : null,
      clientName,
      clientEmail,
      amount,
      dueDate: new Date(dueDate),
      description: description || null,
      whatsappNumber: finalWhatsapp,
      smsNumber: finalSms,
      chasingProfile: finalChasing,
      contactChannel: finalContact,
      behaviorType: validation.data.behaviorType, // Pass behavior type
    })

    res.status(201).json(invoice)
  } catch (error) {
    log.error('Create invoice error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── GET /api/invoices/:id ───────────────────────────────

export async function getInvoice(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const invoice = await getInvoiceById(id, req.user!.userId)

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }

    res.json(invoice)
  } catch (error) {
    log.error('Get invoice error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── PUT /api/invoices/:id ───────────────────────────────

export async function updateInvoice(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string

    const existing = await getInvoiceById(id, req.user!.userId)

    if (!existing) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }

    const validation = validateBody(updateInvoiceSchema, req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }

    const data = validation.data

    // Handle status transitions via the service (which emits events)
    if (data.status !== undefined && data.status !== existing.status) {
      if (data.status === 'PAID') {
        const paidInvoice = await markInvoiceAsPaid(id, req.user!.userId)
        if (!paidInvoice) {
          res.status(409).json({ error: 'Invoice already paid' })
          return
        }

        // Apply other field updates after status change
        const otherUpdates: Record<string, unknown> = {}
        if (data.clientName !== undefined) otherUpdates.clientName = data.clientName
        if (data.clientEmail !== undefined) otherUpdates.clientEmail = data.clientEmail
        if (data.amount !== undefined) otherUpdates.amount = new Prisma.Decimal(data.amount.toFixed(2))
        if (data.dueDate !== undefined) otherUpdates.dueDate = new Date(data.dueDate)
        if (data.description !== undefined) otherUpdates.description = data.description

        if (Object.keys(otherUpdates).length > 0) {
          const invoice = await updateInvoiceDetails(id, req.user!.userId, otherUpdates)
          res.json(invoice)
          return
        }

        res.json(paidInvoice)
        return
      }

      if (data.status === 'UNPAID') {
        const unpaidInvoice = await markInvoiceAsUnpaid(id, req.user!.userId)
        if (!unpaidInvoice) {
          res.status(409).json({ error: 'Invoice already unpaid or not found' })
          return
        }
      }
    }

    // For non-status updates
    const updateData: Record<string, unknown> = {}
    if (data.clientName !== undefined) updateData.clientName = data.clientName
    if (data.clientEmail !== undefined) updateData.clientEmail = data.clientEmail
    if (data.amount !== undefined) updateData.amount = new Prisma.Decimal(data.amount.toFixed(2))
    if (data.dueDate !== undefined) updateData.dueDate = new Date(data.dueDate)
    if (data.description !== undefined) updateData.description = data.description
    if (data.status !== undefined) updateData.status = data.status
    if (data.state !== undefined) {
      // Validate state against the InvoiceState enum to prevent arbitrary strings
      const validStates = Object.values(InvoiceState) as string[]
      if (!validStates.includes(data.state)) {
        res.status(400).json({ error: `Invalid state: ${data.state}. Must be one of: ${validStates.join(', ')}` })
        return
      }
      updateData.state = data.state
      updateData.lastStateChangeAt = new Date()
      updateData.stateMetadata = { reason: 'Manual override via dashboard' }
    }

    if (Object.keys(updateData).length > 0) {
      const invoice = await updateInvoiceDetails(id, req.user!.userId, updateData)
      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' })
        return
      }
      log.info('Invoice updated', { invoiceId: id, changes: Object.keys(updateData) })
      res.json(invoice)
      return
    }

    res.json(existing)
  } catch (error) {
    log.error('Update invoice error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── DELETE /api/invoices/:id ────────────────────────────

export async function deleteInvoiceHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const deleted = await deleteInvoice(id, req.user!.userId)

    if (!deleted) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }

    res.json({ message: 'Invoice deleted' })
  } catch (error) {
    log.error('Delete invoice error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── POST /api/invoices/:id/remind ──────────────────────

export async function sendReminderHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const { overrideChannels, customMessage } = req.body || {}
    const result = await sendManualReminder(id, req.user!.userId, overrideChannels, customMessage)

    if (!result.success) {
      res.status(500).json({
        error: 'Failed to queue reminder',
        details: result.errors,
      })
      return
    }

    res.status(202).json({
      success: true,
      message: result.message,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    log.error('Send reminder error', { error: message })

    if (message === 'Invoice not found') {
      res.status(404).json({ error: message })
      return
    }
    if (message.includes('paid invoice')) {
      res.status(400).json({ error: message })
      return
    }

    res.status(500).json({ error: message })
  }
}

// ─── GET /api/invoices/:id/history ───────────────────────

export async function getReminderHistoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const history = await getReminderHistory(id, req.user!.userId)

    if (history === null) {
      res.status(404).json({ error: 'Invoice not found' })
      return
    }

    res.json({ data: history })
  } catch (error) {
    log.error('Get reminder history error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}
