import { Request, Response, NextFunction } from 'express'
import twilio from 'twilio'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'webhook-validator' })

/**
 * Middleware to verify that incoming requests are actually from Twilio.
 * 
 * This prevents "Webhook Spoofing" attacks where a malicious actor 
 * could manually POST to /api/webhooks/incoming to freeze invoices.
 */
export function validateTwilioRequest(req: Request, res: Response, next: NextFunction) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const signature = req.headers['x-twilio-signature'] as string
  
  // If in development and no token is set, we warn but allow (for local testing)
  if (!authToken) {
    if (process.env.NODE_ENV === 'production') {
      log.error('CRITICAL: TWILIO_AUTH_TOKEN is missing in production. Blocking all webhooks for safety.')
      res.status(403).send('Forbidden: Server configuration error.')
      return
    }
    log.warn('TWILIO_AUTH_TOKEN not set. Skipping signature validation (DEV ONLY).')
    return next()
  }

  // Twilio requires the full URL including protocol/host
  const protocol = req.get('x-forwarded-proto') || req.protocol
  const host = req.get('host')
  const url = `${protocol}://${host}${req.originalUrl}`
  
  // We need the parameters from the body
  const params = req.body

  const isValid = twilio.validateRequest(authToken, signature, url, params)

  if (!isValid) {
    log.error('Invalid Twilio Signature detected! Blocking request.', { 
      url,
      remoteIp: req.ip,
      userAgent: req.get('user-agent')
    })
    res.status(403).send('Forbidden: Invalid Signature.')
    return
  }

  log.debug('Twilio Signature verified.')
  next()
}
