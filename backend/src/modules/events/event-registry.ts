import { registerNotificationSubscribers } from '@/modules/notification/notification.subscriber'
import { registerAuditSubscribers } from '@/modules/events/audit.subscriber'
import { initBehaviorSubscriber } from '@/modules/ai/behavior.subscriber'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'event-registry' })

let registered = false

/**
 * Wire up all event subscribers.
 * 
 * Must be called once at application startup — both in the Next.js
 * API server (for publishing) and in the worker process (for processing).
 * 
 * Idempotent: safe to call multiple times (guards against Next.js HMR).
 */
export function registerAllEventHandlers(): void {
  if (registered) {
    log.info('Event handlers already registered, skipping')
    return
  }

  registerNotificationSubscribers()
  registerAuditSubscribers()
  initBehaviorSubscriber()
  // Future: registerAnalyticsSubscribers(), registerWebhookSubscribers(), etc.

  registered = true
  log.info('All event handlers registered')
}
