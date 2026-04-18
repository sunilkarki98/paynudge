import { Request, Response } from 'express'
import { parseInvoiceContent } from '@/modules/ai/parser'
import { logger } from '@/lib/logger'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require('pdf-parse')
import { parse } from 'csv-parse/sync'

const log = logger.child({ module: 'upload-controller' })

// ─── POST /api/upload ────────────────────────────────────

export async function uploadFile(req: Request, res: Response): Promise<void> {
  try {
    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'No file provided' })
      return
    }

    log.info('Received file for parsing', {
      filename: file.originalname,
      size: file.size,
      type: file.mimetype,
    })

    const buffer = file.buffer
    let extractedText = ''

    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      const data = await pdf(buffer)
      extractedText = data.text
    } else if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      const records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extractedText = records.map((r: any) => JSON.stringify(r)).join('\n')
    } else if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      extractedText = buffer.toString('utf-8')
    } else {
      extractedText = buffer.toString('utf-8')
    }

    if (!extractedText || extractedText.trim().length === 0) {
      res.status(400).json({ error: 'Could not extract text from file' })
      return
    }

    const parsedData = await parseInvoiceContent(extractedText)

    res.json({ success: true, data: parsedData })
  } catch (error) {
    log.error('Upload processing failed', { error: error instanceof Error ? error.message : String(error) })
    res.status(500).json({ error: 'Failed to process file. Please try manual entry.' })
  }
}
