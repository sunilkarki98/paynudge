import { Router } from 'express'
import { getHealth } from '../controllers/health.controller'

const router = Router()

// Public — used by monitoring and load balancer probes
router.get('/', getHealth)

export default router
