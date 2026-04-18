import { Router } from 'express'
import { getPaymentLink, notifyPayment } from '../controllers/payment.controller'

const router = Router()

// Public — retrieve payment link details and track views
router.get('/:token', getPaymentLink)

// Public — clients use this to notify freelancers they've paid
router.post('/:token/notify', notifyPayment)

export default router
