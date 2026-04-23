import nodemailer from 'nodemailer'
import { getSetting } from '@/lib/settings'
import { logger } from '@/lib/logger'
import { 
  EmailData, 
  templates, 
  subjects, 
  getVerificationEmailContent, 
  getPasswordResetEmailContent 
} from '../templates/email.template'

const log = logger.child({ module: 'email-service' })

let transporter: nodemailer.Transporter | null = null
let lastHost = ''

async function getTransporter(): Promise<nodemailer.Transporter> {
  const host = await getSetting('SMTP_HOST', process.env.SMTP_HOST || 'smtp.gmail.com')
  const port = parseInt(await getSetting('SMTP_PORT', process.env.SMTP_PORT || '587'))
  const user = await getSetting('SMTP_USER', process.env.SMTP_USER || '')
  const pass = await getSetting('SMTP_PASS', process.env.SMTP_PASS || '')

  if (transporter && lastHost === host) return transporter

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  lastHost = host
  return transporter
}

/**
 * Send a reminder email for a specific stage.
 * Pure function: given stage + data → sends email. No DB logic.
 * 
 * @returns true if sent successfully, false otherwise.
 * @throws Error if the SMTP transport fails (for BullMQ retry handling).
 */
export async function sendReminderEmail(
  stage: number,
  data: EmailData,
  options?: { throwOnError?: boolean }
): Promise<boolean> {
  const templateFn = templates[stage]
  if (!templateFn) {
    log.warn('Invalid email stage', { stage, invoiceId: data.invoiceId })
    return false
  }

  try {
    const transport = await getTransporter()
    const from = await getSetting('SMTP_FROM', process.env.SMTP_FROM || '"Invoice Chaser" <noreply@invoicechaser.com>')

    await transport.sendMail({
      from,
      to: data.clientEmail,
      subject: subjects[stage](data.invoiceId),
      html: templateFn(data),
    })

    log.info('Reminder email sent', {
      stage,
      clientEmail: data.clientEmail,
      invoiceId: data.invoiceId,
    })
    return true
  } catch (error) {
    log.error('Failed to send reminder email', {
      stage,
      clientEmail: data.clientEmail,
      invoiceId: data.invoiceId,
      error: error instanceof Error ? error.message : String(error),
    })

    if (options?.throwOnError) {
      throw error
    }
    return false
  }
}

// ─── Auth Emails ─────────────────────────────────────────

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const verifyUrl = `${baseUrl}/verify-email?token=${token}`
  const emailContent = getVerificationEmailContent(verifyUrl)

  try {
    const transport = await getTransporter()
    const from = await getSetting('SMTP_FROM', process.env.SMTP_FROM || '"Invoice Chaser" <noreply@invoicechaser.com>')

    await transport.sendMail({
      from,
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
    })
    return true
  } catch (error) {
    log.error('Failed to send verification email', { email, error: error instanceof Error ? error.message : String(error) })
    return false
  }
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const resetUrl = `${baseUrl}/reset-password?token=${token}`
  const emailContent = getPasswordResetEmailContent(resetUrl)

  try {
    const transport = await getTransporter()
    const from = await getSetting('SMTP_FROM', process.env.SMTP_FROM || '"Invoice Chaser" <noreply@invoicechaser.com>')

    await transport.sendMail({
      from,
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
    })
    return true
  } catch (error) {
    log.error('Failed to send reset email', { email, error: error instanceof Error ? error.message : String(error) })
    return false
  }
}
