import { Request, Response } from 'express'
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

    res.json({ apiKey, parserModel, generatorModel })
  } catch (error) {
    log.error('Get settings error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Failed to fetch settings' })
  }
}

// ─── POST /api/admin/settings ────────────────────────────

export async function updateSettings(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body

    if (typeof body.apiKey === 'string') {
      await setSetting('GEMINI_API_KEY', body.apiKey)
    }
    if (typeof body.parserModel === 'string' && body.parserModel) {
      await setSetting('GEMINI_PARSER_MODEL', body.parserModel)
    }
    if (typeof body.generatorModel === 'string' && body.generatorModel) {
      await setSetting('GEMINI_GENERATOR_MODEL', body.generatorModel)
    }

    res.json({ success: true })
  } catch (error) {
    log.error('Update settings error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Failed to update settings' })
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
