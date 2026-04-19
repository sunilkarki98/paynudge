import { Request, Response } from 'express'
import { getAuthorizationUrl, handleOAuthCallback, disconnectGoogle, isGoogleConnected } from '@/modules/communication/google-oauth'
import { connectTwilio, disconnectTwilio, isTwilioConnected } from '@/modules/communication/sms-sender'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'settings-controller' })

// ─── GET /api/settings/status ────────────────────────────

export async function getConnectionStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId
    const [google, twilio] = await Promise.all([
      isGoogleConnected(userId),
      isTwilioConnected(userId),
    ])
    res.json({ google, twilio })
  } catch (error) {
    log.error('Failed to get connection status', {
      userId: req.user!.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: 'Failed to get connection status' })
  }
}

// ─── GET /api/settings/preferences ───────────────────────

export async function getPreferences(req: Request, res: Response): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { customIntervals: true, chaseIntervalDays: true, chaseUntilPaid: true, shieldMode: true },
    })
    res.json(user)
  } catch (error) {
    log.error('Failed to get preferences', {
      userId: req.user!.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: 'Failed to get preferences' })
  }
}

// ─── PUT /api/settings/preferences ───────────────────────

export async function updatePreferences(req: Request, res: Response): Promise<void> {
  try {
    const { customIntervals, chaseIntervalDays, chaseUntilPaid, shieldMode } = req.body
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { customIntervals, chaseIntervalDays, chaseUntilPaid, shieldMode },
      select: { customIntervals: true, chaseIntervalDays: true, chaseUntilPaid: true, shieldMode: true },
    })
    res.json(user)
  } catch (error) {
    log.error('Failed to update preferences', {
      userId: req.user!.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: 'Failed to update preferences' })
  }
}

// ─── GET /api/settings/email/connect ─────────────────────

export async function getEmailAuthUrl(req: Request, res: Response): Promise<void> {
  try {
    const url = getAuthorizationUrl(req.user!.userId)
    res.json({ url })
  } catch (error) {
    log.error('Failed to generate auth url', {
      userId: req.user!.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: 'Failed to generate authorization URL' })
  }
}

// ─── POST /api/settings/email/connect ────────────────────

export async function connectEmail(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.body

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' })
      return
    }

    const { email } = await handleOAuthCallback(code, req.user!.userId)

    res.json({
      success: true,
      message: 'Email connected successfully',
      email,
    })
  } catch (error) {
    log.error('OAuth callback failed', {
      userId: req.user!.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: 'Failed to connect email account' })
  }
}

// ─── DELETE /api/settings/email/disconnect ────────────────

export async function disconnectEmail(req: Request, res: Response): Promise<void> {
  try {
    await disconnectGoogle(req.user!.userId)
    res.json({ success: true, message: 'Email disconnected successfully' })
  } catch (error) {
    log.error('Failed to disconnect Google OAuth', {
      userId: req.user!.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: 'Failed to disconnect email account' })
  }
}

// ─── POST /api/settings/sms/connect ──────────────────────

export async function connectSms(req: Request, res: Response): Promise<void> {
  try {
    const { accountSid, authToken, phoneNumber } = req.body

    if (!accountSid || !authToken || !phoneNumber) {
      res.status(400).json({ error: 'Missing required API credentials' })
      return
    }

    const result = await connectTwilio(req.user!.userId, accountSid, authToken, phoneNumber)

    if (!result.success) {
      res.status(400).json({ error: result.error })
      return
    }

    res.json({
      success: true,
      message: 'Twilio connected successfully',
    })
  } catch (error) {
    log.error('Twilio connect failed', {
      userId: req.user!.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: 'Failed to connect Twilio account' })
  }
}

// ─── DELETE /api/settings/sms/disconnect ──────────────────

export async function disconnectSms(req: Request, res: Response): Promise<void> {
  try {
    await disconnectTwilio(req.user!.userId)
    res.json({ success: true, message: 'Twilio disconnected successfully' })
  } catch (error) {
    log.error('Failed to disconnect Twilio', {
      userId: req.user!.userId,
      error: error instanceof Error ? error.message : String(error),
    })
    res.status(500).json({ error: 'Failed to disconnect Twilio account' })
  }
}

// ─── GET /api/settings/google/callback ───────────────────
// This is the redirect URI that Google sends the user back to.
// It does NOT have a JWT — the userId comes via the `state` param.

export async function googleOAuthCallback(req: Request, res: Response): Promise<void> {
  const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    const code = req.query.code as string
    const userId = req.query.state as string

    if (!code || !userId) {
      res.redirect(`${frontendUrl}/settings?error=missing_params`)
      return
    }

    const { email } = await handleOAuthCallback(code, userId)
    log.info('Google OAuth callback successful', { userId, email })

    res.redirect(`${frontendUrl}/settings?google_connected=true&email=${encodeURIComponent(email)}`)
  } catch (error) {
    log.error('Google OAuth callback failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    res.redirect(`${frontendUrl}/settings?error=oauth_failed`)
  }
}
