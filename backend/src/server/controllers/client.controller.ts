import { Request, Response } from 'express'
import { prisma } from '@/lib/prisma'
import { createClientSchema, updateClientSchema, paginationSchema, validateBody } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { ChasingProfile, ContactChannel, Prisma } from '@prisma/client'

const log = logger.child({ module: 'client-controller' })

// ─── GET /api/clients ────────────────────────────────────

export async function getClients(req: Request, res: Response): Promise<void> {
  try {
    const pagination = validateBody(paginationSchema, req.query)
    if (!pagination.success) {
      res.status(400).json({ error: pagination.error })
      return
    }

    const { page, limit } = pagination.data
    const skip = (page - 1) * limit

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where: { userId: req.user!.userId },
        include: {
          invoices: {
            select: { id: true, amount: true, status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.client.count({ where: { userId: req.user!.userId } }),
    ])

    res.json({
      data: clients,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    log.error('Get clients error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── POST /api/clients ───────────────────────────────────

export async function createClient(req: Request, res: Response): Promise<void> {
  try {
    const validation = validateBody(createClientSchema, req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }

    const { name, email, whatsappNumber, smsNumber, chasingProfile, contactChannel } = validation.data

    // Check for duplicate client email for this user
    const existing = await prisma.client.findUnique({
      where: { userId_email: { userId: req.user!.userId, email } },
    })
    if (existing) {
      res.status(409).json({ error: 'A client with this email already exists' })
      return
    }

    const client = await prisma.client.create({
      data: {
        userId: req.user!.userId,
        name,
        email,
        whatsappNumber,
        smsNumber,
        chasingProfile: chasingProfile as ChasingProfile,
        contactChannel: contactChannel as ContactChannel,
      },
    })

    log.info('Client created', { clientId: client.id, userId: req.user!.userId })

    res.status(201).json(client)
  } catch (error) {
    log.error('Create client error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── GET /api/clients/:id ────────────────────────────────

export async function getClient(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string
    const client = await prisma.client.findFirst({
      where: { id, userId: req.user!.userId },
      include: { invoices: true },
    })

    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    res.json(client)
  } catch (error) {
    log.error('Get client error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── PUT /api/clients/:id ────────────────────────────────

export async function updateClient(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string

    const existing = await prisma.client.findFirst({
      where: { id, userId: req.user!.userId },
    })

    if (!existing) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const validation = validateBody(updateClientSchema, req.body)
    if (!validation.success) {
      res.status(400).json({ error: validation.error })
      return
    }

    const data = validation.data
    const updateData: Prisma.ClientUpdateInput = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.email !== undefined) updateData.email = data.email
    if (data.whatsappNumber !== undefined) updateData.whatsappNumber = data.whatsappNumber
    if (data.smsNumber !== undefined) updateData.smsNumber = data.smsNumber
    if (data.chasingProfile !== undefined) updateData.chasingProfile = data.chasingProfile
    if (data.contactChannel !== undefined) updateData.contactChannel = data.contactChannel

    const client = await prisma.client.update({
      where: { id },
      data: updateData,
    })

    log.info('Client updated', { clientId: id })

    res.json(client)
  } catch (error) {
    log.error('Update client error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ─── DELETE /api/clients/:id ─────────────────────────────

export async function deleteClient(req: Request, res: Response): Promise<void> {
  try {
    const id = req.params.id as string

    const existing = await prisma.client.findFirst({
      where: { id, userId: req.user!.userId },
    })

    if (!existing) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    await prisma.client.delete({ where: { id } })

    log.info('Client deleted', { clientId: id, userId: req.user!.userId })

    res.json({ message: 'Client deleted' })
  } catch (error) {
    log.error('Delete client error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}
