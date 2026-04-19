import Redis from 'ioredis'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'redis' })

/**
 * Singleton IORedis connection for BullMQ and general use.
 * 
 * Design decisions:
 * - Single shared connection for queue producers (API routes)
 * - BullMQ Workers create their own connections internally
 * - maxRetriesPerRequest: null is REQUIRED by BullMQ
 * - enableReadyCheck: false prevents blocking on Redis LOADING state
 */

let redisInstance: Redis | null = null

export function getRedisConnection(): Redis {
  if (redisInstance) return redisInstance

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

  redisInstance = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000)
      log.warn('Redis connection retry', { attempt: times, delayMs: delay })
      return delay
    },
    reconnectOnError(err: Error) {
      const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT']
      return targetErrors.some((e) => err.message.includes(e))
    },
  })

  redisInstance.on('connect', () => {
    log.info('Redis connected')
  })

  redisInstance.on('error', (err: Error) => {
    log.error('Redis connection error', { error: err.message })
  })

  redisInstance.on('close', () => {
    log.warn('Redis connection closed')
  })

  return redisInstance
}

/**
 * Create a NEW Redis connection (for BullMQ workers that need separate connections).
 * Each BullMQ Worker needs its own connection — never share with the producer.
 */
export function createRedisConnection(): Redis {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 5000)
      return delay
    },
  })
}

/**
 * Health check: verify Redis is responsive.
 */
export async function checkRedisHealth(): Promise<{ status: string; latencyMs: number }> {
  const start = Date.now()
  try {
    const conn = getRedisConnection()
    await conn.ping()
    return { status: 'up', latencyMs: Date.now() - start }
  } catch {
    return { status: 'down', latencyMs: Date.now() - start }
  }
}

/**
 * Graceful shutdown — close the shared connection.
 */
export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit()
    redisInstance = null
    log.info('Redis disconnected gracefully')
  }
}
