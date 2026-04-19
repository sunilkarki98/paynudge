import { Request, Response } from 'express'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { Prisma } from '@prisma/client'
import { generateCashflowForecast } from '@/modules/payment/cashflow-forecast'

const log = logger.child({ module: 'dashboard-controller' })

// ─── GET /api/dashboard ──────────────────────────────────

export async function getDashboard(req: Request, res: Response): Promise<void> {
  try {
    const now = new Date()
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [aggregatesResult, recentInvoices, cashflowForecast] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT 
          COUNT(CASE WHEN status::text = 'PAID' THEN 1 END)::int AS "paidInvoices",
          COUNT(CASE WHEN status::text = 'UNPAID' THEN 1 END)::int AS "unpaidInvoices",
          COUNT(CASE WHEN status::text = 'UNPAID' AND "dueDate" < ${now} THEN 1 END)::int AS "overdueInvoices",
          COALESCE(SUM(CASE WHEN status::text = 'UNPAID' THEN amount ELSE 0 END), 0) AS "totalPendingAmount",
          COALESCE(SUM(CASE WHEN status::text = 'PAID' THEN amount ELSE 0 END), 0) AS "totalCollectedAmount",
          COALESCE(SUM(CASE WHEN status::text = 'PAID' AND "updatedAt" >= ${firstOfMonth} AND "reminderStage" > 0 THEN amount ELSE 0 END), 0) AS "recoveredThisMonth"
        FROM "Invoice"
        WHERE "userId" = CAST(${req.user!.userId} AS uuid)
      `,
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
      generateCashflowForecast(req.user!.userId),
    ])

    const agg = aggregatesResult[0] || {}

    const paidInvoices = Number(agg.paidInvoices) || 0
    const unpaidInvoices = Number(agg.unpaidInvoices) || 0
    const overdueInvoices = Number(agg.overdueInvoices) || 0
    const dueInvoices = Math.max(0, unpaidInvoices - overdueInvoices)

    const totalPendingAmount = parseFloat(agg.totalPendingAmount?.toString() || '0')
    const totalCollectedAmount = parseFloat(agg.totalCollectedAmount?.toString() || '0')
    const recoveredThisMonth = parseFloat(agg.recoveredThisMonth?.toString() || '0')

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
      cashflowForecast,
      antiChurn: {
        recoveredThisMonth
      }
    })
  } catch (error) {
    log.error('Dashboard error', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Internal server error' })
  }
}
