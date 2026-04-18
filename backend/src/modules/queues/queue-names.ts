/**
 * Queue name constants.
 * 
 * Centralized here to avoid magic strings scattered across the codebase.
 * Each queue has a specific purpose:
 * 
 * - EMAIL_QUEUE: Sends reminder emails (processed by email.worker.ts)
 * - OVERDUE_CHECK_QUEUE: Checks if invoices are still unpaid at overdue checkpoints
 * - DEAD_LETTER_QUEUE: Collects permanently failed jobs for manual review
 */

export const QUEUE_NAMES = {
  EMAIL: 'invoice-chaser-email',
  WHATSAPP: 'invoice-chaser-whatsapp',
  SMS: 'invoice-chaser-sms',
  OVERDUE_CHECK: 'invoice-chaser-overdue-check',
  DEAD_LETTER: 'invoice-dead-letter',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]
