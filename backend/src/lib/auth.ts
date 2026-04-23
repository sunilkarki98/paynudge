import * as jwt from 'jsonwebtoken'
import { logger } from './logger'

const log = logger.child({ module: 'auth' })

export interface JWTPayload {
  userId: string
  email: string
  role: string
}

// In-memory cache to avoid DB upsert on every request.
// Bound to 10,000 users to prevent memory leaks in long-running processes.
const knownUsers = new Set<string>()
const MAX_CACHE_SIZE = 10000

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

    // Synchronize user record in our local database ONLY if not seen recently
    if (!knownUsers.has(userId)) {
      try {
        const { prisma } = await import('./prisma')
        await prisma.user.upsert({
          where: { id: userId },
          update: { email }, // Update email if it changed
          create: {
            id: userId,
            email,
            name: decoded.user_metadata?.full_name || decoded.user_metadata?.name || null,
          }
        })
        
        if (knownUsers.size >= MAX_CACHE_SIZE) {
          // Naive eviction: clear entirely and rebuild. Good enough for this scale.
          knownUsers.clear()
        }
        knownUsers.add(userId)
      } catch (syncErr) {
        log.error('Failed to sync user to local DB', { userId, error: syncErr })
        // We continue anyway, but downstream FKs might fail
      }
    }

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
