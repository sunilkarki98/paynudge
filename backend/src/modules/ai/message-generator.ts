import { GoogleGenerativeAI } from '@google/generative-ai'
import { getSetting } from '@/lib/settings'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'message-generator' })

// ─── Types ───────────────────────────────────────────────

export type Tone = 'FRIENDLY' | 'PROFESSIONAL' | 'FIRM'

export interface MessageContext {
  clientName: string
  invoiceNumber?: string
  amount: number
  dueDate: string
  daysOverdue?: number
  stage: number // 1=due, 2=3day, 3=7day, 4=14day, 5+=recurring
  paymentLink?: string
  senderName?: string
  tone: Tone
}

export interface GeneratedMessage {
  subject: string
  htmlBody: string
  plainText: string
  smsText?: string // Short version for SMS (≤160 chars)
  source: 'llm' | 'template' // Which generator was used
}

// ─── LLM Generator ──────────────────────────────────────

async function getGenAI(): Promise<GoogleGenerativeAI | null> {
  const apiKey = await getSetting('GEMINI_API_KEY')
  if (!apiKey) {
    log.warn('GEMINI_API_KEY not set — falling back to template-based messages')
    return null
  }
  return new GoogleGenerativeAI(apiKey)
}

/**
 * Generate a payment reminder message using Gemini AI.
 * Falls back to template-based generation if LLM is unavailable.
 */
export async function generateMessage(ctx: MessageContext): Promise<GeneratedMessage> {
  // Try LLM first
  const ai = await getGenAI()
  if (ai) {
    try {
      return await generateWithLLM(ai, ctx)
    } catch (err) {
      log.error('LLM message generation failed, falling back to templates', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Fallback to template-based generation
  return generateWithTemplate(ctx)
}

async function generateWithLLM(
  ai: GoogleGenerativeAI,
  ctx: MessageContext
): Promise<GeneratedMessage> {
  const generatorModel = await getSetting('GEMINI_GENERATOR_MODEL', 'gemini-2.0-flash')
  const model = ai.getGenerativeModel({ model: generatorModel })

  const toneInstructions = {
    FRIENDLY: 'warm, casual, empathetic. Use conversational language. Assume good intent. Brief use of emoji is ok.',
    PROFESSIONAL: 'formal, polite, direct. Business-like and respectful. No emoji. Clear and concise.',
    FIRM: 'direct, serious, urgent. Mention potential consequences professionally. Still respectful but leave no ambiguity about urgency.',
  }

  const stageContext = ctx.daysOverdue && ctx.daysOverdue > 0
    ? `The invoice is ${ctx.daysOverdue} days overdue.`
    : 'The invoice is due today or coming up soon.'

  const prompt = `You are writing a payment reminder email for a freelancer's invoicing system.

CONTEXT:
- Client name: ${ctx.clientName}
- Invoice: ${ctx.invoiceNumber || 'N/A'}
- Amount: $${ctx.amount.toLocaleString()}
- Due date: ${ctx.dueDate}
- ${stageContext}
- This is reminder stage ${ctx.stage} of the escalation sequence.
- Sender: ${ctx.senderName || 'the freelancer'}
${ctx.paymentLink ? `- Payment link: ${ctx.paymentLink}` : ''}

TONE: ${ctx.tone} — ${toneInstructions[ctx.tone]}

RULES:
1. Keep it SHORT (3-5 sentences max for the body)
2. Do NOT be aggressive, threatening, or spammy
3. Do NOT use legal threats or collection agency language
4. Include the invoice amount and due date naturally
5. If a payment link is provided, mention it as a convenient way to pay
6. End with a professional sign-off line
7. Do NOT include "Dear" or overly formal greetings — use "Hi {name}" or "Hello {name}"
8. The email must work standalone without any attachments

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{
  "subject": "Email subject line",
  "body": "Plain text email body (just the message, no subject)",
  "sms": "SMS version in under 155 characters"
}`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  // Parse LLM response — handle markdown code blocks
  let cleaned = text
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/```\s*$/, '')
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '')
  }

  let parsed: { subject: string; body: string; sms: string }
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    log.warn('Failed to parse LLM JSON response, falling back to template', { raw: text })
    return generateWithTemplate(ctx)
  }

  // Validate parsed fields
  if (!parsed.subject || !parsed.body) {
    log.warn('LLM returned incomplete response, falling back to template')
    return generateWithTemplate(ctx)
  }

  // Build HTML version
  const htmlBody = buildEmailHtml(parsed.subject, parsed.body, ctx)

  log.info('LLM message generated', {
    tone: ctx.tone,
    stage: ctx.stage,
    clientName: ctx.clientName,
  })

  return {
    subject: parsed.subject,
    htmlBody,
    plainText: parsed.body,
    smsText: parsed.sms || undefined,
    source: 'llm',
  }
}

// ─── Template-Based Fallback ────────────────────────────

function generateWithTemplate(ctx: MessageContext): GeneratedMessage {
  const templates = getTemplateForStage(ctx.stage, ctx.tone)
  const vars: Record<string, string> = {
    '{{clientName}}': ctx.clientName,
    '{{amount}}': `$${ctx.amount.toLocaleString()}`,
    '{{dueDate}}': new Date(ctx.dueDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    }),
    '{{daysOverdue}}': String(ctx.daysOverdue || 0),
    '{{invoiceNumber}}': ctx.invoiceNumber || `#${Date.now().toString(36).toUpperCase()}`,
    '{{paymentLink}}': ctx.paymentLink || '',
    '{{senderName}}': ctx.senderName || 'Invoice Chaser',
  }

  let subject = templates.subject
  let body = templates.body
  let sms = templates.sms

  for (const [key, value] of Object.entries(vars)) {
    subject = subject.replaceAll(key, value)
    body = body.replaceAll(key, value)
    sms = sms.replaceAll(key, value)
  }

  // Remove payment link sentence if no link provided
  if (!ctx.paymentLink) {
    body = body.replace(/You can pay quickly[^.]*\./g, '')
    body = body.replace(/Pay now:.*\n?/g, '')
  }

  const htmlBody = buildEmailHtml(subject, body, ctx)

  return {
    subject,
    htmlBody,
    plainText: body,
    smsText: sms.length <= 160 ? sms : sms.substring(0, 157) + '...',
    source: 'template',
  }
}

interface Template { subject: string; body: string; sms: string }

function getTemplateForStage(stage: number, tone: Tone): Template {
  const templates: Record<Tone, Record<number, Template>> = {
    FRIENDLY: {
      1: {
        subject: 'Friendly reminder — Invoice {{invoiceNumber}} is due today',
        body: `Hi {{clientName}},\n\nJust a quick heads-up that invoice {{invoiceNumber}} for {{amount}} is due today ({{dueDate}}). No rush—just wanted to make sure it didn't slip through the cracks! 😊\n\nYou can pay quickly here: {{paymentLink}}\n\nThanks so much!`,
        sms: 'Hi {{clientName}}! Reminder: Invoice {{invoiceNumber}} ({{amount}}) is due today. Thanks!',
      },
      2: {
        subject: 'Checking in — Invoice {{invoiceNumber}} is {{daysOverdue}} days past due',
        body: `Hi {{clientName}},\n\nHope you're doing well! I noticed invoice {{invoiceNumber}} for {{amount}} is now {{daysOverdue}} days past due. Totally understand if it slipped by — happens to all of us!\n\nYou can pay quickly here: {{paymentLink}}\n\nWould love to get this sorted. Let me know if you have any questions!`,
        sms: 'Hi {{clientName}}, just checking in — invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days past due. Let me know!',
      },
      3: {
        subject: 'Following up — Invoice {{invoiceNumber}} is now {{daysOverdue}} days overdue',
        body: `Hi {{clientName}},\n\nI wanted to follow up on invoice {{invoiceNumber}} for {{amount}} which was due on {{dueDate}} — it's now {{daysOverdue}} days overdue. I'd really appreciate it if you could look into this when you get a chance.\n\nYou can pay quickly here: {{paymentLink}}\n\nIf there's an issue, please let me know so we can work it out together!`,
        sms: 'Hi {{clientName}}, invoice {{invoiceNumber}} ({{amount}}) is now {{daysOverdue}} days overdue. Please let me know the status.',
      },
      4: {
        subject: 'Final reminder — Invoice {{invoiceNumber}} requires your attention',
        body: `Hi {{clientName}},\n\nThis is my final reminder about invoice {{invoiceNumber}} for {{amount}}, which is now {{daysOverdue}} days past due since {{dueDate}}. I really need to get this resolved.\n\nYou can pay quickly here: {{paymentLink}}\n\nPlease let me know how you'd like to proceed. I value our working relationship and want to sort this out.`,
        sms: 'Final reminder: Invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Please arrange payment. Thanks.',
      },
    },
    PROFESSIONAL: {
      1: {
        subject: 'Payment Reminder — Invoice {{invoiceNumber}}',
        body: `Hello {{clientName}},\n\nThis is a reminder that invoice {{invoiceNumber}} for {{amount}} is due today, {{dueDate}}. We would appreciate prompt payment at your earliest convenience.\n\nYou can pay quickly here: {{paymentLink}}\n\nThank you for your attention to this matter.`,
        sms: 'Reminder: Invoice {{invoiceNumber}} ({{amount}}) is due today. Please arrange payment. Thank you.',
      },
      2: {
        subject: 'Payment Follow-Up — Invoice {{invoiceNumber}}',
        body: `Hello {{clientName}},\n\nWe would like to bring to your attention that invoice {{invoiceNumber}} for {{amount}} is now {{daysOverdue}} days past the due date of {{dueDate}}.\n\nYou can pay quickly here: {{paymentLink}}\n\nIf payment has already been made, please disregard this notice. Otherwise, we kindly request that you arrange payment at your earliest convenience.`,
        sms: 'Invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days past due. Please arrange payment.',
      },
      3: {
        subject: 'Urgent: Payment Overdue — Invoice {{invoiceNumber}}',
        body: `Dear {{clientName}},\n\nThis is an important notice regarding invoice {{invoiceNumber}} for {{amount}}, which is now {{daysOverdue}} days overdue since {{dueDate}}. We kindly request immediate payment to avoid any disruption to our services.\n\nYou can pay quickly here: {{paymentLink}}\n\nIf there are any concerns regarding this payment, please contact us immediately so we can work together to resolve them.`,
        sms: 'Urgent: Invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Immediate payment requested.',
      },
      4: {
        subject: 'Final Notice: Payment Required — Invoice {{invoiceNumber}}',
        body: `Dear {{clientName}},\n\nThis is our final notice regarding invoice {{invoiceNumber}} for {{amount}}, which has been outstanding for {{daysOverdue}} days since the due date of {{dueDate}}. Immediate payment is required.\n\nYou can pay quickly here: {{paymentLink}}\n\nPlease arrange payment immediately or provide confirmation if payment has already been made. Failure to respond may necessitate additional measures.`,
        sms: 'FINAL NOTICE: Invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Immediate payment required.',
      },
    },
    FIRM: {
      1: {
        subject: 'Payment Due Today — Invoice {{invoiceNumber}}',
        body: `{{clientName}},\n\nInvoice {{invoiceNumber}} for {{amount}} is due today, {{dueDate}}. Please ensure payment is processed today.\n\nPay now: {{paymentLink}}\n\nThank you.`,
        sms: 'Invoice {{invoiceNumber}} ({{amount}}) due today. Please pay promptly.',
      },
      2: {
        subject: 'Overdue Payment — Invoice {{invoiceNumber}} ({{daysOverdue}} Days)',
        body: `{{clientName}},\n\nInvoice {{invoiceNumber}} for {{amount}} is now {{daysOverdue}} days overdue. This payment was due on {{dueDate}} and requires your immediate attention.\n\nPay now: {{paymentLink}}\n\nPlease arrange payment today.`,
        sms: 'Invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Immediate payment needed.',
      },
      3: {
        subject: 'URGENT: Overdue Invoice {{invoiceNumber}} — {{daysOverdue}} Days Outstanding',
        body: `{{clientName}},\n\nInvoice {{invoiceNumber}} for {{amount}} has been outstanding for {{daysOverdue}} days. Despite previous reminders, payment has not been received. This matter requires your urgent attention.\n\nPay now: {{paymentLink}}\n\nPlease process this payment immediately or contact us to discuss the situation. Continued non-payment may result in suspension of services.`,
        sms: 'URGENT: Invoice {{invoiceNumber}} ({{amount}}) {{daysOverdue}} days overdue. Pay now or contact us immediately.',
      },
      4: {
        subject: 'FINAL NOTICE — Invoice {{invoiceNumber}} ({{daysOverdue}} Days Overdue)',
        body: `{{clientName}},\n\nThis is our FINAL notice regarding invoice {{invoiceNumber}} for {{amount}}, now {{daysOverdue}} days past the due date of {{dueDate}}.\n\nPay now: {{paymentLink}}\n\nIf payment is not received within 48 hours, we will be forced to take further action, which may include suspension of ongoing work and formal collection proceedings. Please treat this as a matter of urgency.`,
        sms: 'FINAL NOTICE: Invoice {{invoiceNumber}} ({{amount}}) {{daysOverdue}}d overdue. Payment required within 48hrs.',
      },
    },
  }

  // For stage 5+ (recurring chase), use stage 4 template
  const effectiveStage = Math.min(stage, 4)
  return templates[tone][effectiveStage] || templates.PROFESSIONAL[effectiveStage]
}

// ─── HTML Email Builder ─────────────────────────────────

function buildEmailHtml(title: string, plainBody: string, ctx: MessageContext): string {
  const accentColors: Record<number, string> = {
    1: '#06b6d4,#0891b2', // Cyan
    2: '#eab308,#ca8a04', // Yellow
    3: '#f97316,#ea580c', // Orange
    4: '#ef4444,#dc2626', // Red
  }
  const accent = accentColors[Math.min(ctx.stage, 4)] || accentColors[1]

  // Convert plain text to HTML paragraphs
  const htmlParagraphs = plainBody
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p style="color:#cbd5e1;line-height:1.6;font-size:15px;margin:0 0 16px;">${escapeHtml(p.trim())}</p>`)
    .join('')

  // Payment link button
  const paymentButton = ctx.paymentLink
    ? `<div style="margin:24px 0;text-align:center;">
        <a href="${escapeHtml(ctx.paymentLink)}" style="background:linear-gradient(90deg,#06b6d4,#8b5cf6);color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block;font-size:16px;">💳 Pay Now — $${ctx.amount.toLocaleString()}</a>
      </div>`
    : ''

  // Invoice details card
  const invoiceId = ctx.invoiceNumber || 'N/A'
  const detailsCard = `
    <div style="background:#1e293b;border-radius:12px;padding:20px;margin:20px 0;border:1px solid #334155;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="color:#94a3b8;padding:8px 0;font-size:14px;">Invoice</td>
          <td style="color:#f1f5f9;padding:8px 0;text-align:right;font-size:14px;font-weight:600;">${escapeHtml(invoiceId)}</td>
        </tr>
        <tr>
          <td style="color:#94a3b8;padding:8px 0;font-size:14px;">Amount Due</td>
          <td style="color:#22d3ee;padding:8px 0;text-align:right;font-size:14px;font-weight:600;">$${ctx.amount.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="color:#94a3b8;padding:8px 0;font-size:14px;">Due Date</td>
          <td style="color:#f1f5f9;padding:8px 0;text-align:right;font-size:14px;font-weight:600;">${escapeHtml(new Date(ctx.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</td>
        </tr>
      </table>
    </div>`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="background:linear-gradient(135deg,#1e293b 0%,#0f172a 100%);border-radius:16px;overflow:hidden;border:1px solid #334155;">
      <div style="background:linear-gradient(90deg,${accent});padding:24px 32px;">
        <h1 style="color:#fff;margin:0;font-size:20px;font-weight:600;">⚡ Invoice Chaser</h1>
      </div>
      <div style="padding:32px;">
        ${htmlParagraphs}
        ${detailsCard}
        ${paymentButton}
      </div>
      <div style="padding:16px 32px;border-top:1px solid #334155;">
        <p style="color:#64748b;font-size:12px;margin:0;">This is an automated reminder from Invoice Chaser.</p>
      </div>
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
