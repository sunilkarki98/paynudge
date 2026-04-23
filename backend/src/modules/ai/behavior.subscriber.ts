import { eventBus } from '@/modules/events/event-bus'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { InvoicePaidEvent } from '@/modules/events/event-types'

const log = logger.child({ module: 'behavior-subscriber' })

/**
 * Behavior Subscriber — The "Memory" of the system.
 * 
 * It listens for invoice completions (PAID) and analyzes 
 * the FSM history to update the Client's behavioral profile.
 */
export function initBehaviorSubscriber() {
  // Listen for successful payments to learn about client reliability
  eventBus.on('invoice.paid', async (event: InvoicePaidEvent) => {
    try {
      await learnFromPayment(event.invoiceId)
    } catch (error) {
      log.error('Learning feedback loop failed', { invoiceId: event.invoiceId, error })
    }
  })

  log.info('Behavior Learning Subscriber initialized')
}

async function learnFromPayment(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true }
  })

  if (!invoice || !invoice.client) return

  const metadata = invoice.stateMetadata as any || {}
  const originalState = metadata.originalState || 'UNKNOWN'
  
  let scoreAdjustment = 0
  let newBehaviorType = invoice.client.behaviorType

  log.info('Analyzing payment behavior for learning', { 
    invoiceId, 
    finalStateBeforePaid: originalState,
    clientId: invoice.clientId 
  })

  // --- Learning Logic ---

  // 1. Excellent Behavior: Paid before or during due date
  if (['PENDING', 'DUE_SOON', 'DUE', 'GRACE_PERIOD'].includes(originalState)) {
    scoreAdjustment = 10
    if (invoice.client.behaviorScore + scoreAdjustment > 80) {
      newBehaviorType = 'SLOW_BUT_RELIABLE' // Technically fast, but mapping to enum
    }
  } 
  // 2. Slow Behavior: Paid after initial nudges
  else if (['OVERDUE_L1', 'OVERDUE_L2'].includes(originalState)) {
    scoreAdjustment = -5
    if (invoice.client.behaviorScore + scoreAdjustment < 50) {
      newBehaviorType = 'REMINDER_TRIGGERED'
    }
  }
  // 3. High Risk Behavior: Only paid after firm escalation
  else if (['OVERDUE_L3', 'FINAL_NOTICE'].includes(originalState)) {
    scoreAdjustment = -25
    newBehaviorType = 'AVOIDANT'
  }

  // --- Update Client Profile ---
  
  const updatedScore = Math.max(0, Math.min(100, (invoice.client.behaviorScore || 50) + scoreAdjustment))

  await prisma.client.update({
    where: { id: invoice.clientId! },
    data: {
      behaviorScore: updatedScore,
      behaviorType: newBehaviorType,
      // Update historical stats
      averageDaysToPay: await calculateAverageDaysToPay(invoice.clientId!),
    }
  })

  log.info('Client behavior profile updated', {
    clientId: invoice.clientId,
    newScore: updatedScore,
    newType: newBehaviorType
  })
}

/**
 * Recalculate average days to pay across all historical invoices
 */
async function calculateAverageDaysToPay(clientId: string): Promise<number> {
  const paidInvoices = await prisma.invoice.findMany({
    where: { 
      clientId, 
      state: 'PAID',
      lastStateChangeAt: { not: null as any }
    },
    select: {
      dueDate: true,
      lastStateChangeAt: true
    }
  })

  if (paidInvoices.length === 0) return 0

  const totalDays = paidInvoices.reduce((sum, inv) => {
    const days = Math.floor((inv.lastStateChangeAt!.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24))
    return sum + Math.max(0, days)
  }, 0)

  return Math.round(totalDays / paidInvoices.length)
}
