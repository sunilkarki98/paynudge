import { Request, Response } from 'express'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'tracking-controller' })

// Base64 encoded 1x1 transparent GIF
const TRANSPARENT_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const pixelBuffer = Buffer.from(TRANSPARENT_GIF_BASE64, 'base64')

// ─── GET /api/track/email ────────────────────────────────

export async function trackEmailOpen(req: Request, res: Response): Promise<void> {
  const invoiceId = req.query.invoice as string
  const stage = req.query.stage as string

  if (invoiceId) {
    try {
      trackOpen(invoiceId, stage, req).catch((err) => {
        log.error('Failed to log tracking event', {
          invoiceId,
          error: err instanceof Error ? err.message : String(err),
        })
      })
    } catch {
      // Ignore to ensure pixel always loads
    }
  }

  // Always return the 1x1 GIF
  res
    .set('Content-Type', 'image/gif')
    .set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')
    .set('Pragma', 'no-cache')
    .set('Expires', '0')
    .send(pixelBuffer)
}

async function trackOpen(invoiceId: string, stage: string | null, req: Request) {
  const userAgent = req.headers['user-agent'] || 'unknown'
  const ip = (req.headers['x-forwarded-for'] as string) || req.headers['x-real-ip'] as string || req.ip || 'unknown'

  await prisma.invoiceTracking.create({
    data: {
      invoiceId,
      event: 'email_opened',
      channel: 'email',
      metadata: {
        stage: stage ? parseInt(stage) : null,
        userAgent,
        ip,
      },
    },
  })

  await prisma.invoiceEvent.create({
    data: {
      invoiceId,
      eventType: 'email_opened',
      metadata: { stage: stage ? parseInt(stage) : null, channel: 'email' },
    },
  })

  log.info('Email open tracked', { invoiceId, stage })
}
