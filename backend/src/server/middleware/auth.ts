import { Request, Response, NextFunction } from 'express'
import { verifyToken, JWTPayload } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'auth-middleware' })

/**
 * Extend Express Request to include authenticated user payload.
 */
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
    }
  }
}

/**
 * JWT authentication middleware.
 *
 * Extracts token from:
 *   1. Authorization: Bearer <token>  (primary — used by Flutter + web)
 *   2. token cookie (fallback for legacy web sessions)
 *
 * Verifies token via Supabase's getUser() API (supports ES256 + HS256).
 * Auto-creates a User record in the database on first login (for Google OAuth users).
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  let token: string | null = null

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7)
  } else if (req.cookies?.token) {
    token = req.cookies.token
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const payload = await verifyToken(token)
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  req.user = payload
  log.info('Authenticated request', { userId: payload.userId, email: payload.email, path: req.path })
  log.info('Authenticated user', { userId: payload.userId, email: payload.email })

  // Auto-create user in DB if they don't exist yet (e.g., first Google OAuth login)
  try {
    await prisma.user.upsert({
      where: { id: payload.userId },
      update: {},
      create: {
        id: payload.userId,
        email: payload.email,
      },
    })
  } catch (err) {
    log.error('Failed to upsert user', {
      userId: payload.userId,
      error: err instanceof Error ? err.message : String(err),
    })
    // Still proceed — the user is authenticated, DB sync can fail gracefully
  }

  next()
}
