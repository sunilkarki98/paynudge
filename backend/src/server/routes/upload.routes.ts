import { Router } from 'express'
import multer from 'multer'
import { uploadFile } from '../controllers/upload.controller'
import { authMiddleware } from '../middleware/auth'

const router = Router()

// Configure multer for in-memory file storage (max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

router.post('/', authMiddleware, upload.single('file'), uploadFile)

export default router
