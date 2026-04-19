/**
 * Standalone Express API Server
 *
 * This is the main entry point for the API server.
 * Run separately from Next.js as its own Node.js process:
 *
 *   Development:  npm run server:dev   (with hot-reload via tsx --watch)
 *   Production:   npm run server
 *
 * Architecture:
 *   - This process handles ALL /api/* requests
 *   - Next.js handles frontend rendering only (proxies /api/* here in dev)
 *   - Workers run as a third process for background jobs
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import apiRouter from './routes'
import { errorHandler } from './middleware/error-handler'
import { globalRateLimiter } from './middleware/rate-limiter'
import { registerAllEventHandlers } from '@/modules/events/event-registry'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'server' })

const app = express()
const PORT = parseInt(process.env.PORT || process.env.API_PORT || '4000', 10)

// ─── Global Middleware ───────────────────────────────────

// Security headers
app.use(helmet({
  // Disable CSP for API-only server (Next.js handles frontend CSP)
  contentSecurityPolicy: false,
}))

// CORS — allow the Next.js frontend origin
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || '',
    process.env.NEXT_PUBLIC_APP_URL || '',
    'http://localhost:3000'
  ].filter(Boolean),
  credentials: true,
}))

// Parse JSON bodies (limit 5MB for invoice data) and retain raw body for webhooks
app.use(express.json({
  limit: '5mb',
  verify: (req, res, buf) => {
    ;(req as any).rawBody = buf
  }
}))

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }))

// Parse cookies (for JWT token fallback)
app.use(cookieParser())

// Apply global rate limiting (100 req / min)
app.use(globalRateLimiter)

// Request logging (lightweight — just method, path, status, duration)
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    // Skip noisy health checks in logs
    if (req.path !== '/api/health' && req.path !== '/') {
      log.info(`${req.method} ${req.path}`, {
        status: res.statusCode,
        duration: `${duration}ms`,
      })
    }
  })
  next()
})

// ─── API Routes ──────────────────────────────────────────

// Root health check to prevent 404s on the main Railway URL
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'PayNudge API is running', version: '1.0.0' })
})

app.use('/api', apiRouter)

// ─── Error Handler (must be last) ────────────────────────

app.use(errorHandler)

// ─── Start Server ────────────────────────────────────────

// Register event handlers (shared with workers)
registerAllEventHandlers()

const server = app.listen(PORT, '0.0.0.0', () => {
  log.info(`Express API server running on port ${PORT}`, {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    pid: process.pid,
  })
})

let isShuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return
  isShuttingDown = true

  log.info(`Received ${signal}, shutting down gracefully...`)

  server.close(async (err) => {
    if (err) {
      log.error('Error closing HTTP server', { error: err.message })
    } else {
      log.info('HTTP server closed')
    }

    try {
      await prisma.$disconnect()
      log.info('Database connections closed')
      process.exit(0)
    } catch (dbErr) {
      log.error('Error disconnecting database', {
        error: dbErr instanceof Error ? dbErr.message : String(dbErr),
      })
      process.exit(1)
    }
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export default app
