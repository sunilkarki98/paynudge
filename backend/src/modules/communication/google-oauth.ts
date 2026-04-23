import { google } from 'googleapis'
import * as crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/encryption'
import { getSetting } from '@/lib/settings'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'google-oauth' })

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
]

// Used to sign the state parameter for CSRF protection
const OAUTH_STATE_SECRET = process.env.ENCRYPTION_KEY || process.env.SUPABASE_JWT_SECRET || 'fallback-secret-do-not-use-in-prod'

function signState(userId: string): string {
  const hmac = crypto.createHmac('sha256', OAUTH_STATE_SECRET)
  hmac.update(userId)
  const signature = hmac.digest('hex')
  return `${userId}.${signature}`
}

function verifyState(state: string): string | null {
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [userId, signature] = parts
  const expectedSignature = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(userId).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature)) ? userId : null
}

async function getOAuth2Client() {
  const clientId = await getSetting('GOOGLE_CLIENT_ID', process.env.GOOGLE_CLIENT_ID)
  const clientSecret = await getSetting('GOOGLE_CLIENT_SECRET', process.env.GOOGLE_CLIENT_SECRET)
  // Assuming redirect URI usually isn't changed often, but we can allow it or keep env fallback
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/settings/google/callback`

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

/**
 * Generate the Google OAuth authorization URL.
 * User is redirected here to grant permission.
 */
export async function getAuthorizationUrl(userId: string): Promise<string> {
  const client = await getOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Always show consent to get refresh token
    state: signState(userId), // Pass signed userId to identify user and prevent CSRF
  })
}

/**
 * Exchange authorization code for tokens and store them encrypted.
 */
export async function handleOAuthCallback(code: string, state: string): Promise<{ email: string }> {
  const userId = verifyState(state)
  if (!userId) {
    throw new Error('Invalid or forged OAuth state parameter')
  }

  const client = await getOAuth2Client()
  const { tokens } = await client.getToken(code)

  if (!tokens.access_token) {
    throw new Error('No access token received from Google')
  }

  // Get user's email
  client.setCredentials(tokens)
  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const userInfo = await oauth2.userinfo.get()
  const email = userInfo.data.email || ''

  // Store encrypted tokens
  await prisma.userCredential.upsert({
    where: { userId_provider: { userId, provider: 'google_oauth' } },
    update: {
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      metadata: { email, scope: tokens.scope },
      updatedAt: new Date(),
    },
    create: {
      userId,
      provider: 'google_oauth',
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      metadata: { email, scope: tokens.scope },
    },
  })

  log.info('Google OAuth connected', { userId, email })
  return { email }
}

/**
 * Get an authenticated Gmail client for a user.
 * Handles automatic token refresh.
 */
export async function getGmailClient(userId: string) {
  const credential = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: 'google_oauth' } },
  })

  if (!credential) return null

  const client = await getOAuth2Client()
  const accessToken = decrypt(credential.accessToken)
  const refreshToken = credential.refreshToken ? decrypt(credential.refreshToken) : undefined

  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: credential.tokenExpiry?.getTime(),
  })

  // Handle token refresh
  client.on('tokens', async (newTokens) => {
    try {
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      }
      if (newTokens.access_token) {
        updateData.accessToken = encrypt(newTokens.access_token)
      }
      if (newTokens.refresh_token) {
        updateData.refreshToken = encrypt(newTokens.refresh_token)
      }
      if (newTokens.expiry_date) {
        updateData.tokenExpiry = new Date(newTokens.expiry_date)
      }

      await prisma.userCredential.update({
        where: { userId_provider: { userId, provider: 'google_oauth' } },
        data: updateData,
      })
      log.info('Google OAuth tokens refreshed', { userId })
    } catch (err) {
      log.error('Failed to save refreshed tokens', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return google.gmail({ version: 'v1', auth: client })
}

/**
 * Send an email via Gmail API (appears in user's Sent folder).
 */
export async function sendViaGmail(
  userId: string,
  to: string,
  subject: string,
  htmlBody: string,
  fromEmail?: string
): Promise<boolean> {
  const gmail = await getGmailClient(userId)
  if (!gmail) return false

  const credential = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: 'google_oauth' } },
  })
  const senderEmail = fromEmail || (credential?.metadata as { email?: string })?.email || ''

  // Build RFC 2822 message
  const messageParts = [
    `From: ${senderEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ]

  const rawMessage = Buffer.from(messageParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMessage },
    })

    log.info('Email sent via Gmail', { userId, to, subject })
    return true
  } catch (err) {
    log.error('Gmail send failed', {
      userId,
      to,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

/**
 * Disconnect Google OAuth for a user.
 */
export async function disconnectGoogle(userId: string): Promise<void> {
  const credential = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: 'google_oauth' } },
  })

  if (credential) {
    // Try to revoke the token
    try {
      const client = await getOAuth2Client()
      const accessToken = decrypt(credential.accessToken)
      await client.revokeToken(accessToken)
    } catch {
      // Ignore revocation errors — delete the credential anyway
    }

    await prisma.userCredential.delete({
      where: { userId_provider: { userId, provider: 'google_oauth' } },
    })

    log.info('Google OAuth disconnected', { userId })
  }
}

/**
 * Check if a user has Google OAuth connected.
 */
export async function isGoogleConnected(userId: string): Promise<{
  connected: boolean
  email?: string
}> {
  const credential = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: 'google_oauth' } },
  })

  if (!credential) return { connected: false }

  const metadata = credential.metadata as { email?: string } | null
  return {
    connected: true,
    email: metadata?.email,
  }
}
