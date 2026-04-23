import { Request, Response } from 'express'
import { prisma } from '@/lib/prisma'
import { checkRedisHealth } from '@/infrastructure/redis'
import { getEmailQueue } from '@/modules/queues/email-queue'
import { getSMSQueue } from '@/modules/queues/sms-queue'
import { getWhatsAppQueue } from '@/modules/queues/whatsapp-queue'
import { getOverdueCheckQueue } from '@/modules/queues/overdue-check-queue'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'health-controller' })

// ─── GET /api/health ─────────────────────────────────────

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const start = Date.now()

  try {
    const [dbResult, redisResult] = await Promise.allSettled([
      (async () => {
        const dbStart = Date.now()
        await prisma.$queryRaw`SELECT 1`
        return { status: 'up' as const, latencyMs: Date.now() - dbStart }
      })(),
      checkRedisHealth(),
    ])

    const dbHealth = dbResult.status === 'fulfilled'
      ? dbResult.value
      : { status: 'down' as const, latencyMs: 0 }

    const redisHealth = redisResult.status === 'fulfilled'
      ? redisResult.value
      : { status: 'down' as const, latencyMs: 0 }

    // Queue health
    let queues = {}
    if (redisHealth.status === 'up') {
      try {
        const [email, sms, whatsapp, overdue] = await Promise.all([
          getEmailQueue().getJobCounts(),
          getSMSQueue().getJobCounts(),
          getWhatsAppQueue().getJobCounts(),
          getOverdueCheckQueue().getJobCounts(),
        ])
        queues = { email, sms, whatsapp, overdue }
      } catch (qErr) {
        log.warn('Failed to fetch queue counts', { error: qErr instanceof Error ? qErr.message : String(qErr) })
      }
    }

    const overallStatus = dbHealth.status === 'up' && redisHealth.status === 'up'
      ? 'healthy'
      : 'degraded'

    res.status(overallStatus === 'healthy' ? 200 : 503).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      totalLatencyMs: Date.now() - start,
      checks: {
        database: dbHealth,
        redis: redisHealth,
        queues,
      },
    })
  } catch (error) {
    log.error('Health check failed', {
      error: error instanceof Error ? error.message : String(error),
    })

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'down' },
        redis: { status: 'down' },
      },
    })
  }
}
