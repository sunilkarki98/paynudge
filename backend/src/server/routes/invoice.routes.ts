import { Router } from 'express'
import { getInvoices, createInvoiceHandler, getInvoice, updateInvoice, deleteInvoiceHandler } from '../controllers/invoice.controller'
import { authMiddleware } from '../middleware/auth'

const router = Router()

// All invoice routes require authentication
router.use(authMiddleware)

router.get('/', getInvoices)
router.post('/', createInvoiceHandler)
router.get('/:id', getInvoice)
router.put('/:id', updateInvoice)
router.delete('/:id', deleteInvoiceHandler)

export default router
