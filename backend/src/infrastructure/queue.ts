import { Queue, QueueOptions } from 'bullmq'
import { getRedisConnection } from './redis'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'queue-factory' })

/**
 * BullMQ Queue factory with shared defaults.
 * 
 * All queues use the same Redis connection (producer-side).
 * Default job options:
 *  - removeOnComplete: keep last 1000 completed jobs (for observability)
 *  - removeOnFail: keep last 5000 failed jobs (for debugging)
 *  - attempts: 5 with exponential backoff starting at 30s
 */

const queueInstances = new Map<string, Queue>()

export function createQueue(name: string, overrides?: Partial<QueueOptions>): Queue {
  const existing = queueInstances.get(name)
  if (existing) return existing

  const connection = getRedisConnection()

  const queue = new Queue(name, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 30_000, // 30s → 60s → 120s → 240s → 480s
      },
    },
    ...overrides,
  })

  queue.on('error', (err: Error) => {
    log.error('Queue error', { queue: name, error: err.message })
  })

  queueInstances.set(name, queue)
  log.info('Queue created', { queue: name })

  return queue
}

/**
 * Close all queue instances (for graceful shutdown).
 */
export async function closeAllQueues(): Promise<void> {
  const closePromises = Array.from(queueInstances.entries()).map(
    async ([name, queue]) => {
      await queue.close()
      log.info('Queue closed', { queue: name })
    }
  )
  await Promise.all(closePromises)
  queueInstances.clear()
}
