import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '@/infrastructure/redis'
import { QUEUE_NAMES } from '@/modules/queues/queue-names'
import { SMSJobData } from '@/modules/queues/sms-queue'
import { logger } from '@/lib/logger'
import { withIdempotencyGuard } from '@/modules/queues/job-wrapper'
import { prisma } from '@/lib/prisma'

const log = logger.child({ module: 'sms-worker' })

async function processSMSJob(job: Job<SMSJobData>) {
  const { invoiceId, stage, smsNumber, clientName, amount, dueDate, daysOverdue, paymentLinkToken, reminderTone, customMessage } = job.data

  await withIdempotencyGuard('sms', job, async (invoice) => {
    const { generateMessage } = await import('@/modules/ai/message-generator')
    const { sendSMS } = await import('@/modules/communication/sms-sender')
    
    // Fetch client and user to retrieve behavioral profile and tone overrides
    const invoiceRecord = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { 
        client: true,
        user: { select: { shieldMode: true } }
      }
    })
    
    const baseUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const paymentLink = paymentLinkToken ? `${baseUrl}/pay/${paymentLinkToken}` : undefined

    let textToSend = customMessage || ''
    let persuasionStrategy = 'Manual Override'

    if (!customMessage) {
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
      textToSend = generated.smsText || generated.plainText.substring(0, 160)
      persuasionStrategy = generated.persuasionStrategy || 'Standard'
    }

    // Attempt sending using dual-mode Twilio
    const result = await sendSMS({
      userId: invoice.userId,
      to: smsNumber,
      message: textToSend,
    })

    if (!result.success) {
      throw new Error(result.error || 'Unknown SMS send error')
    }

    return { 
      plainText: textToSend,
      persuasionStrategy
    }
  })
}

async function onJobFailed(job: Job<SMSJobData> | undefined, err: Error): Promise<void> {
  if (!job) return

  const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 5)

  if (isLastAttempt) {
    log.error('SMS job permanently failed — dead letter', {
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
          channel: 'sms',
          error: `Permanently failed after ${job.attemptsMade} attempts: ${err.message}`,
          jobId: job.id ?? null,
          idempotencyKey: job.data.idempotencyKey,
        },
      })
    } catch (logErr) {
      log.error('Failed to log SMS dead letter', {
        error: logErr instanceof Error ? logErr.message : String(logErr),
      })
    }
  }
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
    onJobFailed(job, err)
  })

  worker.on('ready', () => {
    log.info('SMS worker started', { queue: QUEUE_NAMES.SMS })
  })

  return worker
}
