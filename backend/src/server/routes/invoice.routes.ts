import { Router } from 'express'
import { getInvoices, createInvoiceHandler, getInvoice, updateInvoice, deleteInvoiceHandler, sendReminderHandler, getReminderHistoryHandler } from '../controllers/invoice.controller'
import { authMiddleware } from '../middleware/auth'

const router = Router()

// All invoice routes require authentication
router.use(authMiddleware)

router.get('/', getInvoices)
router.post('/', createInvoiceHandler)
router.get('/:id', getInvoice)
router.put('/:id', updateInvoice)
router.delete('/:id', deleteInvoiceHandler)
router.post('/:id/remind', sendReminderHandler)
router.get('/:id/history', getReminderHistoryHandler)

export default router
