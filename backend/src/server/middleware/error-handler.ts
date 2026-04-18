import { Request, Response, NextFunction } from 'express'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'error-handler' })

/**
 * Global Express error handler.
 *
 * Catches all unhandled errors from route handlers and middleware.
 * In production, returns a sanitized error message (no stack trace leak).
 * In development, includes the full error details for debugging.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  log.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  })

  const statusCode = (err as any).statusCode || 500

  if (process.env.NODE_ENV === 'production') {
    res.status(statusCode).json({ error: 'Internal server error' })
  } else {
    res.status(statusCode).json({
      error: err.message,
      stack: err.stack,
    })
  }
}
