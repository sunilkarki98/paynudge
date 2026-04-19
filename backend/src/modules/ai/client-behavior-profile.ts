import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'client-behavior-profile' })

export type BehaviorType =
  | 'SLOW_BUT_RELIABLE'
  | 'REMINDER_TRIGGERED'
  | 'CASHFLOW_CONSTRAINED'
  | 'AVOIDANT'
  | 'CORPORATE_DELAY'
  | 'HIGH_RISK_GHOST'
  | 'UNKNOWN'

export interface ClientBehaviorStats {
  behaviorType: BehaviorType
  averageDaysToPay: number
  varianceInDays: number
  responseDelayAverage: number
  toneSensitivity: string
  paymentPattern: string
  paymentReliability: number
  engagementScore: number
}

/**
 * Calculates behavioral signals for a client and classifies them.
 */
export async function calculateClientBehaviorProfile(clientId: string): Promise<ClientBehaviorStats> {
  const allInvoices = await prisma.invoice.findMany({
    where: { clientId },
    include: {
      trackingEvents: true,
      reminderLogs: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const totalInvoices = allInvoices.length

  const invoices = allInvoices.filter(inv => inv.status === 'PAID')

  if (totalInvoices === 0 || invoices.length === 0) {
    return {
      behaviorType: 'UNKNOWN',
      averageDaysToPay: 0,
      varianceInDays: 0,
      responseDelayAverage: 0,
      toneSensitivity: 'UNKNOWN',
      paymentPattern: 'UNKNOWN',
      paymentReliability: 0,
      engagementScore: 0,
    }
  }

  // 0. Calculate Real Engagement Score from Tracking Events
  let totalReminders = 0
  let totalEngagements = 0

  allInvoices.forEach(inv => {
    totalReminders += inv.reminderLogs.length
    totalEngagements += inv.trackingEvents.length
  })

  let engagementScore = 0
  if (totalReminders > 0) {
    engagementScore = Math.min(1.0, totalEngagements / totalReminders)
  } else if (totalEngagements > 0) {
    engagementScore = 1.0
  }

  // 1. Calculate Average Delay & Variance
  const delays = invoices.map(inv => {
    return Math.ceil((inv.updatedAt.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24))
  })
  
  const avgDelay = delays.reduce((sum, d) => sum + d, 0) / delays.length
  const variance = delays.reduce((sum, d) => sum + Math.pow(d - avgDelay, 2), 0) / delays.length
  
  // 2. Response Delay Average (time between last reminder and payment)
  const responseDelays: number[] = []
  let firmToneSuccess = 0
  let friendlyToneSuccess = 0

  invoices.forEach(inv => {
    if (inv.reminderLogs.length > 0) {
      const lastReminder = inv.reminderLogs.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0]
      const delay = Math.max(0, Math.ceil((inv.updatedAt.getTime() - lastReminder.sentAt.getTime()) / (1000 * 60 * 60 * 24)))
      responseDelays.push(delay)

      // Tone sensitivity
      if (lastReminder.tone === 'FIRM') firmToneSuccess++
      if (lastReminder.tone === 'FRIENDLY') friendlyToneSuccess++
    }
  })

  const avgResponseDelay = responseDelays.length > 0 
    ? responseDelays.reduce((sum, d) => sum + d, 0) / responseDelays.length 
    : 0

  let toneSensitivity = 'NEUTRAL'
  if (firmToneSuccess > friendlyToneSuccess) toneSensitivity = 'RESPONDS_TO_FIRM'
  else if (friendlyToneSuccess > firmToneSuccess) toneSensitivity = 'RESPONDS_TO_FRIENDLY'

  // 3. Payment Pattern (beginning/mid/end of month)
  const paymentDays = invoices.map(inv => inv.updatedAt.getDate())
  let pattern = 'SCATTERED'
  const startMonth = paymentDays.filter(d => d <= 10).length
  const endMonth = paymentDays.filter(d => d >= 25).length
  if (startMonth > invoices.length * 0.6) pattern = 'START_OF_MONTH'
  if (endMonth > invoices.length * 0.6) pattern = 'END_OF_MONTH'

  const paymentReliability = invoices.length / totalInvoices

  // 4. Classify Behavior Type
  let behaviorType: BehaviorType = 'UNKNOWN'

  if (paymentReliability >= 0.8 && avgDelay > 7 && variance < 5) {
    behaviorType = 'SLOW_BUT_RELIABLE'
  } else if (responseDelays.length >= Math.ceil(invoices.length * 0.5) && avgResponseDelay <= 3) {
    behaviorType = 'REMINDER_TRIGGERED'
  } else if (pattern === 'START_OF_MONTH' || pattern === 'END_OF_MONTH') {
    behaviorType = 'CORPORATE_DELAY'
  } else if (paymentReliability < 0.5 && avgDelay > 21) {
    behaviorType = 'HIGH_RISK_GHOST'
  } else if (variance > 14 && avgDelay > 14) {
    behaviorType = 'CASHFLOW_CONSTRAINED'
  } else if (paymentReliability >= 0.8 && avgDelay <= 3) {
    behaviorType = 'UNKNOWN' // Could be 'FAST_PAYER', but keeping to requested enum. Let's default to unknown for fast payers.
  } else {
    behaviorType = 'AVOIDANT'
  }

  const result: ClientBehaviorStats = {
    behaviorType,
    averageDaysToPay: Math.round(avgDelay),
    varianceInDays: Math.round(variance),
    responseDelayAverage: Math.round(avgResponseDelay),
    toneSensitivity,
    paymentPattern: pattern,
    paymentReliability: Number(paymentReliability.toFixed(2)),
    engagementScore: Number(engagementScore.toFixed(2)),
  }

  return result
}

/**
 * Updates the client's behavior profile in the database.
 */
export async function syncClientBehavior(clientId: string) {
  try {
    const stats = await calculateClientBehaviorProfile(clientId)
    
    await prisma.client.update({
      where: { id: clientId },
      data: {
        behaviorType: stats.behaviorType,
        averageDaysToPay: stats.averageDaysToPay,
        varianceInDays: stats.varianceInDays,
        responseDelayAverage: stats.responseDelayAverage,
        toneSensitivity: stats.toneSensitivity,
        paymentPattern: stats.paymentPattern,
        paymentReliability: stats.paymentReliability,
        engagementScore: stats.engagementScore,
      }
    })

    log.info('Synced client behavior', { clientId, behaviorType: stats.behaviorType, engagementScore: stats.engagementScore })
    return stats
  } catch (error) {
    log.error('Failed to sync client behavior', { clientId, error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}
