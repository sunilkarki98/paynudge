'use client'

import { api } from '@/lib/api'
import { useState } from 'react'

interface PaymentPageClientProps {
  invoice: {
    id: string
    number: string
    amount: number
    dueDate: string
    description: string | null
    clientName: string
    status: string
    user: {
      name: string | null
      email: string
    }
  }
  token: string
}

export default function PaymentPageClient({ invoice, token }: PaymentPageClientProps) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const isPaid = invoice.status === 'PAID'

  const handleNotifyPaid = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post(`/pay/${token}/notify`)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md glass-card rounded-2xl shadow-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-primary-600 to-accent-600 p-8 text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-20">
          <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Invoice {invoice.number}</h1>
        <p className="text-primary-100">from {invoice.user.name || invoice.user.email}</p>
      </div>

      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <span className="text-text-secondary">Amount Due</span>
          <span className="text-3xl font-bold text-text-primary">
            ${invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Due Date</span>
            <span className="text-text-primary font-medium">
              {new Date(invoice.dueDate).toLocaleDateString()}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Billed To</span>
            <span className="text-text-primary font-medium">{invoice.clientName}</span>
          </div>
          {invoice.description && (
            <div className="pt-4 border-t border-surface-border">
              <span className="text-sm text-text-secondary block mb-1">Description</span>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{invoice.description}</p>
            </div>
          )}
        </div>

        {isPaid ? (
          <div className="bg-green-500/10 border border-green-500/20 text-green-500 rounded-xl p-4 text-center font-medium flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            This invoice has been paid
          </div>
        ) : success ? (
          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-500 rounded-xl p-4 text-center">
            <h3 className="font-semibold mb-1">Notification Sent!</h3>
            <p className="text-sm">We've notified {invoice.user.name || 'the freelancer'} that you've processed the payment.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Note: Full Stripe integration would go here. For now it's "View & Notify" */}
            <div className="p-4 bg-surface-raised rounded-xl border border-surface-border mb-4 text-sm text-text-secondary text-center">
              Please send payment directly to {invoice.user.name || 'the freelancer'} via their preferred method, then click below to notify them.
            </div>

            {error && (
              <div className="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              onClick={handleNotifyPaid}
              disabled={loading}
              className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-primary-500 to-accent-500 hover:shadow-lg hover:shadow-primary-500/25 transition-all outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            >
              {loading ? 'Notifying...' : 'I Have Paid This Invoice'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
