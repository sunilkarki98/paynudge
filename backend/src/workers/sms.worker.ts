import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/infrastructure/redis'
import { QUEUE_NAMES } from '@/modules/queues/queue-names'
import { SMSJobData } from '@/modules/queues/sms-queue'
import { logger } from '@/lib/logger'
import { withIdempotencyGuard } from '@/modules/queues/job-wrapper'

const log = logger.child({ module: 'sms-worker' })

async function processSMSJob(job: Job<SMSJobData>) {
  const { stage, smsNumber, clientName, amount, dueDate, daysOverdue, paymentLinkToken, reminderTone } = job.data

  await withIdempotencyGuard('sms', job, async (invoice) => {
    const { generateMessage } = await import('@/modules/ai/message-generator')
    const { sendSMS } = await import('@/modules/communication/sms-sender')
    
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
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

    const textToSend = generated.smsText || generated.plainText.substring(0, 160)

    // Attempt sending using dual-mode Twilio
    const result = await sendSMS({
      userId: invoice.userId,
      to: smsNumber,
      message: textToSend,
    })

    if (!result.success) {
      throw new Error(result.error || 'Unknown SMS send error')
    }

    return { plainText: textToSend }
  })
}

export function startSMSWorker() {
  const connection = createRedisConnection()

  const worker = new Worker<SMSJobData>(
    QUEUE_NAMES.SMS,
    processSMSJob,
    {
      connection,
      concurrency: 5,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    }
  )

  worker.on('failed', (job, err) => {
    log.error('SMS job failed', {
      jobId: job?.id,
      invoiceId: job?.data.invoiceId,
      stage: job?.data.stage,
      error: err.message,
    })
  })

  worker.on('ready', () => {
    log.info('SMS worker started', { queue: QUEUE_NAMES.SMS })
  })

  return worker
}
