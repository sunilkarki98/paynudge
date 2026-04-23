import { prisma } from '@/lib/prisma'
import { eventBus } from '@/modules/events/event-bus'
import { logger } from '@/lib/logger'
import type { EventName } from '@/modules/events/event-types'

const log = logger.child({ module: 'outbox-worker' })

let isRunning = false
let pollInterval: NodeJS.Timeout

/**
 * Atomically claims and processes outbox events using FOR UPDATE SKIP LOCKED.
 * 
 * This eliminates the TOCTOU race condition where two workers could both
 * fetch the same events before either marks them as processed.
 * 
 * Processed events are retained with a processedAt timestamp for audit.
 * A separate cleanup job should delete events older than 7 days.
 */
async function processOutbox() {
  if (isRunning) return
  isRunning = true

  try {
    // Atomic claim: SELECT + UPDATE in one transaction using FOR UPDATE SKIP LOCKED.
    // SKIP LOCKED ensures concurrent workers never contend on the same rows.
    const claimedEvents = await prisma.$queryRaw<
      { id: string; eventType: string; payload: any }[]
    >`
      UPDATE "OutboxEvent"
      SET processed = true, "processedAt" = NOW()
      WHERE id IN (
        SELECT id FROM "OutboxEvent"
        WHERE processed = false
        ORDER BY "createdAt" ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "eventType", payload
    `

    if (!claimedEvents || claimedEvents.length === 0) {
      return 0
    }

    // Emit each claimed event via the local event bus
    let emitted = 0
    for (const event of claimedEvents) {
      try {
        eventBus.emit(event.eventType as EventName, event.payload as any)
        emitted++
      } catch (err) {
        log.error('Failed to emit outbox event', {
          eventId: event.id,
          eventType: event.eventType,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    log.info('Outbox batch processed', { claimed: claimedEvents.length, emitted })
    return claimedEvents.length

  } catch (error) {
    log.error('Error in outbox poller', {
      error: error instanceof Error ? error.message : String(error),
    })
    return 0
  } finally {
    isRunning = false
  }
}

export function startOutboxWorker(baseIntervalMs = 2000, maxIntervalMs = 15000) {
  log.info('Starting outbox worker poller', { baseIntervalMs, maxIntervalMs })
  
  let currentInterval = baseIntervalMs
  let isClosed = false

  const pollLoop = async () => {
    if (isClosed) return

    const processedCount = (await processOutbox()) ?? 0

    if (processedCount > 0) {
      // If we found work, drop back to the fastest interval to clear the backlog
      currentInterval = baseIntervalMs
    } else {
      // If idle, exponentially back off to save DB load
      currentInterval = Math.min(currentInterval * 1.5, maxIntervalMs)
    }

    pollInterval = setTimeout(pollLoop, currentInterval)
  }

  // Initial run
  pollLoop()

  return {
    close: async () => {
      isClosed = true
      clearTimeout(pollInterval)
      // wait for current run to finish
      while(isRunning) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      log.info('Outbox worker closed')
    }
  }
}
