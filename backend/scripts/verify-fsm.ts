import { transitionInvoice, FSMContext, InvoiceFSMEvent } from '../src/modules/invoice/invoice.fsm'
import { InvoiceState, ChasingProfile } from '@prisma/client'

function test(name: string, event: InvoiceFSMEvent, ctx: FSMContext) {
  const result = transitionInvoice(event, ctx)
  console.log(`[${name}]`)
  console.log(`  Input: ${ctx.currentState} + ${event} (Ghost: ${!!ctx.isGhost}, Shield: ${!!ctx.isShieldMode})`)
  console.log(`  Result: ${result.nextState} | Action: ${result.sideEffect}`)
  console.log(`  Reason: ${result.reason}`)
  console.log('--------------------------------------------------')
  return result.nextState
}

console.log('🧪 Starting FSM Verification Tests...\n')

// 1. Standard Flow
let state: InvoiceState = 'DRAFT'
state = test('Start to Pending', 'PUBLISH', { currentState: state, chasingProfile: 'NORMAL', balance: 100, amount: 100 })
state = test('Due Date Reached', 'REACH_DUE_DATE', { currentState: state, chasingProfile: 'NORMAL', balance: 100, amount: 100 })
state = test('First Checkpoint (Grace)', 'CHECKPOINT_REACHED', { currentState: state, chasingProfile: 'NORMAL', balance: 100, amount: 100 })

// 2. Ghost Scenario
test('Ghost Escalation', 'CHECKPOINT_REACHED', { 
  currentState: 'DUE', 
  chasingProfile: 'NORMAL', 
  balance: 500, 
  amount: 500, 
  isGhost: true 
})

// 3. Shield Mode Scenario
test('Shield Mode Protection', 'CHECKPOINT_REACHED', { 
  currentState: 'OVERDUE_L2', 
  chasingProfile: 'NORMAL', 
  balance: 100, 
  amount: 100, 
  isShieldMode: true 
})

// 4. Dispute Flow
state = 'OVERDUE_L1'
state = test('Dispute Raised', 'DISPUTE_RAISED', { currentState: state, chasingProfile: 'NORMAL', balance: 100, amount: 100 })
state = test('Dispute Resolved', 'DISPUTE_RESOLVED', { currentState: state, chasingProfile: 'NORMAL', balance: 100, amount: 100 })

// 5. Terminal State Safety
test('Terminal Protection', 'CHECKPOINT_REACHED', { 
  currentState: 'PAID', 
  chasingProfile: 'NORMAL', 
  balance: 0, 
  amount: 100 
})

// 6. Payment Claimed
test('Unverified Payment', 'CLIENT_NOTIFIED_PAY', { 
  currentState: 'OVERDUE_L3', 
  chasingProfile: 'STRICT', 
  balance: 1000, 
  amount: 1000 
})

console.log('\n✅ Verification Complete.')
