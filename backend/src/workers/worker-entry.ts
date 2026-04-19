/**
 * Worker Entry Point — standalone process for BullMQ workers.
 * 
 * Run with: npx tsx src/workers/worker-entry.ts
 * Or:       npm run worker
 * 
 * This runs OUTSIDE of Next.js as a separate Node.js process.
 * The path aliases (@/) are resolved by tsx at runtime via tsconfig.
 * 
 * Architecture rationale:
 * - Workers must NOT run inside Next.js (especially serverless/edge)
 * - They need long-lived connections to Redis
 * - They should be independently scalable (run N instances)
 * - They share the same Prisma client and config as the API
 * 
 * Horizontal scaling:
 *   Simply run multiple instances of this process.
 *   BullMQ uses Redis-based locking to distribute jobs — each worker
 *   instance competes for jobs atomically. No coordination needed.
 * 
 *   Example:
 *     pm2 start src/workers/worker-entry.ts -i 4  # 4 worker instances
 */

import 'dotenv/config'
import { startEmailWorker } from './email.worker'
import { startOverdueCheckWorker } from './overdue-check.worker'
import { startWhatsAppWorker } from './whatsapp.worker'
import { startSMSWorker } from './sms.worker'
import { startOutboxWorker } from './outbox.worker'
import { registerAllEventHandlers } from '@/modules/events/event-registry'
import { disconnectRedis } from '@/infrastructure/redis'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'worker-entry' })

async function main(): Promise<void> {
  log.info('Starting worker process...', {
    pid: process.pid,
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development',
  })

  // Register event handlers
  registerAllEventHandlers()

  // Start workers
  const emailWorker = startEmailWorker(5)
  const overdueCheckWorker = startOverdueCheckWorker(10)
  const whatsappWorker = startWhatsAppWorker()
  const smsWorker = startSMSWorker()
  const outboxWorker = startOutboxWorker()

  log.info('All workers started successfully', {
    workers: ['email', 'overdue-check', 'whatsapp', 'sms', 'outbox'],
  })

  // ─── Graceful Shutdown ─────────────────────────────────

  let isShuttingDown = false

  async function shutdown(signal: string): Promise<void> {
    if (isShuttingDown) return
    isShuttingDown = true

    log.info(`Received ${signal}, shutting down gracefully...`)

    try {
      // Close workers first (stop accepting new jobs, finish current ones)
      await Promise.allSettled([
        emailWorker.close(),
        overdueCheckWorker.close(),
        whatsappWorker.close(),
        smsWorker.close(),
        outboxWorker.close(),
      ])
      log.info('Workers closed')

      // Then close Redis connections
      await disconnectRedis()

      log.info('Graceful shutdown complete')
      process.exit(0)
    } catch (err) {
      log.error('Error during shutdown', {
        error: err instanceof Error ? err.message : String(err),
      })
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  // Keep the process alive
  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception in worker process', {
      error: err.message,
      stack: err.stack,
    })
    // Don't exit — let the workers continue processing
    // The specific job that caused the error will be marked as failed
  })

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection in worker process', {
      error: reason instanceof Error ? reason.message : String(reason),
    })
  })
}

main().catch((err) => {
  log.error('Fatal error starting workers', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  })
  process.exit(1)
})
