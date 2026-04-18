import { Request, Response, NextFunction } from 'express'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

/**
 * Global API rate limiter middleware.
 * Defaults to 100 requests per 60 seconds per IP address.
 */
export async function globalRateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = getClientIp(req)
  const limit = 100
  const windowSeconds = 60

  const { allowed, remaining, resetInSeconds } = await checkRateLimit(`global:${ip}`, limit, windowSeconds)

  res.setHeader('X-RateLimit-Limit', limit)
  res.setHeader('X-RateLimit-Remaining', remaining)
  res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + resetInSeconds)

  if (!allowed) {
    res.status(429).json({ error: 'Too many requests, please try again later.' })
    return
  }

  next()
}
