import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { RiskLevel } from '@prisma/client'

const log = logger.child({ module: 'risk-scoring' })

/**
 * Risk scoring factors and their weights.
 * Uses a rule-based approach with deterministic scoring.
 */

interface RiskFactorResult {
  factor: string
  score: number // 0 to 1
  weight: number
  description: string
}

interface RiskAssessment {
  level: RiskLevel
  numericScore: number // 0-100
  factors: RiskFactorResult[]
}

/**
 * Calculate payment risk score for an invoice.
 * 
 * Factors:
 * 1. Due date proximity / overdue duration (40%)
 * 2. Client payment history (30%)
 * 3. Invoice amount (15%)
 * 4. Reminder engagement (15%)
 */
export async function calculateRiskScore(invoiceId: string): Promise<RiskAssessment> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      client: true,
      trackingEvents: true,
      reminderLogs: { where: { status: 'sent' } },
    },
  })

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`)
  }

  const factors: RiskFactorResult[] = []

  // Factor 1: Due date proximity / overdue duration (40% weight)
  const now = new Date()
  const dueDate = new Date(invoice.dueDate)
  const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  let dueDateScore = 0
  let dueDateDescription = ''

  if (invoice.status === 'PAID') {
    dueDateScore = 0
    dueDateDescription = 'Invoice is paid'
  } else if (daysUntilDue > 7) {
    dueDateScore = 0.1
    dueDateDescription = `${daysUntilDue} days until due — low urgency`
  } else if (daysUntilDue > 0) {
    dueDateScore = 0.3 + (1 - daysUntilDue / 7) * 0.2
    dueDateDescription = `${daysUntilDue} days until due — approaching`
  } else if (daysUntilDue >= -3) {
    dueDateScore = 0.5 + Math.abs(daysUntilDue) * 0.05
    dueDateDescription = `${Math.abs(daysUntilDue)} days overdue — recent`
  } else if (daysUntilDue >= -14) {
    dueDateScore = 0.7 + (Math.abs(daysUntilDue) - 3) / 11 * 0.2
    dueDateDescription = `${Math.abs(daysUntilDue)} days overdue — escalating`
  } else {
    dueDateScore = 0.95
    dueDateDescription = `${Math.abs(daysUntilDue)} days overdue — critical`
  }

  factors.push({
    factor: 'due_date_proximity',
    score: dueDateScore,
    weight: 0.4,
    description: dueDateDescription,
  })

  // Factor 2: Client payment history (30% weight)
  let historyScore = 0.5 // Default: unknown history = medium risk
  let historyDescription = 'No payment history available'

  if (invoice.clientId) {
    const clientInvoices = await prisma.invoice.findMany({
      where: {
        clientId: invoice.clientId,
        id: { not: invoiceId },
        status: 'PAID',
      },
      select: { dueDate: true, updatedAt: true },
    })

    const totalClientInvoices = await prisma.invoice.count({
      where: { clientId: invoice.clientId, id: { not: invoiceId } },
    })

    if (totalClientInvoices > 0) {
      const paidCount = clientInvoices.length
      const paymentRate = paidCount / totalClientInvoices

      // Average days to pay (for paid invoices)
      let avgDaysToPay = 0
      if (clientInvoices.length > 0) {
        const totalDays = clientInvoices.reduce((sum, inv) => {
          const daysToPay = Math.ceil(
            (inv.updatedAt.getTime() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)
          )
          return sum + Math.max(0, daysToPay)
        }, 0)
        avgDaysToPay = totalDays / clientInvoices.length
      }

      // Low payment rate or consistently late = high risk
      if (paymentRate >= 0.9 && avgDaysToPay <= 3) {
        historyScore = 0.1
        historyDescription = `Excellent payer: ${(paymentRate * 100).toFixed(0)}% paid, avg ${avgDaysToPay.toFixed(0)}d to pay`
      } else if (paymentRate >= 0.7 && avgDaysToPay <= 7) {
        historyScore = 0.3
        historyDescription = `Good payer: ${(paymentRate * 100).toFixed(0)}% paid, avg ${avgDaysToPay.toFixed(0)}d to pay`
      } else if (paymentRate >= 0.5) {
        historyScore = 0.6
        historyDescription = `Average payer: ${(paymentRate * 100).toFixed(0)}% paid, avg ${avgDaysToPay.toFixed(0)}d to pay`
      } else {
        historyScore = 0.9
        historyDescription = `Poor payer: only ${(paymentRate * 100).toFixed(0)}% paid`
      }
    }
  }

  factors.push({
    factor: 'client_history',
    score: historyScore,
    weight: 0.3,
    description: historyDescription,
  })

  // Factor 3: Invoice amount (15% weight) — higher amounts carry more risk
  const amount = Number(invoice.amount)
  let amountScore = 0.3
  let amountDescription = 'Standard amount'

  if (amount > 10000) {
    amountScore = 0.8
    amountDescription = `High value: $${amount.toLocaleString()} — higher payment friction`
  } else if (amount > 5000) {
    amountScore = 0.6
    amountDescription = `Above average: $${amount.toLocaleString()}`
  } else if (amount > 1000) {
    amountScore = 0.4
    amountDescription = `Moderate: $${amount.toLocaleString()}`
  } else {
    amountScore = 0.2
    amountDescription = `Low value: $${amount.toLocaleString()} — likely quick payment`
  }

  factors.push({
    factor: 'invoice_amount',
    score: amountScore,
    weight: 0.15,
    description: amountDescription,
  })

  // Factor 4: Reminder engagement (15% weight)
  const sentReminders = invoice.reminderLogs.length
  const emailOpens = invoice.trackingEvents.filter(e => e.event === 'email_opened').length
  const linkClicks = invoice.trackingEvents.filter(e => e.event === 'link_clicked').length

  let engagementScore = 0.5
  let engagementDescription = 'No engagement data yet'

  if (sentReminders > 0) {
    if (linkClicks > 0) {
      engagementScore = 0.2
      engagementDescription = `Good engagement: ${linkClicks} link clicks from ${sentReminders} reminders`
    } else if (emailOpens > 0) {
      engagementScore = 0.4
      engagementDescription = `Partial engagement: ${emailOpens} opens but no clicks from ${sentReminders} reminders`
    } else if (sentReminders >= 2) {
      engagementScore = 0.85
      engagementDescription = `No engagement: ${sentReminders} reminders sent, no opens or clicks`
    } else {
      engagementScore = 0.5
      engagementDescription = `Early stage: ${sentReminders} reminder sent, awaiting response`
    }
  }

  factors.push({
    factor: 'reminder_engagement',
    score: engagementScore,
    weight: 0.15,
    description: engagementDescription,
  })

  // Calculate weighted score
  const numericScore = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0) * 100
  )

  // Map to risk level
  let level: RiskLevel
  if (numericScore >= 65) {
    level = 'HIGH'
  } else if (numericScore >= 35) {
    level = 'MEDIUM'
  } else {
    level = 'LOW'
  }

  return { level, numericScore, factors }
}

/**
 * Calculate and persist risk score for an invoice.
 */
export async function updateInvoiceRiskScore(invoiceId: string): Promise<RiskAssessment> {
  try {
    const assessment = await calculateRiskScore(invoiceId)

    await prisma.aIMetadata.upsert({
      where: { invoiceId },
      update: {
        riskScore: assessment.level,
        riskFactors: assessment.factors.map(f => ({
          factor: f.factor,
          score: f.score,
          description: f.description,
        })),
        updatedAt: new Date(),
      },
      create: {
        invoiceId,
        riskScore: assessment.level,
        riskFactors: assessment.factors.map(f => ({
          factor: f.factor,
          score: f.score,
          description: f.description,
        })),
      },
    })

    log.info('Risk score updated', {
      invoiceId,
      level: assessment.level,
      numericScore: assessment.numericScore,
    })

    return assessment
  } catch (err) {
    log.error('Failed to update risk score', {
      invoiceId,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
