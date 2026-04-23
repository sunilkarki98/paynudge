import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/modules/communication/email-sender'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'payment-service' })

/**
 * Retrieves a payment link by token and logs a view event asynchronously.
 */
export async function getPaymentLinkAndTrackView(token: string) {
  const paymentLink = await prisma.paymentLink.findUnique({
    where: { token },
    include: {
      invoice: {
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
    },
  })

  if (!paymentLink || !paymentLink.isActive) {
    return null
  }

  // Asynchronously track the view event (fire and forget)
  Promise.resolve().then(async () => {
    try {
      const invoice = paymentLink.invoice

      await prisma.invoiceTracking.create({
        data: {
          invoiceId: invoice.id,
          event: 'payment_page_viewed',
          metadata: { token },
        },
      })
      
      await prisma.invoiceEvent.create({
        data: {
          invoiceId: invoice.id,
          eventType: 'link_clicked',
        }
      })

      // Emit event to update behavioral intelligence
      const { eventBus } = await import('@/modules/events/event-bus')
      eventBus.emit('invoice.tracking_event', { invoiceId: invoice.id, event: 'payment_page_viewed' })

      // Update click count
      await prisma.paymentLink.update({
        where: { id: paymentLink.id },
        data: {
          clickCount: { increment: 1 },
          lastClickAt: new Date(),
        },
      })
    } catch (err) {
      log.error('Failed to track payment page view', { token })
    }
  })

  return paymentLink
}

/**
 * Marks that a client has notified the freelancer about a payment.
 * Transitions the invoice to UNVERIFIED_PAYMENT (pauses reminders via Outbox).
 */
export async function processPaymentNotification(token: string) {
  const paymentLink = await prisma.paymentLink.findUnique({
    where: { token },
    include: {
      invoice: {
        include: {
          user: true,
        },
      },
    },
  })

  if (!paymentLink || !paymentLink.isActive) {
    throw new Error('Invalid or expired payment link')
  }

  const { invoice } = paymentLink

  if (invoice.status === 'PAID') {
    throw new Error('Invoice is already paid')
  }

  // Use a transaction to atomically:
  // 1. Transition invoice to UNVERIFIED_PAYMENT (pauses reminders)
  // 2. Log the event
  // 3. Write an Outbox event to cancel all pending jobs
  await prisma.$transaction(async (tx) => {
    // Only transition if not already in a terminal/paused state
    const terminalStates = ['PAID', 'VOIDED', 'WRITTEN_OFF', 'LEGAL_HOLD', 'UNVERIFIED_PAYMENT']
    if (!terminalStates.includes(invoice.state)) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          state: 'UNVERIFIED_PAYMENT',
          lastStateChangeAt: new Date(),
          stateMetadata: { reason: 'Client indicated payment via payment link' },
        },
      })
    }

    await tx.invoiceEvent.create({
      data: {
        invoiceId: invoice.id,
        eventType: 'client_notified_paid',
        metadata: { token },
      },
    })

    // Emit via Outbox to cancel all pending reminder jobs
    await tx.outboxEvent.create({
      data: {
        eventType: 'invoice.unverified_payment',
        payload: { invoiceId: invoice.id, userId: invoice.userId },
      },
    })
  })

  // Send email to the freelancer (outside transaction — non-critical)
  const freelancerEmail = invoice.user.email
  const subject = `🎉 Client payment notification for Invoice ${invoice.invoiceNumber || 'N/A'}`
  const htmlBody = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2>Payment Notification</h2>
      <p><strong>${invoice.clientName}</strong> has just indicated they've paid invoice <strong>${invoice.invoiceNumber || 'N/A'}</strong> for <strong>$${invoice.amount.toNumber().toLocaleString()}</strong>.</p>
      <p>Please check your accounts to confirm receipt.</p>
      <p>Automated reminders have been <strong>paused</strong>. If you've received the funds, log into PayNudge and mark the invoice as PAID.</p>
    </div>
  `

  await sendEmail({
    userId: invoice.userId,
    to: freelancerEmail,
    subject,
    htmlBody,
    plainText: `${invoice.clientName} indicated they paid invoice ${invoice.invoiceNumber}. Reminders paused. Please verify and mark as paid in the dashboard.`,
  })

  log.info('Client notified paid — invoice transitioned to UNVERIFIED_PAYMENT', { invoiceId: invoice.id, token })

  return { success: true, invoiceId: invoice.id }
}
