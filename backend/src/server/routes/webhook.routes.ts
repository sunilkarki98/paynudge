import { Router } from 'express'
import { handleIncomingMessage } from '../controllers/webhook.controller'
import { validateTwilioRequest } from '../middleware/webhook-validator'

const router = Router()

/**
 * Public Webhook Endpoints
 */

// POST /api/webhooks/incoming
// Protected by Twilio signature validation
router.post('/incoming', validateTwilioRequest, handleIncomingMessage)

export default router
