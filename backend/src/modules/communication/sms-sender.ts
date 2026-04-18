import Twilio from 'twilio'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'
import { encrypt } from '@/lib/encryption'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'sms-sender' })

/**
 * Dual-mode SMS sender.
 * 
 * Mode A (Preferred): User's own Twilio account
 *   - Uses credentials from UserCredential table
 *   - Sends from their own number
 *   - Full control for the user
 * 
 * Mode B (Fallback): System Twilio account
 *   - Uses env vars (TWILIO_ACCOUNT_SID, etc.)
 *   - Sends from system number
 *   - Clearly labeled as "system sender"
 */

interface SMSSendOptions {
  userId: string
  to: string
  message: string
}

interface SMSSendResult {
  success: boolean
  mode: 'user_twilio' | 'system_twilio' | 'none'
  messageSid?: string
  error?: string
}

/**
 * Send an SMS using the best available method.
 */
export async function sendSMS(options: SMSSendOptions): Promise<SMSSendResult> {
  const { userId, to, message } = options

  // Mode A: Check if user has their own Twilio account
  const userCred = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: 'twilio' } },
  })

  if (userCred) {
    try {
      const result = await sendWithUserTwilio(userCred, to, message)
      return result
    } catch (err) {
      log.warn('User Twilio failed, trying system fallback', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Mode B: Use system Twilio
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const result = await sendWithSystemTwilio(to, message)
      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error('System Twilio also failed', { userId, error: errorMsg })
      return { success: false, mode: 'system_twilio', error: errorMsg }
    }
  }

  log.warn('No SMS provider configured', { userId })
  return { success: false, mode: 'none', error: 'No SMS provider configured' }
}

// ─── Mode A: User's Twilio Account ─────────────────────

async function sendWithUserTwilio(
  credential: { accessToken: string; refreshToken: string | null; metadata: unknown },
  to: string,
  message: string
): Promise<SMSSendResult> {
  const accountSid = decrypt(credential.accessToken) // We store SID in accessToken
  const authToken = credential.refreshToken ? decrypt(credential.refreshToken) : '' // Auth token in refreshToken
  const metadata = credential.metadata as { phoneNumber?: string } | null
  const fromNumber = metadata?.phoneNumber || ''

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Incomplete Twilio credentials')
  }

  const client = Twilio(accountSid, authToken)
  const result = await client.messages.create({
    body: message,
    from: fromNumber,
    to,
  })

  log.info('SMS sent via user Twilio', { to, sid: result.sid })
  return { success: true, mode: 'user_twilio', messageSid: result.sid }
}

// ─── Mode B: System Twilio Account ──────────────────────

async function sendWithSystemTwilio(
  to: string,
  message: string
): Promise<SMSSendResult> {
  const client = Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  )

  const result = await client.messages.create({
    body: `[Invoice Chaser] ${message}`, // Prefix to identify system messages
    from: process.env.TWILIO_PHONE_NUMBER!,
    to,
  })

  log.info('SMS sent via system Twilio', { to, sid: result.sid })
  return { success: true, mode: 'system_twilio', messageSid: result.sid }
}

// ─── Credential Management ──────────────────────────────

/**
 * Store user's Twilio credentials (encrypted).
 * Validates by making a test API call.
 */
export async function connectTwilio(
  userId: string,
  accountSid: string,
  authToken: string,
  phoneNumber: string
): Promise<{ success: boolean; error?: string }> {
  // Validate credentials by fetching account info
  try {
    const client = Twilio(accountSid, authToken)
    await client.api.accounts(accountSid).fetch()
  } catch (err) {
    return {
      success: false,
      error: 'Invalid Twilio credentials. Please check your Account SID and Auth Token.',
    }
  }

  // Store encrypted
  await prisma.userCredential.upsert({
    where: { userId_provider: { userId, provider: 'twilio' } },
    update: {
      accessToken: encrypt(accountSid),
      refreshToken: encrypt(authToken),
      metadata: { phoneNumber },
      updatedAt: new Date(),
    },
    create: {
      userId,
      provider: 'twilio',
      accessToken: encrypt(accountSid),
      refreshToken: encrypt(authToken),
      metadata: { phoneNumber },
    },
  })

  log.info('Twilio connected', { userId, phoneNumber })
  return { success: true }
}

/**
 * Disconnect user's Twilio credentials.
 */
export async function disconnectTwilio(userId: string): Promise<void> {
  await prisma.userCredential.deleteMany({
    where: { userId, provider: 'twilio' },
  })
  log.info('Twilio disconnected', { userId })
}

/**
 * Check if a user has Twilio connected.
 */
export async function isTwilioConnected(userId: string): Promise<{
  connected: boolean
  mode: 'user' | 'system' | 'none'
  phoneNumber?: string
}> {
  const credential = await prisma.userCredential.findUnique({
    where: { userId_provider: { userId, provider: 'twilio' } },
  })

  if (credential) {
    const metadata = credential.metadata as { phoneNumber?: string } | null
    return { connected: true, mode: 'user', phoneNumber: metadata?.phoneNumber }
  }

  // Check if system Twilio is available
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return { connected: true, mode: 'system', phoneNumber: process.env.TWILIO_PHONE_NUMBER }
  }

  return { connected: false, mode: 'none' }
}
