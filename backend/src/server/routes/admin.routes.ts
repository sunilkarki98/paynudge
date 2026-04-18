import { Router } from 'express'
import { getSettings, updateSettings, listModels, listUsers, updateUserTier } from '../controllers/admin.controller'
import { adminMiddleware } from '../middleware/admin'

const router = Router()

// All admin routes require the admin API key
router.use(adminMiddleware)

router.get('/settings', getSettings)
router.post('/settings', updateSettings)
router.post('/settings/models', listModels)

router.get('/users', listUsers)
router.post('/users/:id/tier', updateUserTier)

export default router
