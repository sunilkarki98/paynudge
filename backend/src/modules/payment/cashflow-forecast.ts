import { prisma } from '@/lib/prisma'
import { calculateClientBehaviorProfile } from '@/modules/ai/client-behavior-profile'

export interface CashflowForecast {
  projectedCashflow: number
  atRiskAmount: number
  confidence: number // 0-1
}

export async function generateCashflowForecast(userId: string): Promise<CashflowForecast> {
  const unpaidInvoices = await prisma.invoice.findMany({
    where: { 
      userId, 
      status: 'UNPAID' 
    },
    include: {
      client: true,
      aiMetadata: true
    }
  })

  let projectedCashflow = 0
  let atRiskAmount = 0
  let totalConfidenceWeight = 0
  let confidenceSum = 0

  const now = new Date()

  // For a 30-day forecast window
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  for (const inv of unpaidInvoices) {
    const amount = Number(inv.amount)
    let expectedPaymentDate = new Date(inv.dueDate)
    let invoiceConfidence = 0.5 // Base unknown confidence

    if (inv.clientId) {
      // Use cached behavior type or calculate
      const behavior = await calculateClientBehaviorProfile(inv.clientId)
      
      // Adjust expected date based on historical average delay
      expectedPaymentDate = new Date(inv.dueDate.getTime() + behavior.averageDaysToPay * 24 * 60 * 60 * 1000)

      // Adjust confidence based on reliability
      invoiceConfidence = behavior.paymentReliability

      if (behavior.behaviorType === 'AVOIDANT' || behavior.behaviorType === 'HIGH_RISK_GHOST') {
        invoiceConfidence -= 0.3
      } else if (behavior.behaviorType === 'SLOW_BUT_RELIABLE') {
        invoiceConfidence += 0.2
      }
    }

    // Cap confidence
    invoiceConfidence = Math.max(0, Math.min(1, invoiceConfidence))

    // Is it within our 30-day window?
    if (expectedPaymentDate <= thirtyDaysFromNow) {
      projectedCashflow += amount
      
      confidenceSum += invoiceConfidence * amount
      totalConfidenceWeight += amount

      // Consider it "at risk" if risk score is high, or confidence is very low, or it's past expected date
      if (
        (inv.aiMetadata?.riskScore === 'HIGH') || 
        (invoiceConfidence < 0.4) || 
        (expectedPaymentDate < now && invoiceConfidence < 0.8)
      ) {
        atRiskAmount += amount
      }
    }
  }

  const overallConfidence = totalConfidenceWeight > 0 ? (confidenceSum / totalConfidenceWeight) : 0

  return {
    projectedCashflow,
    atRiskAmount,
    confidence: Number(overallConfidence.toFixed(2))
  }
}
