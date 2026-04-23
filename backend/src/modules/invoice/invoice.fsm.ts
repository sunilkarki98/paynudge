import { InvoiceState, ChasingProfile } from '@prisma/client'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'invoice-fsm' })

export type InvoiceFSMEvent =
  | 'PUBLISH'               // Draft -> Pending
  | 'REACH_DUE_SOON'        // Pending -> Due Soon (-3 days)
  | 'REACH_DUE_DATE'        // Due Soon/Pending -> Due
  | 'CHECKPOINT_REACHED'    // Progression through overdue levels
  | 'PAYMENT_RECEIVED'      // Any -> Paid/Partially Paid
  | 'CLIENT_NOTIFIED_PAY'   // Any -> Unverified Payment
  | 'DISPUTE_RAISED'        // Any -> Disputed
  | 'DISPUTE_RESOLVED'      // Disputed -> Back to previous state
  | 'BOUNCE_DETECTED'       // Any -> Manual Review
  | 'VOID_INVOICE'          // Any -> Voided
  | 'WRITE_OFF'             // Any -> Written Off
  | 'OPT_OUT'               // Any -> Legal Hold (Client said STOP)

export interface FSMContext {
  currentState: InvoiceState
  chasingProfile: ChasingProfile
  balance: number
  amount: number
  isGhost?: boolean
  isShieldMode?: boolean
}

export interface TransitionResult {
  nextState: InvoiceState
  sideEffect?: 'SEND_REMINDER' | 'CANCEL_JOBS' | 'NOTIFY_USER' | 'NONE'
  reason: string
}

export function transitionInvoice(event: InvoiceFSMEvent, ctx: FSMContext): TransitionResult {
  const { currentState, chasingProfile, balance, amount, isGhost, isShieldMode } = ctx

  // 1. Global Terminal States
  if (
    currentState === 'PAID' || 
    currentState === 'VOIDED' || 
    currentState === 'WRITTEN_OFF' || 
    currentState === 'LEGAL_HOLD' || 
    currentState === 'DEBT_COLLECTION'
  ) {
    return { nextState: currentState, sideEffect: 'NONE', reason: 'Invoice is in a terminal or paused state.' }
  }

  // 2. Global Event Overrides
  if (event === 'PAYMENT_RECEIVED') {
    if (balance <= 0) {
      return { nextState: 'PAID', sideEffect: 'CANCEL_JOBS', reason: 'Full payment received.' }
    }
    return { nextState: 'PARTIALLY_PAID', sideEffect: 'NONE', reason: 'Partial payment received.' }
  }

  if (event === 'CLIENT_NOTIFIED_PAY') {
    return { nextState: 'UNVERIFIED_PAYMENT', sideEffect: 'CANCEL_JOBS', reason: 'Client claimed they paid. Pausing reminders.' }
  }

  if (event === 'DISPUTE_RAISED') {
    return { nextState: 'DISPUTED', sideEffect: 'CANCEL_JOBS', reason: 'Client raised a dispute.' }
  }

  if (event === 'VOID_INVOICE') {
    return { nextState: 'VOIDED', sideEffect: 'CANCEL_JOBS', reason: 'Invoice manually voided.' }
  }

  if (event === 'BOUNCE_DETECTED') {
    return { nextState: 'MANUAL_REVIEW', sideEffect: 'NOTIFY_USER', reason: 'Communication bounced.' }
  }

  if (event === 'OPT_OUT') {
    return { nextState: 'LEGAL_HOLD', sideEffect: 'CANCEL_JOBS', reason: 'Client opted out of communication (STOP command).' }
  }

  // 3. State-Specific Transitions
  switch (currentState) {
    case 'DRAFT':
      if (event === 'PUBLISH') {
        return { nextState: 'PENDING', sideEffect: 'NONE', reason: 'Invoice published and active.' }
      }
      break;

    case 'PENDING':
      if (event === 'REACH_DUE_SOON') {
        if (isGhost) {
          return { nextState: 'DUE_SOON', sideEffect: 'SEND_REMINDER', reason: 'Ghost detected: Sending pre-due reminder.' }
        }
        return { nextState: 'PENDING', sideEffect: 'NONE', reason: 'Staying in pending for safe client.' }
      }
      if (event === 'REACH_DUE_DATE') {
        return { nextState: 'DUE', sideEffect: 'SEND_REMINDER', reason: 'Due date reached.' }
      }
      break;

    case 'DUE_SOON':
      if (event === 'REACH_DUE_DATE') {
        return { nextState: 'DUE', sideEffect: 'SEND_REMINDER', reason: 'Due date reached.' }
      }
      break;

    case 'DUE':
      if (event === 'CHECKPOINT_REACHED') {
        if (isGhost) {
          return { nextState: 'OVERDUE_L2', sideEffect: 'SEND_REMINDER', reason: 'Ghost detected: Escalating tone immediately.' }
        }
        return { nextState: 'GRACE_PERIOD', sideEffect: 'NONE', reason: 'Due date passed. Entering grace period.' }
      }
      break;

    case 'GRACE_PERIOD':
      if (event === 'CHECKPOINT_REACHED') {
        return { nextState: 'OVERDUE_L1', sideEffect: 'SEND_REMINDER', reason: 'Grace period ended.' }
      }
      break;

    case 'OVERDUE_L1':
      if (event === 'CHECKPOINT_REACHED') {
        return { nextState: 'OVERDUE_L2', sideEffect: 'SEND_REMINDER', reason: 'Moving to firm escalation level 2.' }
      }
      break;

    case 'OVERDUE_L2':
      if (event === 'CHECKPOINT_REACHED') {
        if (isShieldMode) {
          return { nextState: 'OVERDUE_L2', sideEffect: 'SEND_REMINDER', reason: 'Shield mode active: Capping escalation.' }
        }
        return { nextState: 'OVERDUE_L3', sideEffect: 'SEND_REMINDER', reason: 'Moving to firm escalation level 3.' }
      }
      break;

    case 'OVERDUE_L3':
      if (event === 'CHECKPOINT_REACHED') {
        return { nextState: 'FINAL_NOTICE', sideEffect: 'SEND_REMINDER', reason: 'Entering final notice stage.' }
      }
      break;

    case 'FINAL_NOTICE':
      if (event === 'CHECKPOINT_REACHED') {
        return { nextState: 'RECURRING_CHASE', sideEffect: 'SEND_REMINDER', reason: 'Starting recurring chase loop.' }
      }
      break;

    case 'PARTIALLY_PAID':
      if (event === 'CHECKPOINT_REACHED') {
        return { nextState: 'OVERDUE_L1', sideEffect: 'SEND_REMINDER', reason: 'Continuing to chase remaining balance.' }
      }
      break;

    case 'RECURRING_CHASE':
      if (event === 'CHECKPOINT_REACHED') {
        return { nextState: 'RECURRING_CHASE', sideEffect: 'SEND_REMINDER', reason: 'Continuing recurring chase.' }
      }
      break;

    case 'DISPUTED':
      if (event === 'DISPUTE_RESOLVED') {
        return { nextState: 'PENDING', sideEffect: 'NONE', reason: 'Dispute resolved.' }
      }
      break;
  }

  return { nextState: currentState, sideEffect: 'NONE', reason: 'No transition defined.' }
}
