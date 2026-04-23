import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/infrastructure/redis'
import { QUEUE_NAMES } from '@/modules/queues/queue-names'
import { WhatsAppJobData } from '@/modules/queues/whatsapp-queue'
import { logger } from '@/lib/logger'
import { withIdempotencyGuard } from '@/modules/queues/job-wrapper'
import { prisma } from '@/lib/prisma'

const log = logger.child({ module: 'whatsapp-worker' })

/**
 * WhatsApp Worker — processes WhatsApp jobs via Twilio's WhatsApp API.
 * 
 * Uses AI-generated messages (same as Email/SMS workers) and sends
 * through the dual-mode WhatsApp sender (user's Twilio → system Twilio fallback).
 */

async function processWhatsAppJob(job: Job<WhatsAppJobData>) {
  const { stage, whatsappNumber, clientName, amount, dueDate, daysOverdue, paymentLinkToken, reminderTone, customMessage } = job.data

  await withIdempotencyGuard('whatsapp', job, async (invoice) => {
    const { generateMessage } = await import('@/modules/ai/message-generator')
    const { sendWhatsApp } = await import('@/modules/communication/whatsapp-sender')

    const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const paymentLink = paymentLinkToken ? `${baseUrl}/pay/${paymentLinkToken}` : undefined

    let textToSend = customMessage || ''
    
    if (!customMessage) {
      const generated = await generateMessage({
        clientName,
        amount,
        dueDate,
        stage,
        daysOverdue,
        paymentLink,
        tone: (reminderTone as 'FRIENDLY' | 'PROFESSIONAL' | 'FIRM') || 'PROFESSIONAL',
      })
      textToSend = generated.smsText || generated.plainText.substring(0, 1000)
    }

    const result = await sendWhatsApp({
      userId: invoice.userId,
      to: whatsappNumber,
      message: textToSend,
    })

    if (!result.success) {
      throw new Error(result.error || 'Unknown WhatsApp send error')
    }

    log.info('WhatsApp message sent', {
      invoiceId: job.data.invoiceId,
      stage,
      mode: result.mode,
      sid: result.messageSid,
    })

    return { plainText: textToSend }
  })
}

async function onJobFailed(job: Job<WhatsAppJobData> | undefined, err: Error): Promise<void> {
  if (!job) return

  const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 5)

  if (isLastAttempt) {
    log.error('WhatsApp job permanently failed — dead letter', {
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
          channel: 'whatsapp',
          error: `Permanently failed after ${job.attemptsMade} attempts: ${err.message}`,
          jobId: job.id ?? null,
          idempotencyKey: job.data.idempotencyKey,
        },
      })
    } catch (logErr) {
      log.error('Failed to log WhatsApp dead letter', {
        error: logErr instanceof Error ? logErr.message : String(logErr),
      })
    }
  }
}

export function startWhatsAppWorker() {
  const connection = createRedisConnection()

  const worker = new Worker<WhatsAppJobData>(
    QUEUE_NAMES.WHATSAPP,
    processWhatsAppJob,
    {
      connection,
      concurrency: 5,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    }
  )

  worker.on('failed', (job, err) => {
    log.error('WhatsApp job failed', {
      jobId: job?.id,
      invoiceId: job?.data.invoiceId,
      stage: job?.data.stage,
      error: err.message,
    })
    onJobFailed(job, err)
  })

  worker.on('ready', () => {
    log.info('WhatsApp worker started', { queue: QUEUE_NAMES.WHATSAPP })
  })

  return worker
}
