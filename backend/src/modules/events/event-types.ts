/**
 * Event payload types for the invoice lifecycle.
 * 
 * Every event carries the minimum data needed for downstream
 * processing. Full invoice data is fetched from DB by workers
 * at processing time (not stored in the event) to avoid stale data.
 */

export interface InvoiceCreatedEvent {
  invoiceId: string
  userId: string
  clientEmail: string
  clientName: string
  amount: number
  dueDate: Date
  whatsappNumber?: string | null
  smsNumber?: string | null
  chasingProfile: string
  contactChannel: string
  paymentLinkToken?: string
  reminderTone: string
  chaseUntilPaid: boolean
  chaseIntervalDays: number
  customIntervals?: any
}

export interface InvoicePaymentDueEvent {
  invoiceId: string
  userId: string
  clientEmail: string
  clientName: string
  amount: number
  dueDate: Date
  whatsappNumber?: string | null
  smsNumber?: string | null
  contactChannel: string
  paymentLinkToken?: string
  reminderTone: string
}

export interface InvoiceOverdueEvent {
  invoiceId: string
  userId: string
  clientEmail: string
  clientName: string
  amount: number
  dueDate: Date
  daysOverdue: number
  /** Which reminder stage this corresponds to */
  stage: number
  whatsappNumber?: string | null
  smsNumber?: string | null
  contactChannel: string
  paymentLinkToken?: string
  reminderTone: string
  chaseUntilPaid: boolean
  chaseIntervalDays: number
}

export interface InvoicePaidEvent {
  invoiceId: string
  userId: string
}

/**
 * Map of event names to their payload types.
 * Used to enforce type safety on emit() and on().
 */
export interface EventMap {
  'invoice.created': InvoiceCreatedEvent
  'invoice.payment_due': InvoicePaymentDueEvent
  'invoice.overdue': InvoiceOverdueEvent
  'invoice.paid': InvoicePaidEvent
}

export type EventName = keyof EventMap
