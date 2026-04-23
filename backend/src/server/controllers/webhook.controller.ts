import { Request, Response } from 'express'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { handleOptOut } from '@/modules/invoice/invoice.service'

const log = logger.child({ module: 'webhook-controller' })

/**
 * Handle incoming SMS/WhatsApp messages (Replies)
 * 
 * FIX: Now handles MULTIPLE invoices for a client and ensures global opt-out.
 */
export async function handleIncomingMessage(req: Request, res: Response): Promise<void> {
  try {
    // 1. Normalize the incoming phone number (Strict E.164-ish)
    const rawFrom = req.body.From || req.body.contacts?.[0]?.wa_id || req.body.sender
    if (!rawFrom) {
      res.status(200).send('No sender info')
      return
    }

    const from = rawFrom.replace(/[^0-9]/g, '') // Keep only digits for safer matching
    const messageBody = (req.body.Body || req.body.messages?.[0]?.text?.body || '').trim().toUpperCase()

    log.info('Processing incoming message', { from, messageBodyLength: messageBody.length })

    // 2. Find ALL clients across the platform sharing this number
    // This ensures we catch the opt-out even if the client exists in multiple user accounts
    const clients = await prisma.client.findMany({
      where: {
        OR: [
          { whatsappNumber: { contains: from } },
          { smsNumber: { contains: from } }
        ]
      },
      include: {
        invoices: {
          where: { 
            state: { notIn: ['PAID', 'VOIDED', 'WRITTEN_OFF', 'LEGAL_HOLD'] } 
          }
        }
      }
    })

    if (clients.length === 0) {
      log.info('No clients found for sender number', { from })
      res.status(200).send('No matching records')
      return
    }

    const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END', 'REMOVE']
    const isOptOut = optOutKeywords.some(k => messageBody.includes(k))

    if (isOptOut) {
      log.warn('GLOBAL OPT-OUT TRIGGERED', { from, clientCount: clients.length })
      
      for (const client of clients) {
        // Freeze ALL active invoices for this client
        for (const invoice of client.invoices) {
          await handleOptOut(invoice.id)
        }
        
        // Mark client as opted-out globally in their account
        await prisma.client.update({
          where: { id: client.id },
          data: { behaviorType: 'OPTED_OUT' }
        })
      }
    } 
    else {
      // If not an opt-out, it might be a reply to the most recent invoice
      // We can add "AI Sentiment Analysis" here later to detect disputes
      log.info('Client sent a non-opt-out reply', { from, body: messageBody })
    }

    // Always return 200 to the provider
    res.status(200).send('OK')
  } catch (error) {
    log.error('CRITICAL: Incoming message processing failed', { error })
    res.status(200).send('Internal Error')
  }
}
