import * as jwt from 'jsonwebtoken'
import { logger } from './logger'

const log = logger.child({ module: 'auth' })

export interface JWTPayload {
  userId: string
  email: string
  role: string
}

/**
 * Verify a Supabase access token locally using jsonwebtoken.
 * This eliminates the ~200ms network penalty of calling Supabase APIs.
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const secret = process.env.SUPABASE_JWT_SECRET
    if (!secret) {
      log.error('SUPABASE_JWT_SECRET is not set in environment variables')
      return null
    }

    // Supabase JWTs use HS256. If the token is invalid or expired, this will throw.
    const decoded = jwt.verify(token, secret) as any

    if (!decoded || !decoded.sub) {
      log.warn('Token missing sub (userId) claim')
      return null
    }

    const userId = decoded.sub
    const email = decoded.email || ''
    const role = decoded.role || 'authenticated'



    return {
      userId,
      email,
      role,
    }
  } catch (err) {
    log.warn('Token verification failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
