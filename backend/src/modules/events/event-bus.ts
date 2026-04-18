import { EventEmitter } from 'events'
import { logger } from '@/lib/logger'
import type { EventMap, EventName } from './event-types'

const log = logger.child({ module: 'event-bus' })

/**
 * Typed event bus wrapping Node.js EventEmitter.
 * 
 * Architecture decisions:
 * 
 * 1. WHY EventEmitter and not Redis Pub/Sub?
 *    - For a single-process API server (Next.js), in-process events are simpler
 *      and have zero serialization overhead.
 *    - The event bus is only used to decouple the invoice domain from the
 *      notification domain. The actual distributed work (email sending) is
 *      handled by BullMQ, which uses Redis internally.
 *    - If you later scale to multiple API server instances, you can swap this
 *      implementation to Redis Pub/Sub without changing any subscriber code.
 * 
 * 2. WHY a wrapper and not raw EventEmitter?
 *    - Type safety: emit/on are generic over EventMap
 *    - Structured logging on every emit
 *    - Centralized error handling for subscribers
 *    - Single place to add metrics/tracing later
 */

class TypedEventBus {
  private emitter: EventEmitter

  constructor() {
    this.emitter = new EventEmitter()
    // Allow many listeners — we may have multiple subscribers per event
    this.emitter.setMaxListeners(50)
  }

  /**
   * Emit an event with a typed payload.
   * All registered handlers execute asynchronously (fire-and-forget).
   * Errors in handlers are caught and logged — they never crash the emitter.
   */
  emit<K extends EventName>(event: K, payload: EventMap[K]): void {
    log.info('Event emitted', {
      event,
      invoiceId: 'invoiceId' in payload ? payload.invoiceId : undefined,
    })
    this.emitter.emit(event, payload)
  }

  /**
   * Subscribe to an event with a typed handler.
   * Handlers are wrapped with error catching to prevent unhandled rejections.
   */
  on<K extends EventName>(event: K, handler: (payload: EventMap[K]) => void | Promise<void>): void {
    this.emitter.on(event, async (payload: EventMap[K]) => {
      try {
        await handler(payload)
      } catch (err) {
        log.error('Event handler error', {
          event,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        })
      }
    })

    log.info('Event handler registered', { event })
  }

  /**
   * Remove all listeners for an event (useful for testing).
   */
  removeAllListeners(event?: EventName): void {
    if (event) {
      this.emitter.removeAllListeners(event)
    } else {
      this.emitter.removeAllListeners()
    }
  }
}

/**
 * Singleton event bus instance.
 * Imported by both publishers (invoice service) and subscribers (notification module).
 */
export const eventBus = new TypedEventBus()
