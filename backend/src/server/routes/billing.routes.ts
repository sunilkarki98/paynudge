import { Router } from 'express'
import express from 'express'
import { authMiddleware } from '../middleware/auth'
import { getCheckoutUrl, getCustomerPortalUrl, handleWebhook, getSubscription } from '../controllers/billing.controller'

const router = Router()

// Protected API routes
router.get('/checkout', authMiddleware, getCheckoutUrl)
router.get('/portal', authMiddleware, getCustomerPortalUrl)
router.get('/subscription', authMiddleware, getSubscription)

// Public Webhook route (rawBody captured globally)
router.post('/webhook', handleWebhook)

export default router
