import nodemailer from 'nodemailer'
import { sendViaGmail, isGoogleConnected } from './google-oauth'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'email-sender' })

/**
 * Unified email sender — strategy pattern.
 * 
 * Priority:
 * 1. If user has Google OAuth connected → send via Gmail API (from their address)
 * 2. Fallback → use system SMTP via Nodemailer
 * 
 * Automatically injects tracking pixel if trackingUrl is provided.
 */

interface SendEmailOptions {
  userId: string
  to: string
  subject: string
  htmlBody: string
  plainText?: string
  trackingPixelUrl?: string // URL to 1x1 tracking pixel
}

interface SendResult {
  success: boolean
  channel: 'gmail' | 'smtp'
  error?: string
}

/**
 * Send an email using the best available method for the user.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendResult> {
  const { userId, to, subject, htmlBody, trackingPixelUrl } = options

  // Inject tracking pixel if provided
  let finalHtml = htmlBody
  if (trackingPixelUrl) {
    finalHtml = injectTrackingPixel(htmlBody, trackingPixelUrl)
  }

  // Strategy 1: Try Gmail API (user's own account)
  const googleStatus = await isGoogleConnected(userId)
  if (googleStatus.connected) {
    try {
      const success = await sendViaGmail(userId, to, subject, finalHtml)
      if (success) {
        log.info('Email sent via Gmail', { userId, to, subject })
        return { success: true, channel: 'gmail' }
      }
    } catch (err) {
      log.warn('Gmail send failed, falling back to SMTP', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Strategy 2: Fallback to system SMTP
  try {
    await sendViaSMTP(to, subject, finalHtml, options.plainText)
    log.info('Email sent via SMTP', { userId, to, subject })
    return { success: true, channel: 'smtp' }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.error('SMTP send failed', { userId, to, error: errorMsg })
    return { success: false, channel: 'smtp', error: errorMsg }
  }
}

// ─── SMTP Sender ────────────────────────────────────────

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
  return transporter
}

async function sendViaSMTP(
  to: string,
  subject: string,
  htmlBody: string,
  plainText?: string
): Promise<void> {
  const transport = getTransporter()
  await transport.sendMail({
    from: process.env.SMTP_FROM || '"Invoice Chaser" <noreply@invoicechaser.com>',
    to,
    subject,
    html: htmlBody,
    text: plainText,
  })
}

// ─── Tracking Pixel Injection ───────────────────────────

function injectTrackingPixel(html: string, pixelUrl: string): string {
  // Insert before closing </body> tag
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`

  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`)
  }

  // If no body tag, append to end
  return html + pixel
}
