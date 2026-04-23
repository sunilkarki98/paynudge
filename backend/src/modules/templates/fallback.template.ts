import { MessageContext, Tone } from '../ai/message-generator'

interface Template { subject: string; body: string; sms: string }

export function getTemplateForStage(stage: number, tone: Tone): Template {
  const templates: Record<Tone, Record<number, Template>> = {
    FRIENDLY: {
      1: {
        subject: 'Quick check-in on Invoice {{invoiceNumber}}',
        body: `Hi {{clientName}},\n\nHope you're having a great week! Just a quick heads up that invoice {{invoiceNumber}} for {{amount}} is due today ({{dueDate}}).\n\nIf you could process that when you have a moment, I'd really appreciate it. Here's a link to settle it: {{paymentLink}}\n\nTalk soon!`,
        sms: 'Hey {{clientName}}! Just a quick heads up that invoice {{invoiceNumber}} for {{amount}} is due today. Thanks!',
      },
      2: {
        subject: 'Invoice {{invoiceNumber}} check-in',
        body: `Hi {{clientName}},\n\nHope you're doing well! I'm just doing some bookkeeping and noticed invoice {{invoiceNumber}} for {{amount}} is a few days past due. No worries at all, I know things get busy!\n\nHere is a link to settle it whenever you get a chance: {{paymentLink}}\n\nLet me know if you have any questions.`,
        sms: 'Hey {{clientName}}, just checking in on invoice {{invoiceNumber}} ({{amount}}). Let me know if you have questions!',
      },
      3: {
        subject: 'Following up on Invoice {{invoiceNumber}}',
        body: `Hi {{clientName}},\n\nI wanted to circle back on invoice {{invoiceNumber}} for {{amount}} that was due on {{dueDate}}. It's currently {{daysOverdue}} days overdue.\n\nCould you please take a look when you get a second? Here's the payment link: {{paymentLink}}\n\nThanks!`,
        sms: 'Hi {{clientName}}, following up on invoice {{invoiceNumber}} ({{amount}}). Could you take a look when you get a chance?',
      },
      4: {
        subject: 'Invoice {{invoiceNumber}} status',
        body: `Hi {{clientName}},\n\nI really need to get invoice {{invoiceNumber}} for {{amount}} squared away, as it's now {{daysOverdue}} days past due.\n\nCould you please let me know when this will be paid? Here is the link: {{paymentLink}}\n\nThanks.`,
        sms: 'Hi {{clientName}}, I need to get invoice {{invoiceNumber}} ({{amount}}) squared away. Please let me know the status.',
      },
    },
    PROFESSIONAL: {
      1: {
        subject: 'Invoice {{invoiceNumber}} is due today',
        body: `Hi {{clientName}},\n\nJust writing to let you know that invoice {{invoiceNumber}} for {{amount}} is due today ({{dueDate}}).\n\nYou can pay it directly here: {{paymentLink}}\n\nBest,`,
        sms: 'Hi {{clientName}}, invoice {{invoiceNumber}} ({{amount}}) is due today. Thanks!',
      },
      2: {
        subject: 'Following up on Invoice {{invoiceNumber}}',
        body: `Hi {{clientName}},\n\nI'm following up because invoice {{invoiceNumber}} for {{amount}} is now {{daysOverdue}} days past its due date of {{dueDate}}.\n\nPlease process this at your earliest convenience. Here is the link: {{paymentLink}}\n\nBest,`,
        sms: 'Hi {{clientName}}, invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days past due. Please process when able.',
      },
      3: {
        subject: 'Invoice {{invoiceNumber}} - Past Due',
        body: `Hi {{clientName}},\n\nInvoice {{invoiceNumber}} for {{amount}} is now {{daysOverdue}} days overdue (due {{dueDate}}). I need to get this resolved as soon as possible.\n\nPlease let me know if there's an issue holding this up, or you can pay here: {{paymentLink}}\n\nRegards,`,
        sms: 'Hi {{clientName}}, invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Please update me on the status.',
      },
      4: {
        subject: 'Overdue Invoice {{invoiceNumber}} - Attention Required',
        body: `Hi {{clientName}},\n\nInvoice {{invoiceNumber}} for {{amount}} has been outstanding for {{daysOverdue}} days. I need this paid immediately.\n\nHere is the link to pay: {{paymentLink}}\n\nPlease let me know when this is handled.`,
        sms: 'Hi {{clientName}}, invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Immediate payment is needed.',
      },
    },
    FIRM: {
      1: {
        subject: 'Invoice {{invoiceNumber}} due today',
        body: `Hi {{clientName}},\n\nInvoice {{invoiceNumber}} for {{amount}} is due today ({{dueDate}}). Please ensure this is processed today.\n\nPayment link: {{paymentLink}}\n\nThanks.`,
        sms: 'Hi {{clientName}}, invoice {{invoiceNumber}} ({{amount}}) is due today. Please process today.',
      },
      2: {
        subject: 'Past Due: Invoice {{invoiceNumber}}',
        body: `Hi {{clientName}},\n\nInvoice {{invoiceNumber}} for {{amount}} is now {{daysOverdue}} days overdue. Please get this paid today.\n\nPayment link: {{paymentLink}}\n\nThanks.`,
        sms: 'Hi {{clientName}}, invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Please process today.',
      },
      3: {
        subject: 'URGENT: Invoice {{invoiceNumber}}',
        body: `Hi {{clientName}},\n\nInvoice {{invoiceNumber}} for {{amount}} is {{daysOverdue}} days overdue. I've sent multiple reminders and need this paid immediately.\n\nPayment link: {{paymentLink}}\n\nPlease confirm when this is paid.`,
        sms: 'Hi {{clientName}}, invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. I need this paid immediately.',
      },
      4: {
        subject: 'FINAL NOTICE: Invoice {{invoiceNumber}}',
        body: `Hi {{clientName}},\n\nThis is my final notice regarding invoice {{invoiceNumber}} for {{amount}}, which is {{daysOverdue}} days late.\n\nIf this isn't paid immediately, I will have to pause all ongoing work and escalate this.\n\nPayment link: {{paymentLink}}\n\nI need this resolved today.`,
        sms: 'Hi {{clientName}}, invoice {{invoiceNumber}} ({{amount}}) is {{daysOverdue}} days overdue. Final notice to pay immediately.',
      },
    },
  }

  // For stage 5+ (recurring chase), use stage 4 template
  const effectiveStage = Math.min(stage, 4)
  return templates[tone][effectiveStage] || templates.PROFESSIONAL[effectiveStage]
}

export function buildEmailHtml(title: string, plainBody: string, ctx: MessageContext): string {
  // Convert plain text to simple HTML paragraphs to mimic a standard email client
  const htmlParagraphs = plainBody
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => `<p style="margin: 0 0 1em 0;">${escapeHtml(p.trim())}</p>`)
    .join('')

  // If the plain text body already included the payment link naturally, we might not need a button.
  // But to be safe and ensure they see it, we can append a very simple hyperlink.
  const paymentLinkHtml = ctx.paymentLink && !plainBody.includes(ctx.paymentLink)
    ? `<p style="margin: 1.5em 0;"><a href="${escapeHtml(ctx.paymentLink)}" style="color: #2563eb; text-decoration: underline;">Pay Invoice ${escapeHtml(ctx.invoiceNumber || '')} ($${ctx.amount.toLocaleString()})</a></p>`
    : ''

  // Standard, minimal HTML that looks like it was sent from Gmail/Outlook
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;font-size:14px;color:#000000;line-height:1.5;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">
    ${htmlParagraphs}
    ${paymentLinkHtml}
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
