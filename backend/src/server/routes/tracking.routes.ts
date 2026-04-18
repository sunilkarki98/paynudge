import { Router } from 'express'
import { trackEmailOpen } from '../controllers/tracking.controller'

const router = Router()

// Public — embedded in emails as a 1x1 tracking pixel
router.get('/email', trackEmailOpen)

export default router
