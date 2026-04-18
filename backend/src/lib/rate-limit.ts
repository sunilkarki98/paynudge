import { getRedisConnection } from '@/infrastructure/redis'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'rate-limiter' })

/**
 * Redis-backed sliding window rate limiter.
 *
 * Uses sorted sets with timestamps for precise sliding window counting.
 * Each request adds a member to the set with the current timestamp as score.
 * Expired entries are pruned on each check.
 *
 * Usage:
 *   const allowed = await checkRateLimit('login:192.168.1.1', 5, 60)
 *   if (!allowed) return 429 response
 */

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetInSeconds: number
}

/**
 * Check and consume a rate limit token.
 *
 * @param key - Unique key (e.g., `login:${ip}` or `register:${ip}`)
 * @param limit - Maximum requests allowed in the window
 * @param windowSeconds - Window size in seconds
 * @returns Whether the request is allowed, remaining tokens, and reset time
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const redis = getRedisConnection()
    const now = Date.now()
    const windowStart = now - windowSeconds * 1000
    const fullKey = `ratelimit:${key}`

    // Atomic pipeline: prune old entries, add current, count, get TTL
    const pipeline = redis.pipeline()
    pipeline.zremrangebyscore(fullKey, 0, windowStart) // Remove expired entries
    pipeline.zadd(fullKey, now, `${now}:${Math.random()}`) // Add current request
    pipeline.zcard(fullKey) // Count entries in window
    pipeline.expire(fullKey, windowSeconds) // Set key expiry as safety net

    const results = await pipeline.exec()

    // zcard result is at index 2 → [error, count]
    const count = (results?.[2]?.[1] as number) || 0
    const allowed = count <= limit
    const remaining = Math.max(0, limit - count)

    if (!allowed) {
      log.warn('Rate limit exceeded', { key, count, limit, windowSeconds })
    }

    return {
      allowed,
      remaining,
      resetInSeconds: windowSeconds,
    }
  } catch (err) {
    // If Redis is down, allow the request (fail open) but log the error.
    // In production, you may want to fail closed instead.
    log.error('Rate limit check failed, allowing request', {
      key,
      error: err instanceof Error ? err.message : String(err),
    })
    return { allowed: true, remaining: limit, resetInSeconds: windowSeconds }
  }
}

/**
 * Helper to extract client IP from a request.
 * Works with both Express and generic Request objects.
 * Handles proxies (X-Forwarded-For) and direct connections.
 */
export function getClientIp(request: { headers: Record<string, string | string[] | undefined>, ip?: string }): string {
  const forwarded = request.headers['x-forwarded-for']
  if (forwarded) {
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
    // Take the first IP (original client) from the chain
    return value.split(',')[0].trim()
  }
  const realIp = request.headers['x-real-ip']
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp
  }
  return request.ip || '127.0.0.1' // Fallback for local dev
}
