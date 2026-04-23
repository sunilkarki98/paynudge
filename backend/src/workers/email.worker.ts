import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/infrastructure/redis'
import { QUEUE_NAMES } from '@/modules/queues/queue-names'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { withIdempotencyGuard } from '@/modules/queues/job-wrapper'
import type { EmailJobData } from '@/modules/queues/email-queue'
import type { Tone } from '@/modules/ai/message-generator'

const log = logger.child({ module: 'email-worker' })

/**
 * Email Worker — processes email jobs from the BullMQ queue.
 * 
 * Reliability guarantees:
 * 
 * 1. IDEMPOTENCY (two layers):
 *    Layer 1: BullMQ rejects duplicate job IDs at enqueue time
 *    Layer 2: Before sending, we check the invoice's idempotencyKeys array
 *             using an atomic Prisma updateMany with a WHERE clause that
 *             ensures the key hasn't been added yet
 * 
 * 2. RETRY with exponential backoff:
 *    BullMQ handles retries automatically (configured at enqueue time)
 *    30s → 60s → 120s → 240s → 480s
 * 
 * 3. DEAD LETTER:
 *    After 5 failed attempts, the job stays in the failed set.
 *    We log it as "dead_letter" in the ReminderLog for manual review.
 * 
 * 4. RACE CONDITION safety:
 *    The atomic updateMany with idempotencyKey check prevents
 *    duplicate sends even with multiple worker instances.
 */

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { invoiceId, stage, clientEmail, clientName, amount, dueDate, daysOverdue, paymentLinkToken, reminderTone, customMessage } = job.data

  await withIdempotencyGuard('email', job, async (invoice) => {
    // Dynamic import to prevent circular deps during worker boot
    const { generateMessage } = await import('@/modules/ai/message-generator')
    const { sendEmail } = await import('@/modules/communication/email-sender')
    
    // Fetch client and user to retrieve behavioral profile and tone overrides
    const invoiceRecord = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { 
        client: true,
        user: { select: { shieldMode: true } }
      }
    })
    
    // Construct payment link and tracking URLs
    const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const paymentLink = paymentLinkToken ? `${baseUrl}/pay/${paymentLinkToken}` : undefined
    const trackingPixelUrl = `${baseUrl}/api/track/email?invoice=${invoice.id}&stage=${stage}&t=${Date.now()}`

    let finalSubject = ''
    let finalHtmlBody = ''
    let finalPlainText = ''
    let persuasionStrategy = 'Manual Override'

    if (customMessage) {
      finalSubject = `Update regarding Invoice for ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount))}`
      finalPlainText = customMessage
      // Wrap the custom message in the standard HTML template
      const { buildEmailHtml } = await import('@/modules/templates/fallback.template')
      finalHtmlBody = buildEmailHtml(finalSubject, customMessage.replace(/\n/g, '<br/>'), { 
        clientName,
        amount: Number(amount),
        dueDate,
        stage,
        tone: (reminderTone as Tone) || 'PROFESSIONAL',
        paymentLink,
        invoiceNumber: invoiceRecord?.invoiceNumber || undefined
      })
    } else {
      const generated = await generateMessage({
        clientName,
        amount,
        dueDate,
        stage,
        daysOverdue,
        paymentLink,
        tone: (reminderTone as 'FRIENDLY' | 'PROFESSIONAL' | 'FIRM') || 'PROFESSIONAL',
        behaviorProfile: invoiceRecord?.client?.behaviorProfile || 'UNKNOWN',
        behaviorType: invoiceRecord?.client?.behaviorType || 'UNKNOWN',
        overrideTone: invoiceRecord?.client?.overrideTone || undefined,
        shieldMode: invoiceRecord?.user?.shieldMode || false,
      })
      finalSubject = generated.subject
      finalHtmlBody = generated.htmlBody
      finalPlainText = generated.plainText
      persuasionStrategy = generated.persuasionStrategy || 'Standard'
    }

    const result = await sendEmail({
      userId: invoice.userId,
      to: clientEmail,
      subject: finalSubject,
      htmlBody: finalHtmlBody,
      plainText: finalPlainText,
      trackingPixelUrl,
    })

    if (!result.success) {
      throw new Error(result.error || 'Unknown email send error')
    }

    return { 
      plainText: finalPlainText,
      persuasionStrategy 
    }
  })
}

/**
 * Handle permanently failed jobs (exhausted all retries).
 * These go to the "dead letter" state — logged for manual review.
 */
async function onJobFailed(job: Job<EmailJobData> | undefined, err: Error): Promise<void> {
  if (!job) return

  const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 5)

  if (isLastAttempt) {
    log.error('Email job permanently failed — dead letter', {
      jobId: job.id,
      invoiceId: job.data.invoiceId,
      stage: job.data.stage,
      attempts: job.attemptsMade,
      error: err.message,
    })

    try {
      await prisma.reminderLog.create({
        data: {
          invoiceId: job.data.invoiceId,
          stage: job.data.stage,
          status: 'dead_letter',
          error: `Permanently failed after ${job.attemptsMade} attempts: ${err.message}`,
          jobId: job.id ?? null,
          idempotencyKey: job.data.idempotencyKey,
        },
      })
    } catch (logErr) {
      log.error('Failed to log dead letter', {
        error: logErr instanceof Error ? logErr.message : String(logErr),
      })
    }
  }
}

/**
 * Create and start the email worker.
 * Each worker instance gets its own Redis connection (BullMQ requirement).
 * 
 * @param concurrency - Number of jobs to process in parallel.
 *                      Default 5 is conservative to avoid SMTP rate limits.
 */
export function startEmailWorker(concurrency = 5): Worker<EmailJobData> {
  const connection = createRedisConnection()

  const worker = new Worker<EmailJobData>(
    QUEUE_NAMES.EMAIL,
    processEmailJob,
    {
      connection,
      concurrency,
      // Stalled job check: if a job doesn't report progress in 30s,
      // consider it stalled and re-queue it.
      stalledInterval: 30_000,
      // Lock duration: how long a job is "locked" to this worker
      lockDuration: 60_000,
    }
  )

  worker.on('completed', (job) => {
    log.info('Email job completed', {
      jobId: job.id,
      invoiceId: job.data.invoiceId,
      stage: job.data.stage,
    })
  })

  worker.on('failed', (job, err) => {
    onJobFailed(job, err)
  })

  worker.on('error', (err) => {
    log.error('Email worker error', { error: err.message })
  })

  log.info('Email worker started', { concurrency, queue: QUEUE_NAMES.EMAIL })

  return worker
}
