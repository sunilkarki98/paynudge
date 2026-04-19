import nodemailer from 'nodemailer'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'email-service' })

/**
 * Nodemailer transporter — reused across all email sends.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export interface EmailData {
  clientName: string
  clientEmail: string
  amount: number
  dueDate: string
  invoiceId: string
}

// ─── HTML Helpers ────────────────────────────────────────

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ─── Email Templates ─────────────────────────────────────

function baseTemplate(title: string, content: string, accentColor: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border-radius:16px;overflow:hidden;border:1px solid #334155;">
      <div style="background:linear-gradient(90deg,${accentColor});padding:24px 32px;">
        <h1 style="color:#fff;margin:0;font-size:20px;font-weight:600;">⚡ Invoice Chaser</h1>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#f1f5f9;margin:0 0 24px;font-size:22px;">${escapeHtml(title)}</h2>
        ${content}
      </div>
      <div style="padding:16px 32px;border-top:1px solid #334155;">
        <p style="color:#64748b;font-size:12px;margin:0;">This is an automated reminder from Invoice Chaser. Please do not reply to this email.</p>
      </div>
    </div>
  </div>
</body>
</html>`
}

function invoiceDetails(data: EmailData): string {
  const safeId = escapeHtml(data.invoiceId.slice(-8).toUpperCase())
  return `
    <div style="background:#1e293b;border-radius:12px;padding:20px;margin:20px 0;border:1px solid #334155;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="color:#94a3b8;padding:8px 0;font-size:14px;">Invoice ID</td>
          <td style="color:#f1f5f9;padding:8px 0;text-align:right;font-size:14px;font-weight:600;">#${safeId}</td>
        </tr>
        <tr>
          <td style="color:#94a3b8;padding:8px 0;font-size:14px;">Amount Due</td>
          <td style="color:#22d3ee;padding:8px 0;text-align:right;font-size:14px;font-weight:600;">${escapeHtml(formatCurrency(data.amount))}</td>
        </tr>
        <tr>
          <td style="color:#94a3b8;padding:8px 0;font-size:14px;">Due Date</td>
          <td style="color:#f1f5f9;padding:8px 0;text-align:right;font-size:14px;font-weight:600;">${escapeHtml(formatDate(data.dueDate))}</td>
        </tr>
      </table>
    </div>`
}

function dueDateTemplate(data: EmailData): string {
  const safeName = escapeHtml(data.clientName)
  return baseTemplate(
    'Payment Reminder',
    `<p style="color:#cbd5e1;line-height:1.6;font-size:15px;">Hi ${safeName},</p>
     <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">This is a friendly reminder that your invoice is due today. We'd appreciate it if you could arrange the payment at your earliest convenience.</p>
     ${invoiceDetails(data)}
     <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">Thank you for your prompt attention to this matter! 😊</p>`,
    '#06b6d4,#0891b2'
  )
}

function threeDayTemplate(data: EmailData): string {
  const safeName = escapeHtml(data.clientName)
  return baseTemplate(
    'Payment Follow-Up',
    `<p style="color:#cbd5e1;line-height:1.6;font-size:15px;">Hi ${safeName},</p>
     <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">We hope this message finds you well. We noticed that the following invoice is now <strong style="color:#fbbf24;">3 days past due</strong>. Perhaps it slipped through — we completely understand how busy things can get!</p>
     ${invoiceDetails(data)}
     <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">If you've already sent the payment, please disregard this notice. Otherwise, we'd be grateful if you could process it soon.</p>`,
    '#eab308,#ca8a04'
  )
}

function sevenDayTemplate(data: EmailData): string {
  const safeName = escapeHtml(data.clientName)
  return baseTemplate(
    'Urgent: Payment Overdue',
    `<p style="color:#cbd5e1;line-height:1.6;font-size:15px;">Dear ${safeName},</p>
     <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">This is an important notice regarding your outstanding invoice, which is now <strong style="color:#f97316;">7 days overdue</strong>. We kindly request that you arrange payment as soon as possible to avoid any service disruptions.</p>
     ${invoiceDetails(data)}
     <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">If there are any issues or concerns regarding this payment, please contact us immediately so we can work together to resolve them.</p>`,
    '#f97316,#ea580c'
  )
}

function fourteenDayTemplate(data: EmailData): string {
  const safeName = escapeHtml(data.clientName)
  return baseTemplate(
    '⚠️ Final Notice: Payment Required',
    `<p style="color:#cbd5e1;line-height:1.6;font-size:15px;">Dear ${safeName},</p>
     <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">This is our <strong style="color:#ef4444;">final notice</strong> regarding the outstanding invoice below, which is now <strong style="color:#ef4444;">14 days overdue</strong>. Immediate payment is required to prevent further action.</p>
     ${invoiceDetails(data)}
     <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">Please prioritize this payment immediately. If payment has already been made, please provide confirmation. Failure to respond may result in additional measures being taken.</p>`,
    '#ef4444,#dc2626'
  )
}

const templates = [
  null, // stage 0 — no reminder
  dueDateTemplate,
  threeDayTemplate,
  sevenDayTemplate,
  fourteenDayTemplate,
]

const subjects: Record<number, (invoiceId: string) => string> = {
  1: (id) => `Payment Reminder - Invoice #${id.slice(-8).toUpperCase()}`,
  2: (id) => `Payment Follow-Up - Invoice #${id.slice(-8).toUpperCase()}`,
  3: (id) => `Urgent: Payment Overdue - Invoice #${id.slice(-8).toUpperCase()}`,
  4: (id) => `FINAL NOTICE: Payment Required - Invoice #${id.slice(-8).toUpperCase()}`,
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
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Invoice Chaser" <noreply@invoicechaser.com>',
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

  const content = `
    <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">Welcome to Invoice Chaser!</p>
    <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">Please verify your email address by clicking the button below:</p>
    <div style="margin:30px 0;text-align:center;">
      <a href="${verifyUrl}" style="background:#0ea5e9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Verify Email</a>
    </div>
    <p style="color:#64748b;font-size:13px;word-break:break-all;">If the button doesn't work, copy this link:<br />${verifyUrl}</p>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Invoice Chaser" <noreply@invoicechaser.com>',
      to: email,
      subject: 'Verify your Invoice Chaser account',
      html: baseTemplate('Verify Email Address', content, '#38bdf8,#0ea5e9'),
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

  const content = `
    <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">Someone requested a password reset for your Invoice Chaser account.</p>
    <p style="color:#cbd5e1;line-height:1.6;font-size:15px;">Click the button below to set a new password. This link will expire in 1 hour.</p>
    <div style="margin:30px 0;text-align:center;">
      <a href="${resetUrl}" style="background:#8b5cf6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Reset Password</a>
    </div>
    <p style="color:#64748b;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>
  `

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Invoice Chaser" <noreply@invoicechaser.com>',
      to: email,
      subject: 'Password Reset Request',
      html: baseTemplate('Reset Your Password', content, '#a78bfa,#8b5cf6'),
    })
    return true
  } catch (error) {
    log.error('Failed to send reset email', { email, error: error instanceof Error ? error.message : String(error) })
    return false
  }
}
