import { Router } from 'express'
import { getClients, createClient, getClient, updateClient, deleteClient } from '../controllers/client.controller'
import { authMiddleware } from '../middleware/auth'

const router = Router()

// All client routes require authentication
router.use(authMiddleware)

router.get('/', getClients)
router.post('/', createClient)
router.get('/:id', getClient)
router.put('/:id', updateClient)
router.delete('/:id', deleteClient)

export default router
