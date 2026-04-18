import Twilio from 'twilio'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'whatsapp-sender' })

/**
 * Dual-mode WhatsApp sender via Twilio's WhatsApp API.
 * 
 * Mode A (Preferred): User's own Twilio account
 *   - Uses credentials from UserCredential table (provider: 'twilio')
 *   - Sends from their own WhatsApp-enabled Twilio number
 * 
 * Mode B (Fallback): System Twilio account
 *   - Uses env vars (TWILIO_ACCOUNT_SID, etc.)
 *   - Sends from system WhatsApp number (sandbox or production)
 * 
 * Twilio WhatsApp API uses the same messages.create() as SMS,
 * but with `whatsapp:` prefix on the from/to numbers.
 * 
 * Sandbox: Requires recipients to opt-in first by sending
 *   "join <keyword>" to the sandbox number.
 * 
 * Production: Requires Meta Business verification and
 *   approved message templates for business-initiated messages.
 */

interface WhatsAppSendOptions {
  userId: string
  to: string       // Phone number with country code, e.g., "+14155238886"
  message: string  // Message body
}

interface WhatsAppSendResult {
  success: boolean
  mode: 'user_twilio' | 'system_twilio' | 'none'
  messageSid?: string
  error?: string
}

/**
 * Send a WhatsApp message using the best available method.
 */
export async function sendWhatsApp(options: WhatsAppSendOptions): Promise<WhatsAppSendResult> {
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
      log.warn('User Twilio WhatsApp failed, trying system fallback', {
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
      log.error('System Twilio WhatsApp also failed', { userId, error: errorMsg })
      return { success: false, mode: 'system_twilio', error: errorMsg }
    }
  }

  log.warn('No WhatsApp provider configured', { userId })
  return { success: false, mode: 'none', error: 'No WhatsApp provider configured' }
}

// ─── Mode A: User's Twilio Account ─────────────────────

async function sendWithUserTwilio(
  credential: { accessToken: string; refreshToken: string | null; metadata: unknown },
  to: string,
  message: string
): Promise<WhatsAppSendResult> {
  const accountSid = decrypt(credential.accessToken)
  const authToken = credential.refreshToken ? decrypt(credential.refreshToken) : ''
  const metadata = credential.metadata as { phoneNumber?: string; whatsappNumber?: string } | null
  // Prefer a dedicated WhatsApp number, fall back to the SMS number
  const fromNumber = metadata?.whatsappNumber || metadata?.phoneNumber || ''

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Incomplete Twilio credentials for WhatsApp')
  }

  const client = Twilio(accountSid, authToken)
  const result = await client.messages.create({
    body: message,
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${to}`,
  })

  log.info('WhatsApp sent via user Twilio', { to, sid: result.sid })
  return { success: true, mode: 'user_twilio', messageSid: result.sid }
}

// ─── Mode B: System Twilio Account ──────────────────────

async function sendWithSystemTwilio(
  to: string,
  message: string
): Promise<WhatsAppSendResult> {
  const client = Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  )

  // Use a dedicated WhatsApp number env var, or fall back to the general Twilio number
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER!

  const result = await client.messages.create({
    body: `[Invoice Chaser] ${message}`,
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${to}`,
  })

  log.info('WhatsApp sent via system Twilio', { to, sid: result.sid })
  return { success: true, mode: 'system_twilio', messageSid: result.sid }
}
