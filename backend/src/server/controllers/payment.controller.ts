import { Request, Response } from 'express'
import { getPaymentLinkAndTrackView, processPaymentNotification } from '@/modules/payment/payment.service'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'payment-controller' })

// ─── GET /api/pay/:token ──────────────────────────────────
export async function getPaymentLink(req: Request, res: Response): Promise<void> {
  try {
    const token = req.params.token as string
    const paymentLink = await getPaymentLinkAndTrackView(token)

    if (!paymentLink) {
      res.status(404).json({ error: 'Invalid or expired payment link' })
      return
    }

    // Return the subset of data the front-end needs
    const { invoice } = paymentLink
    res.json({
      id: invoice.id,
      number: invoice.invoiceNumber || 'N/A',
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      description: invoice.description,
      clientName: invoice.clientName,
      status: invoice.status,
      user: invoice.user,
    })
  } catch (err) {
    log.error('Failed to get payment link', {
      error: err instanceof Error ? err.message : String(err),
    })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── POST /api/pay/:token/notify ─────────────────────────

export async function notifyPayment(req: Request, res: Response): Promise<void> {
  try {
    const token = req.params.token as string

    const result = await processPaymentNotification(token)
    
    res.json(result)
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    if (errorMessage === 'Invalid or expired payment link') {
      res.status(404).json({ error: errorMessage })
      return
    }
    if (errorMessage === 'Invoice is already paid') {
      res.status(400).json({ error: errorMessage })
      return
    }
    
    log.error('Failed to process payment notification', { error: errorMessage })
    res.status(500).json({ error: 'Internal server error' })
  }
}
