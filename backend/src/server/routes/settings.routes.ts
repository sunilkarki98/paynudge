import { Router } from 'express'
import { getConnectionStatus, getEmailAuthUrl, connectEmail, disconnectEmail, connectSms, disconnectSms, googleOAuthCallback, getPreferences, updatePreferences } from '../controllers/settings.controller'
import { authMiddleware } from '../middleware/auth'

const router = Router()

// Public route — Google redirects here (no JWT available)
router.get('/google/callback', googleOAuthCallback)

// All other settings routes require authentication
router.use(authMiddleware)

// Connection status
router.get('/status', getConnectionStatus)

// Preferences
router.get('/preferences', getPreferences)
router.put('/preferences', updatePreferences)

// Email (Google OAuth)
router.get('/email/connect', getEmailAuthUrl)
router.post('/email/connect', connectEmail)
router.delete('/email/disconnect', disconnectEmail)

// SMS (Twilio)
router.post('/sms/connect', connectSms)
router.delete('/sms/disconnect', disconnectSms)

export default router
