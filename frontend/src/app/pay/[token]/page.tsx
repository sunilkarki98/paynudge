import { notFound } from 'next/navigation'
import { logger } from '@/lib/logger'
import PaymentPageClient from './PaymentPageClient'

export const dynamic = 'force-dynamic'

const log = logger.child({ module: 'payment-page' })

interface PageProps {
  params: {
    token: string
  }
}

export default async function PaymentPage({ params }: PageProps) {
  const { token } = params

  let invoice: any = null

  try {
    const apiUrl = `http://localhost:${process.env.API_PORT || 4000}/api/pay/${token}`
    const res = await fetch(apiUrl, { cache: 'no-store' })
    
    if (!res.ok) {
      if (res.status === 404) {
        return notFound()
      }
      throw new Error(`Failed to fetch payment link: ${res.statusText}`)
    }
    
    invoice = await res.json()
  } catch (err) {
    log.error('Failed to load payment page via API', { 
      token, 
      error: err instanceof Error ? err.message : String(err) 
    })
    return notFound()
  }

  if (!invoice) {
    return notFound()
  }

  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4">
      <PaymentPageClient 
        invoice={{
          id: invoice.id,
          number: invoice.number,
          amount: typeof invoice.amount === 'string' ? parseFloat(invoice.amount) : invoice.amount,
          dueDate: new Date(invoice.dueDate).toISOString(),
          description: invoice.description,
          clientName: invoice.clientName,
          status: invoice.status,
          user: invoice.user,
        }}
        token={token}
      />
    </div>
  )
}
