import { prisma } from '@/lib/prisma'
import { eventBus } from '@/modules/events/event-bus'
import { logger } from '@/lib/logger'
import type { EventName } from '@/modules/events/event-types'

const log = logger.child({ module: 'outbox-worker' })

let isRunning = false
let pollInterval: NodeJS.Timeout

/**
 * Polls the OutboxEvent table for unprocessed events.
 * Uses atomic updates to claim events to prevent duplicate processing
 * if multiple worker instances are running.
 */
async function processOutbox() {
  if (isRunning) return
  isRunning = true

  try {
    // 1. Fetch up to 50 unprocessed events
    const events = await prisma.outboxEvent.findMany({
      where: { processed: false },
      take: 50,
      orderBy: { createdAt: 'asc' },
    })

    if (events.length === 0) {
      isRunning = false
      return 0 // 0 means no events processed
    }

    // 2. Claim them atomically (prevent other workers from taking them)
    const eventIds = events.map((e) => e.id)
    await prisma.outboxEvent.updateMany({
      where: { id: { in: eventIds }, processed: false },
      data: { processed: true },
    })

    // 3. Emit them via the local event bus (which pushes to BullMQ)
    for (const event of events) {
      try {
        eventBus.emit(event.eventType as EventName, event.payload as any)
      } catch (err) {
        log.error('Failed to emit outbox event', {
          eventId: event.id,
          eventType: event.eventType,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Optional: Delete processed events to keep table small
    await prisma.outboxEvent.deleteMany({
      where: { id: { in: eventIds } }
    })
    
    return events.length

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

    const processedCount = await processOutbox()

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
