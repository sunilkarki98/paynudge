import { Router } from 'express'

import clientRoutes from './client.routes'
import invoiceRoutes from './invoice.routes'
import dashboardRoutes from './dashboard.routes'
import settingsRoutes from './settings.routes'
import adminRoutes from './admin.routes'
import paymentRoutes from './payment.routes'
import trackingRoutes from './tracking.routes'
import uploadRoutes from './upload.routes'
import healthRoutes from './health.routes'
import billingRoutes from './billing.routes'

/**
 * Central API router.
 *
 * Mounts all sub-routers under their respective path prefixes.
 * The server entry point mounts this under /api, so:
 *   authRoutes at /auth → final path /api/auth/*
 */
const apiRouter = Router()
// Note: Auth logic is natively handled by Supabase API.
apiRouter.use('/clients', clientRoutes)
apiRouter.use('/invoices', invoiceRoutes)
apiRouter.use('/dashboard', dashboardRoutes)
apiRouter.use('/settings', settingsRoutes)
apiRouter.use('/admin', adminRoutes)
apiRouter.use('/pay', paymentRoutes)
apiRouter.use('/track', trackingRoutes)
apiRouter.use('/upload', uploadRoutes)
apiRouter.use('/health', healthRoutes)
apiRouter.use('/billing', billingRoutes)

export default apiRouter
