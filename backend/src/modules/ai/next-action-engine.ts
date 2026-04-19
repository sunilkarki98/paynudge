import { BehaviorType } from './client-behavior-profile'
import { RiskLevel } from '@prisma/client'

export type NextAction = 
  | 'WAIT'
  | 'SEND_GENTLE_REMINDER'
  | 'ESCALATE'
  | 'SWITCH_CHANNEL'
  | 'RECOMMEND_PHONE_CALL'
  | 'SUGGEST_PAYMENT_PLAN'

export interface ActionDecision {
  action: NextAction
  reason: string
}

export interface ActionEngineContext {
  riskScore: number
  riskLevel: RiskLevel
  behaviorType: BehaviorType
  engagementScore: number // 0-1, e.g. 0 = ignored, 1 = opened and clicked
  invoiceAmount: number
  daysOverdue: number
  stage: number // current reminder stage (1-4)
}

export function determineNextAction(ctx: ActionEngineContext): ActionDecision {
  const { behaviorType, daysOverdue, invoiceAmount, riskLevel, engagementScore, stage } = ctx

  // 1. High value invoices with severe delinquency
  if (invoiceAmount > 5000 && daysOverdue > 30) {
    if (engagementScore < 0.2) {
      return {
        action: 'RECOMMEND_PHONE_CALL',
        reason: 'Large invoice is severely overdue and client is not engaging with digital reminders.'
      }
    } else {
      return {
        action: 'SUGGEST_PAYMENT_PLAN',
        reason: 'Large invoice is severely overdue. Client is reading emails but may be cashflow constrained.'
      }
    }
  }

  // 2. Behavioral specific logic
  if (behaviorType === 'SLOW_BUT_RELIABLE') {
    if (daysOverdue < 14) {
      return {
        action: 'WAIT',
        reason: 'Client historically pays late but is reliable. Premature reminders may damage relationship.'
      }
    }
  }

  if (behaviorType === 'CORPORATE_DELAY') {
    if (stage > 2 && daysOverdue < 45) {
       return {
         action: 'WAIT',
         reason: 'Client operates on a known slow corporate payment cycle. Wait for their scheduled run.'
       }
    }
  }

  if (behaviorType === 'REMINDER_TRIGGERED') {
    if (stage === 1 && daysOverdue >= 1) {
      return {
        action: 'SEND_GENTLE_REMINDER',
        reason: 'Client reliably pays upon receiving a prompt. Gentle nudge is sufficient.'
      }
    }
  }

  // 3. Escalation logic
  if (riskLevel === 'HIGH' || behaviorType === 'AVOIDANT' || behaviorType === 'HIGH_RISK_GHOST') {
    if (stage >= 3 && engagementScore < 0.1) {
      return {
        action: 'SWITCH_CHANNEL',
        reason: 'Client is ignoring emails. Recommend switching to SMS.'
      }
    }
    
    if (daysOverdue > 7) {
      return {
        action: 'ESCALATE',
        reason: 'Client shows high risk signals and is significantly overdue.'
      }
    }
  }

  // 4. Default fallback logic based on standard stages
  if (daysOverdue <= 3 && stage === 1) {
    return {
      action: 'SEND_GENTLE_REMINDER',
      reason: 'Standard early reminder.'
    }
  } else if (daysOverdue > 7 && stage === 2) {
    return {
      action: 'ESCALATE',
      reason: 'Invoice is over a week late, escalating tone.'
    }
  } else if (daysOverdue > 14 && stage >= 3) {
    if (engagementScore < 0.1) {
      return {
        action: 'SWITCH_CHANNEL',
        reason: 'Client is not responding to standard reminders.'
      }
    } else {
      return {
         action: 'ESCALATE',
         reason: 'Invoice is severely overdue, escalating to firm.'
      }
    }
  }

  // If no specific flag is tripped, just proceed with normal flow
  return {
    action: stage >= 3 ? 'ESCALATE' : 'SEND_GENTLE_REMINDER',
    reason: 'Proceeding with standard chasing schedule.'
  }
}
