import { createClient } from '@supabase/supabase-js'
import { logger } from './logger'

const log = logger.child({ module: 'auth' })

/**
 * Supabase Admin client for server-side token verification.
 * Uses the service role key for admin access, or falls back to
 * direct JWT verification via Supabase's getUser() method.
 */
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || ''

  if (!url) {
    log.error('SUPABASE_URL is not set')
    return null
  }

  if (!key) {
    log.error('Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_ANON_KEY is set')
    return null
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export interface JWTPayload {
  userId: string
  email: string
  role: string
}

/**
 * Verify a Supabase access token by calling Supabase's getUser() API.
 * This works with any signing algorithm (HS256, ES256, etc.)
 * because Supabase validates the token server-side.
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) return null

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      log.warn('Token verification failed', {
        error: error?.message || 'No user returned',
        tokenPreview: token.substring(0, 20) + '...',
      })
      return null
    }

    return {
      userId: user.id,
      email: user.email || '',
      role: user.role || 'authenticated',
    }
  } catch (err) {
    log.error('Token verification error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
