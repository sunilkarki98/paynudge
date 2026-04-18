import { Request, Response } from 'express'
import { prisma } from '@/lib/prisma'
import { checkRedisHealth } from '@/infrastructure/redis'
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
