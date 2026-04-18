import { Request, Response } from 'express'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { Prisma } from '@prisma/client'

const log = logger.child({ module: 'dashboard-controller' })

// ─── GET /api/dashboard ──────────────────────────────────

export async function getDashboard(req: Request, res: Response): Promise<void> {
  try {
    const now = new Date()

    const [
      paidInvoices,
      unpaidInvoices,
      overdueInvoices,
      totalPendingResult,
      totalCollectedResult,
      recentInvoices,
    ] = await Promise.all([
      prisma.invoice.count({
        where: { userId: req.user!.userId, status: 'PAID' },
      }),
      prisma.invoice.count({
        where: { userId: req.user!.userId, status: 'UNPAID' },
      }),
      prisma.invoice.count({
        where: { userId: req.user!.userId, status: 'UNPAID', dueDate: { lt: now } },
      }),
      prisma.invoice.aggregate({
        where: { userId: req.user!.userId, status: 'UNPAID' },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: { userId: req.user!.userId, status: 'PAID' },
        _sum: { amount: true },
      }),
      prisma.invoice.findMany({
        where: { userId: req.user!.userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          clientName: true,
          amount: true,
          dueDate: true,
          status: true,
          aiMetadata: {
            select: { riskScore: true },
          },
        },
      }),
    ])

    const dueInvoices = unpaidInvoices - overdueInvoices

    const toNumber = (val: Prisma.Decimal | number | null) =>
      val ? parseFloat(val.toString()) : 0

    const totalPendingAmount = toNumber(totalPendingResult._sum.amount)
    const totalCollectedAmount = toNumber(totalCollectedResult._sum.amount)

    log.info('Dashboard query result', {
      userId: req.user!.userId,
      paidInvoices,
      dueInvoices: unpaidInvoices - overdueInvoices,
      overdueInvoices,
      recentCount: recentInvoices.length,
      recentIds: recentInvoices.map(i => ({ id: i.id, client: i.clientName })),
    })

    res.json({
      paidInvoices,
      dueInvoices,
      overdueInvoices,
      totalPendingAmount,
      totalCollectedAmount,
      recentInvoices,
    })
  } catch (error) {
    log.error('Dashboard error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}
