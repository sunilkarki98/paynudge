import { Request, Response } from 'express'
import {
  lemonSqueezySetup,
  createCheckout,
  getCustomer,
  verifyWebhookSignature,
} from '@lemonsqueezy/lemonsqueezy.js'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import crypto from 'crypto'

const log = logger.child({ module: 'billing.controller' })

// Initialize SDK (must be called before using other SDK functions)
lemonSqueezySetup({
  apiKey: process.env.LEMON_SQUEEZY_API_KEY || '',
  onError: (error) => log.error('Lemon Squeezy API Error', { error }),
})

const STORE_ID = process.env.LEMON_SQUEEZY_STORE_ID || ''
const PRO_VARIANT_ID = process.env.LEMON_SQUEEZY_PRO_VARIANT_ID || ''
const WEBHOOK_SECRET = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || ''

export const getCheckoutUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    if (user.subscriptionTier === 'PRO' && user.subscriptionStatus === 'active') {
      res.status(400).json({ error: 'User is already on the PRO plan' })
      return
    }

    const newCheckout = {
      checkoutOptions: {
        embed: false,
        media: false,
        logo: true,
      },
      checkoutData: {
        email: user.email,
        name: user.name || '',
        custom: {
          user_id: userId,
        },
      },
      productOptions: {
        redirectUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?upgraded=true`,
        receiptButtonText: 'Go to Dashboard',
        receiptThankYouNote: 'Thank you for upgrading to PRO!',
      },
    }

    const { data, error } = await createCheckout(STORE_ID, PRO_VARIANT_ID, newCheckout)

    if (error || !data) {
      log.error('Failed to create checkout', { error })
      res.status(500).json({ error: 'Failed to create checkout session' })
      return
    }

    res.json({ checkoutUrl: data.data.attributes.url })
  } catch (error) {
    log.error('Checkout creation error', { error })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getCustomerPortalUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.lemonSqueezyCustomerId) {
      res.status(404).json({ error: 'No active subscription found' })
      return
    }

    const { data, error } = await getCustomer(user.lemonSqueezyCustomerId)

    if (error || !data) {
      log.error('Failed to get customer portal', { error })
      res.status(500).json({ error: 'Failed to retrieve customer portal' })
      return
    }

    res.json({ portalUrl: data.data.attributes.urls.customer_portal })
  } catch (error) {
    log.error('Customer portal error', { error })
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const getSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const user = await prisma.user.findUnique({ where: { id: userId } })
    res.json({ 
      tier: user?.subscriptionTier || 'FREE',
      status: user?.subscriptionStatus || null,
      periodEnd: user?.subscriptionPeriodEnd || null
    })
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' })
  }
}

export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-signature'] as string
    if (!signature) {
      res.status(400).json({ error: 'Missing signature' })
      return
    }

    // Express automatically parses JSON if express.json() is used, but we need raw body for signature verification
    // Assuming you have raw body middleware for this route, or we manually verify
    // For Lemon Squeezy, we just use the crypto module
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET)
    const rawBody = (req as any).rawBody
    if (!rawBody) {
      res.status(400).json({ error: 'Missing raw body' })
      return
    }

    const digest = Buffer.from(hmac.update(rawBody).digest('hex'), 'utf8')
    const signatureBuffer = Buffer.from(signature, 'utf8')

    if (digest.length !== signatureBuffer.length || !crypto.timingSafeEqual(digest, signatureBuffer)) {
      log.warn('Invalid webhook signature')
      res.status(401).json({ error: 'Invalid signature' })
      return
    }

    const body = req.body
    const eventName = body.meta.event_name
    const obj = body.data.attributes
    const customData = body.meta.custom_data

    log.info('Received Lemon Squeezy Webhook', { eventName })

    if (eventName === 'subscription_created' || eventName === 'subscription_updated') {
      const userId = customData?.user_id
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionTier: 'PRO',
            lemonSqueezyCustomerId: String(obj.customer_id),
            lemonSqueezySubscriptionId: String(body.data.id),
            subscriptionStatus: obj.status,
            subscriptionPeriodEnd: new Date(obj.renews_at),
          },
        })
      }
    } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
      const userId = customData?.user_id
      if (userId) {
         await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionTier: 'FREE',
            subscriptionStatus: obj.status,
          },
        })
      }
    }

    res.status(200).send('OK')
  } catch (error) {
    log.error('Webhook error', { error })
    res.status(500).json({ error: 'Internal server error' })
  }
}
