'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { CreditCard, CheckCircle, ArrowRight, ExternalLink } from 'lucide-react'

export default function BillingSettingsPage() {
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Refetch subscription details locally if needed, but we rely on user.subscriptionTier from AuthContext
  const isPro = user?.subscriptionTier === 'PRO'

  const handleUpgrade = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<{ checkoutUrl: string }>('/billing/checkout')
      
      // Redirect to Lemon Squeezy checkout URL
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  const handleManageBilling = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<{ portalUrl: string }>('/billing/portal')
      
      if (data.portalUrl) {
        window.location.href = data.portalUrl
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Billing & Subscription</h1>
        <p className="text-text-secondary mt-1">Manage your plan, payment methods, and billing history.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl font-medium">
          {error}
        </div>
      )}

      {/* Current Plan Card */}
      <div className="glass-card rounded-2xl p-8 border border-surface-border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${
              isPro ? 'bg-gradient-to-br from-primary-500 to-accent-500 text-white shadow-primary-500/20' 
                    : 'bg-surface-raised border border-surface-border text-text-secondary'
            }`}>
              <CreditCard className="w-7 h-7" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wider text-text-secondary uppercase mb-1">
                Current Plan
              </p>
              <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
                {isPro ? 'PRO Plan' : 'Free Tier'}
                {isPro && <CheckCircle className="w-5 h-5 text-emerald-500" />}
              </h2>
            </div>
          </div>
          
          <div>
            {isPro ? (
              <button
                onClick={handleManageBilling}
                disabled={isLoading}
                className="px-6 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary font-medium hover:bg-surface-base hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                Manage Billing <ExternalLink className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={isLoading}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-bold hover:shadow-lg hover:shadow-primary-500/30 hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isLoading ? 'Processing...' : 'Upgrade to PRO'} <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="h-px bg-surface-border my-8" />

        <div className="grid md:grid-cols-2 gap-8">
          {/* Free Features */}
          <div className={`space-y-4 ${isPro ? 'opacity-50' : ''}`}>
            <h3 className="text-lg font-bold text-text-primary">Free Tier Includes:</h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-text-secondary font-medium">
                <CheckCircle className="w-5 h-5 text-emerald-500/50" />
                Up to 5 AI-managed invoices per month
              </li>
              <li className="flex items-center gap-3 text-text-secondary font-medium">
                <CheckCircle className="w-5 h-5 text-emerald-500/50" />
                Standard Email Reminders
              </li>
              <li className="flex items-center gap-3 text-text-secondary font-medium">
                <CheckCircle className="w-5 h-5 text-emerald-500/50" />
                Basic invoice tracking
              </li>
            </ul>
          </div>

          {/* Pro Features */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-accent-400">
              PRO Plan Unlocks:
            </h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-text-primary font-medium">
                <CheckCircle className="w-5 h-5 text-primary-500" />
                Unlimited AI-managed invoices
              </li>
              <li className="flex items-center gap-3 text-text-primary font-medium">
                <CheckCircle className="w-5 h-5 text-primary-500" />
                SMS Text Message Reminders (via Twilio)
              </li>
              <li className="flex items-center gap-3 text-text-primary font-medium">
                <CheckCircle className="w-5 h-5 text-primary-500" />
                Connect Custom Gmail OAuth
              </li>
              <li className="flex items-center gap-3 text-text-primary font-medium">
                <CheckCircle className="w-5 h-5 text-primary-500" />
                Advanced Predictive Risk Scoring
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
