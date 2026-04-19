import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/infrastructure/redis'
import { QUEUE_NAMES } from '@/modules/queues/queue-names'
import { WhatsAppJobData } from '@/modules/queues/whatsapp-queue'
import { logger } from '@/lib/logger'
import { withIdempotencyGuard } from '@/modules/queues/job-wrapper'

const log = logger.child({ module: 'whatsapp-worker' })

/**
 * WhatsApp Worker — processes WhatsApp jobs via Twilio's WhatsApp API.
 * 
 * Uses AI-generated messages (same as Email/SMS workers) and sends
 * through the dual-mode WhatsApp sender (user's Twilio → system Twilio fallback).
 */

async function processWhatsAppJob(job: Job<WhatsAppJobData>) {
  const { stage, whatsappNumber, clientName, amount, dueDate, daysOverdue, paymentLinkToken, reminderTone } = job.data

  await withIdempotencyGuard('whatsapp', job, async (invoice) => {
    const { generateMessage } = await import('@/modules/ai/message-generator')
    const { sendWhatsApp } = await import('@/modules/communication/whatsapp-sender')

    const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const paymentLink = paymentLinkToken ? `${baseUrl}/pay/${paymentLinkToken}` : undefined

    const generated = await generateMessage({
      clientName,
      amount,
      dueDate,
      stage,
      daysOverdue,
      paymentLink,
      tone: (reminderTone as 'FRIENDLY' | 'PROFESSIONAL' | 'FIRM') || 'PROFESSIONAL',
    })

    // WhatsApp messages should be concise — use SMS text if available, 
    // otherwise trim the plain text to 1000 chars (WhatsApp limit is 4096)
    const textToSend = generated.smsText || generated.plainText.substring(0, 1000)

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
  })

  worker.on('ready', () => {
    log.info('WhatsApp worker started', { queue: QUEUE_NAMES.WHATSAPP })
  })

  return worker
}
