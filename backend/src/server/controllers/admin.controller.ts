import { Request, Response } from 'express'
import nodemailer from 'nodemailer'
import Twilio from 'twilio'
import { getSetting, setSetting } from '@/lib/settings'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'admin-controller' })

// ─── GET /api/admin/settings ─────────────────────────────

export async function getSettings(_req: Request, res: Response): Promise<void> {
  try {
    const apiKey = await getSetting('GEMINI_API_KEY', '')
    const parserModel = await getSetting('GEMINI_PARSER_MODEL', 'gemini-1.5-flash')
    const generatorModel = await getSetting('GEMINI_GENERATOR_MODEL', 'gemini-2.0-flash')

    // SMTP
    const smtpHost = await getSetting('SMTP_HOST', '')
    const smtpPort = await getSetting('SMTP_PORT', '')
    const smtpUser = await getSetting('SMTP_USER', '')
    const smtpPass = await getSetting('SMTP_PASS', '')
    const smtpFrom = await getSetting('SMTP_FROM', '')

    // Twilio
    const twilioAccountSid = await getSetting('TWILIO_ACCOUNT_SID', '')
    const twilioAuthToken = await getSetting('TWILIO_AUTH_TOKEN', '')
    const twilioPhoneNumber = await getSetting('TWILIO_PHONE_NUMBER', '')
    const twilioWhatsappNumber = await getSetting('TWILIO_WHATSAPP_NUMBER', '')

    // Google OAuth
    const googleClientId = await getSetting('GOOGLE_CLIENT_ID', '')
    const googleClientSecret = await getSetting('GOOGLE_CLIENT_SECRET', '')

    res.json({ 
      apiKey, parserModel, generatorModel,
      smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom,
      twilioAccountSid, twilioAuthToken, twilioPhoneNumber, twilioWhatsappNumber,
      googleClientId, googleClientSecret
    })
  } catch (error) {
    log.error('Get settings error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Failed to fetch settings' })
  }
}

// ─── POST /api/admin/settings ────────────────────────────

export async function updateSettings(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body

    // --- Validation Pre-checks ---

    // 1. SMTP Validation
    if (body.smtpHost && body.smtpUser && body.smtpPass) {
      try {
        const port = parseInt(body.smtpPort || '587')
        const transporter = nodemailer.createTransport({
          host: body.smtpHost,
          port,
          secure: port === 465,
          auth: { user: body.smtpUser, pass: body.smtpPass },
        })
        await transporter.verify()
      } catch (err) {
        log.warn('SMTP validation failed', { error: err instanceof Error ? err.message : String(err) })
        res.status(400).json({ error: 'Invalid SMTP configuration. Connection refused or authentication failed.' })
        return
      }
    }

    // 2. Twilio Validation
    if (body.twilioAccountSid && body.twilioAuthToken) {
      try {
        const client = Twilio(body.twilioAccountSid, body.twilioAuthToken)
        await client.api.accounts(body.twilioAccountSid).fetch()
      } catch (err) {
        log.warn('Twilio validation failed', { error: err instanceof Error ? err.message : String(err) })
        res.status(400).json({ error: 'Invalid Twilio Account SID or Auth Token.' })
        return
      }
    }

    // --- Save Settings ---

    // AI Settings
    if (typeof body.apiKey === 'string') await setSetting('GEMINI_API_KEY', body.apiKey)
    if (typeof body.parserModel === 'string' && body.parserModel) await setSetting('GEMINI_PARSER_MODEL', body.parserModel)
    if (typeof body.generatorModel === 'string' && body.generatorModel) await setSetting('GEMINI_GENERATOR_MODEL', body.generatorModel)

    // SMTP Settings
    if (typeof body.smtpHost === 'string') await setSetting('SMTP_HOST', body.smtpHost)
    if (typeof body.smtpPort === 'string') await setSetting('SMTP_PORT', body.smtpPort)
    if (typeof body.smtpUser === 'string') await setSetting('SMTP_USER', body.smtpUser)
    if (typeof body.smtpPass === 'string') await setSetting('SMTP_PASS', body.smtpPass)
    if (typeof body.smtpFrom === 'string') await setSetting('SMTP_FROM', body.smtpFrom)

    // Twilio Settings
    if (typeof body.twilioAccountSid === 'string') await setSetting('TWILIO_ACCOUNT_SID', body.twilioAccountSid)
    if (typeof body.twilioAuthToken === 'string') await setSetting('TWILIO_AUTH_TOKEN', body.twilioAuthToken)
    if (typeof body.twilioPhoneNumber === 'string') await setSetting('TWILIO_PHONE_NUMBER', body.twilioPhoneNumber)
    if (typeof body.twilioWhatsappNumber === 'string') await setSetting('TWILIO_WHATSAPP_NUMBER', body.twilioWhatsappNumber)

    // Google OAuth Settings
    if (typeof body.googleClientId === 'string') await setSetting('GOOGLE_CLIENT_ID', body.googleClientId)
    if (typeof body.googleClientSecret === 'string') await setSetting('GOOGLE_CLIENT_SECRET', body.googleClientSecret)

    res.json({ success: true })
  } catch (error) {
    log.error('Update settings error', { error: error instanceof Error ? error.message : String(error) })
    // Return 500 but also pass the message back if possible, though standard is generic
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update settings' })
  }
}

// ─── POST /api/admin/settings/models ─────────────────────

export async function listModels(req: Request, res: Response): Promise<void> {
  try {
    const { apiKey } = req.body
    const keyToUse = apiKey || await getSetting('GEMINI_API_KEY')

    if (!keyToUse) {
      res.status(400).json({ error: 'No API Key provided or configured.' })
      return
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keyToUse}`)

    if (!response.ok) {
      throw new Error('Invalid API Key or connection error')
    }

    const data: any = await response.json()

    const validModels = (data.models || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((model: any) => model.name.includes('gemini'))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((model: any) => ({
        id: model.name.replace('models/', ''),
        displayName: model.displayName,
        description: model.description,
      }))

    res.json({ success: true, models: validModels })
  } catch (error) {
    log.error('List models error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Failed to authenticate and detect models' })
  }
}

// ─── GET /api/admin/users ────────────────────────────────

export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionTier: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json({ success: true, users })
  } catch (error) {
    log.error('List users error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Failed to list users' })
  }
}

// ─── POST /api/admin/users/:id/tier ──────────────────────

export async function updateUserTier(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params
    const { tier } = req.body

    if (tier !== 'FREE' && tier !== 'PRO') {
      res.status(400).json({ error: 'Invalid tier. Must be FREE or PRO.' })
      return
    }

    await prisma.user.update({
      where: { id: id as string },
      data: { subscriptionTier: tier }
    })

    res.json({ success: true })
  } catch (error) {
    log.error('Update user tier error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Failed to update user tier' })
  }
}
