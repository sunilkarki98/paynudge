import { GoogleGenerativeAI } from '@google/generative-ai'
import { getSetting } from '@/lib/settings'
import { logger } from '@/lib/logger'
import { getTemplateForStage, buildEmailHtml } from '../templates/fallback.template'

const log = logger.child({ module: 'message-generator' })

// ─── Types ───────────────────────────────────────────────

export type Tone = 'FRIENDLY' | 'PROFESSIONAL' | 'FIRM'

export interface MessageContext {
  clientName: string
  invoiceNumber?: string
  amount: number
  dueDate: string // ISO string or formatted date
  stage: number   // 1=friendly, 2=check-in, 3=firm, 4=final
  daysOverdue?: number
  paymentLink?: string
  tone: Tone
  senderName?: string // Defaults to the user's name if available
  behaviorProfile?: string
  behaviorType?: string // The new behavioral intelligence type
  overrideTone?: string
  shieldMode?: boolean
}

export interface GeneratedMessage {
  subject: string
  htmlBody: string
  plainText: string
  smsText?: string // Short version for SMS (≤160 chars)
  source: 'llm' | 'template' // Which generator was used
  persuasionStrategy?: string
  toneUsed?: Tone
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
    FRIENDLY: 'Warm, casual, like a quick check-in from a friend. Very natural language, do not sound automated.',
    PROFESSIONAL: 'Polite, direct, standard business email style. Keep it human but strictly professional.',
    FIRM: 'Serious and urgent, but still human. Do not sound like a corporate collection agency, sound like a frustrated but professional contractor.',
  }

  let actualTone = ctx.tone

  // Shield Mode strictly caps tone at PROFESSIONAL
  if (ctx.shieldMode && actualTone === 'FIRM') {
    actualTone = 'PROFESSIONAL'
  }

  if (ctx.overrideTone && ['FRIENDLY', 'PROFESSIONAL', 'FIRM'].includes(ctx.overrideTone)) {
    actualTone = ctx.overrideTone as Tone
  } else if (ctx.behaviorProfile === 'RELIABLE' && actualTone === 'FIRM') {
    actualTone = 'PROFESSIONAL' // downgrade strictness for historically great clients
  } else if (ctx.behaviorProfile === 'GHOST' && actualTone === 'FRIENDLY') {
    actualTone = 'FIRM' // upgrade strictness for known ghosts
  }
  
  if (ctx.shieldMode && actualTone === 'FIRM') {
    actualTone = 'PROFESSIONAL' // Double check overriding doesn't bypass shield mode
  }

  const date = new Date()
  const isEndOfMonth = date.getDate() > 25
  const isStartOfMonth = date.getDate() <= 5

  let reasonWhy = ''
  if (actualTone === 'FRIENDLY' || actualTone === 'PROFESSIONAL') {
    if (isEndOfMonth) {
      reasonWhy = "I'm currently wrapping up my bookkeeping for the month and trying to close out open ledgers."
    } else if (isStartOfMonth) {
      reasonWhy = "I'm doing my start-of-month accounting reconciliation."
    } else {
      reasonWhy = "I am doing my weekly admin and bookkeeping."
    }
  } else if (actualTone === 'FIRM') {
    reasonWhy = "I am finalizing my schedule and accounting. I cannot allocate further hours or lock in new project dates until past-due balances are cleared."
  }

  const stageContext = ctx.daysOverdue && ctx.daysOverdue > 0
    ? `The invoice is ${ctx.daysOverdue} days overdue.`
    : 'The invoice is due today or coming up soon.'

  const behavioralContext = ctx.behaviorType 
    ? `Client Behavioral Profile: ${ctx.behaviorType}. Adapt your psychological framing accordingly (e.g. if AVOIDANT, be extremely clear and set boundaries. If CASHFLOW_CONSTRAINED and amount > 5000, consider subtly suggesting they can split the payment).`
    : ''

  const shieldModeRules = ctx.shieldMode
    ? `\n8. SHIELD MODE ACTIVE: You must actively vary the phrasing so it doesn't look like a template. Include a very human, slightly randomized conversational opening or closing.`
    : ''

  const prompt = `You are writing a payment reminder email for a freelancer's invoicing system.

CONTEXT:
- Client name: ${ctx.clientName}
- Invoice: ${ctx.invoiceNumber || 'N/A'}
- Amount: $${ctx.amount.toLocaleString()}
- Due date: ${ctx.dueDate}
- ${stageContext}
- Sender: ${ctx.senderName || 'the freelancer'}
- REAL-WORLD REASON FOR EMAILING TODAY (incorporate this organically): "${reasonWhy}"
${ctx.paymentLink ? `- Payment link: ${ctx.paymentLink}` : ''}
${behavioralContext}

TONE: ${actualTone} — ${toneInstructions[actualTone]}

RULES:
1. MUST sound 100% human-typed and organic, not automated. Do not use phrases like "This is a reminder".
2. Keep it SHORT (2-4 sentences max for the body).
3. Naturally mention the invoice amount and due date in passing.
4. If a payment link is provided, include it organically (e.g., "Here's a link to settle it: [link]").
5. End with a natural sign-off line (e.g., "Best,", "Thanks,", "Talk soon,"). Vary these so they aren't identical.
6. Use natural greetings like "Hi {name}" or "Hey {name},".
7. Make slight conversational variations so repeated messages don't feel robotic.${shieldModeRules}

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{
  "subject": "Email subject line",
  "body": "Plain text email body (just the message, no subject)",
  "sms": "SMS version in under 155 characters",
  "persuasionStrategy": "Short description of the behavioral strategy used (e.g., Loss Aversion Framing, Social Proof, Benefit of the Doubt)"
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

  let parsed: { subject: string; body: string; sms: string; persuasionStrategy?: string }
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

  // Safety rail: Prevent LLM hallucinated essays from breaking the UI
  let safePersuasionStrategy = parsed.persuasionStrategy
  if (safePersuasionStrategy && safePersuasionStrategy.length > 60) {
    log.warn('LLM returned overly long persuasion strategy, truncating', { length: safePersuasionStrategy.length })
    safePersuasionStrategy = safePersuasionStrategy.substring(0, 57) + '...'
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
    persuasionStrategy: safePersuasionStrategy,
    toneUsed: actualTone,
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
    persuasionStrategy: 'Standard Template (No AI)',
    toneUsed: ctx.tone,
  }
}

// Removed templates and HTML helpers to src/modules/templates/fallback.template.ts
