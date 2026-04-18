'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useApi } from '@/hooks/useApi'
import { Mail, MessageSquare, Phone, CheckCircle, XCircle, Loader2, ExternalLink, AlertTriangle } from 'lucide-react'

interface ConnectionStatus {
  google: { connected: boolean; email?: string }
  twilio: { connected: boolean; mode: 'user' | 'system' | 'none'; phoneNumber?: string }
}

export default function SettingsPage() {
  const { user } = useAuth()
  const { apiFetch } = useApi()
  const [status, setStatus] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Twilio form
  const [twilioSid, setTwilioSid] = useState('')
  const [twilioToken, setTwilioToken] = useState('')
  const [twilioPhone, setTwilioPhone] = useState('')
  const [showTwilioForm, setShowTwilioForm] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiFetch('/api/settings/status')
      setStatus(data)
    } catch {
      // Silently fail — user just sees "not connected"
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Handle Google OAuth callback redirect (backend redirects here with query params)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const googleConnected = params.get('google_connected')
    const oauthError = params.get('error')

    if (googleConnected === 'true') {
      window.history.replaceState({}, '', '/settings')
      setSuccess('Gmail connected successfully!')
      fetchStatus()
    } else if (oauthError) {
      window.history.replaceState({}, '', '/settings')
      setError(oauthError === 'oauth_failed' ? 'Failed to connect Gmail. Please try again.' : 'Something went wrong.')
    }
  }, [fetchStatus])

  const connectGmail = async () => {
    setError('')
    setActionLoading('google')
    try {
      const data = await apiFetch('/api/settings/email/connect')
      // Redirect to Google OAuth
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Gmail')
      setActionLoading(null)
    }
  }

  const disconnectGmail = async () => {
    setError('')
    setActionLoading('google-disconnect')
    try {
      await apiFetch('/api/settings/email/disconnect', { method: 'DELETE' })
      setSuccess('Gmail disconnected')
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setActionLoading(null)
    }
  }

  const connectTwilio = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setActionLoading('twilio')
    try {
      await apiFetch('/api/settings/sms/connect', {
        method: 'POST',
        body: JSON.stringify({
          accountSid: twilioSid,
          authToken: twilioToken,
          phoneNumber: twilioPhone,
        }),
      })
      setSuccess('Twilio connected successfully!')
      setShowTwilioForm(false)
      setTwilioSid('')
      setTwilioToken('')
      setTwilioPhone('')
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Twilio')
    } finally {
      setActionLoading(null)
    }
  }

  const disconnectTwilio = async () => {
    setError('')
    setActionLoading('twilio-disconnect')
    try {
      await apiFetch('/api/settings/sms/disconnect', { method: 'DELETE' })
      setSuccess('Twilio disconnected')
      await fetchStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setActionLoading(null)
    }
  }

  // Auto-clear messages
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000)
      return () => clearTimeout(t)
    }
  }, [success])

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 6000)
      return () => clearTimeout(t)
    }
  }, [error])

  return (
    <div className="max-w-2xl space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-secondary mt-1">Manage your account and connected services</p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* Profile Section */}
      <div className="bg-white rounded-2xl p-6 border border-surface-border shadow-sm">
        <h3 className="text-lg font-semibold text-text-primary mb-6">Profile</h3>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
            {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <h4 className="text-lg font-medium text-text-primary">{user?.name || 'User'}</h4>
            <p className="text-sm text-text-secondary">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* ─── Gmail Connection ─── */}
      <div className="bg-white rounded-2xl p-6 border border-surface-border shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <Mail className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-text-primary">Gmail</h3>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Optional</span>
            </div>
            <p className="text-sm text-text-secondary mt-0.5">Send reminders directly from your own email address.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 mt-4 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking connection...
          </div>
        ) : status?.google?.connected ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-700">Connected</p>
                <p className="text-xs text-green-600">{status.google.email}</p>
              </div>
              <button
                onClick={disconnectGmail}
                disabled={actionLoading === 'google-disconnect'}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'google-disconnect' ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
            <p className="text-xs text-text-muted">
              Reminders will be sent from your Gmail and appear in your Sent folder.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <XCircle className="w-5 h-5 text-slate-400" />
              <p className="text-sm text-text-secondary flex-1">Not connected</p>
            </div>
            <button
              onClick={connectGmail}
              disabled={actionLoading === 'google'}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border-2 border-slate-200 hover:border-red-300 hover:bg-red-50 text-text-primary font-medium transition-all disabled:opacity-50"
            >
              {actionLoading === 'google' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              )}
              Connect Gmail Account
            </button>
            <p className="text-xs text-text-muted mt-2">
              If skipped, emails will simply be sent from our secure system address (noreply@invoicechaser.com).
            </p>
          </div>
        )}
      </div>

      {/* ─── Twilio Connection (SMS + WhatsApp) ─── */}
      <div className="bg-white rounded-2xl p-6 border border-surface-border shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Phone className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-text-primary">Twilio</h3>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Optional</span>
            </div>
            <p className="text-sm text-text-secondary mt-0.5">Send SMS & WhatsApp messages via your own number.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 mt-4 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking connection...
          </div>
        ) : status?.twilio?.connected && status.twilio.mode === 'user' ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-700">Your Twilio Account Connected</p>
                <p className="text-xs text-green-600">{status.twilio.phoneNumber}</p>
              </div>
              <button
                onClick={disconnectTwilio}
                disabled={actionLoading === 'twilio-disconnect'}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'twilio-disconnect' ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
            <div className="flex gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-medium">
                <MessageSquare className="w-3 h-3" /> SMS
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-50 text-green-700 text-xs font-medium">
                <MessageSquare className="w-3 h-3" /> WhatsApp
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {status?.twilio?.mode === 'system' ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-700">Using System Account</p>
                  <p className="text-xs text-amber-600">Connect your own for full control</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <XCircle className="w-5 h-5 text-slate-400" />
                <p className="text-sm text-text-secondary flex-1">Not connected</p>
              </div>
            )}

            {!showTwilioForm ? (
              <>
                <button
                  onClick={() => setShowTwilioForm(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white border-2 border-slate-200 hover:border-blue-300 hover:bg-blue-50 text-text-primary font-medium transition-all"
                >
                  <Phone className="w-5 h-5 text-blue-500" />
                  Connect Twilio Account
                </button>
                <p className="text-xs text-text-muted mt-2">
                  If skipped, SMS messages will simply be sent from our default system phone number.
                </p>
              </>
            ) : (
              <form onSubmit={connectTwilio} className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Account SID</label>
                  <input
                    type="text"
                    required
                    value={twilioSid}
                    onChange={(e) => setTwilioSid(e.target.value)}
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full px-3 py-2 rounded-lg text-sm input-base"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Auth Token</label>
                  <input
                    type="password"
                    required
                    value={twilioToken}
                    onChange={(e) => setTwilioToken(e.target.value)}
                    placeholder="Your auth token"
                    className="w-full px-3 py-2 rounded-lg text-sm input-base"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    value={twilioPhone}
                    onChange={(e) => setTwilioPhone(e.target.value)}
                    placeholder="+1234567890"
                    className="w-full px-3 py-2 rounded-lg text-sm input-base"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={actionLoading === 'twilio'}
                    className="flex-1 py-2.5 rounded-lg btn-primary text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {actionLoading === 'twilio' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Connect
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTwilioForm(false)}
                    className="px-4 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-surface-raised border border-surface-border"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-text-muted">
                  Find these in your{' '}
                  <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5">
                    Twilio Console <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </form>
            )}
          </div>
        )}
      </div>

      {/* ─── WhatsApp Direct Connection (Coming Soon) ─── */}
      <div className="bg-white rounded-2xl p-6 border border-surface-border shadow-sm opacity-80">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-text-primary">WhatsApp Business</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">Coming Soon</span>
              </div>
              <p className="text-sm text-text-secondary mt-0.5">Connect your official WhatsApp Business account directly.</p>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button
            disabled
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-50 border-2 border-slate-200 text-slate-400 font-medium cursor-not-allowed"
          >
            <svg className="w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
            </svg>
            Connect WhatsApp
          </button>
        </div>
      </div>

      {/* Reminder Schedule */}
      <div className="bg-white rounded-2xl p-6 border border-surface-border shadow-sm">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Reminder Schedule</h3>
        <p className="text-sm text-text-secondary mb-6">Automatic reminders are sent for unpaid invoices based on their due date.</p>
        <div className="space-y-3">
          {[
            { stage: 1, label: 'Due Date', description: 'Friendly reminder on the invoice due date', color: 'text-primary-600', bg: 'bg-primary-500/10' },
            { stage: 2, label: '3 Days Overdue', description: 'Polite follow-up 3 days after due date', color: 'text-amber-600', bg: 'bg-amber-500/10' },
            { stage: 3, label: '7 Days Overdue', description: 'Firm reminder 7 days after due date', color: 'text-orange-500', bg: 'bg-orange-500/10' },
            { stage: 4, label: '14 Days Overdue', description: 'Final notice 14 days after due date', color: 'text-red-600', bg: 'bg-red-500/10' },
          ].map((item) => (
            <div key={item.stage} className={`flex items-center gap-4 p-4 rounded-xl ${item.bg} border border-surface-border`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color} font-bold text-sm bg-white/60`}>
                {item.stage}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${item.color}`}>{item.label}</p>
                <p className="text-xs text-text-secondary mt-0.5">{item.description}</p>
              </div>
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
