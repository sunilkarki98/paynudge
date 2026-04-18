import { Request, Response, NextFunction } from 'express'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'admin-middleware' })

/**
 * Admin API key middleware.
 * Validates the x-admin-key header against the ADMIN_API_KEY env var.
 * This replaces the previously hardcoded admin password.
 */
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_API_KEY

  if (!adminKey) {
    log.error('ADMIN_API_KEY is not configured')
    res.status(500).json({ error: 'Admin access not configured' })
    return
  }

  const providedKey = req.headers['x-admin-key']

  if (!providedKey || providedKey !== adminKey) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  next()
}
