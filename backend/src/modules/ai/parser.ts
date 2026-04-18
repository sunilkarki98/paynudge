import { GoogleGenerativeAI, type Schema } from '@google/generative-ai'
import { logger } from '@/lib/logger'
import { getSetting } from '@/lib/settings'

const log = logger.child({ module: 'ai-parser' })

export interface ParsedInvoice {
  clientName: string
  clientEmail: string
  amount: number
  dueDate: string
  description?: string
  confidenceScore: number
}

const invoiceSchema = {
  type: 'OBJECT' as const,
  properties: {
    clientName: {
      type: 'STRING' as const,
      description: "The name of the client being billed.",
    },
    clientEmail: {
      type: 'STRING' as const,
      description: "The email address of the client.",
    },
    amount: {
      type: 'NUMBER' as const,
      description: "The total amount due.",
    },
    dueDate: {
      type: 'STRING' as const,
      description: "The due date of the invoice in ISO format (YYYY-MM-DD). Calculate from terms if only issue date and terms (e.g. Net 30) are provided.",
    },
    description: {
      type: 'STRING' as const,
      description: "A short description of the services or goods provided.",
    },
    confidenceScore: {
      type: 'NUMBER' as const,
      description: "A score from 0 to 100 indicating how confident you are in the extracted data. Deduct points for missing or ambiguous fields.",
    },
  },
  required: ["clientName", "clientEmail", "amount", "dueDate", "confidenceScore"],
}

export async function parseInvoiceContent(textContent: string): Promise<ParsedInvoice> {
  try {
    const apiKey = await getSetting('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in system settings.')
    }
    const genAI = new GoogleGenerativeAI(apiKey)
    const parserModel = await getSetting('GEMINI_PARSER_MODEL', 'gemini-1.5-flash')
    
    const model = genAI.getGenerativeModel({
      model: parserModel, // fast and structured
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: invoiceSchema as unknown as Schema,
        temperature: 0.1,
      },
    })

    const prompt = `You are an expert accounting assistant. Extract the invoice details from the following raw text extracted from a document.
If a field is completely missing (like an email), make your best educated guess or provide a placeholder like 'unknown@example.com' if absolutely necessary, but lower the confidenceScore.

Raw Text:
"""
${textContent.substring(0, 5000)} // limit to 5000 chars to avoid token limits on huge CSVs
"""`

    const result = await model.generateContent(prompt)
    const response = result.response
    const text = response.text()
    
    const parsed = JSON.parse(text) as ParsedInvoice
    
    // Normalize ISO date
    if (parsed.dueDate) {
      try {
        const d = new Date(parsed.dueDate)
        if (!isNaN(d.getTime())) {
          parsed.dueDate = d.toISOString().split('T')[0]
        }
      } catch (e) {
         // keep original
      }
    }

    log.info('Successfully parsed invoice', { confidenceScore: parsed.confidenceScore })
    return parsed
  } catch (error) {
    log.error('Failed to parse invoice with AI', { error: error instanceof Error ? error.message : String(error) })
    throw new Error('Failed to extract invoice data')
  }
}
