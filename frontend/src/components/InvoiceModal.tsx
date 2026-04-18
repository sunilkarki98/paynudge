'use client'

import { useState, useEffect } from 'react'

interface InvoiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: InvoiceFormData) => Promise<void>
  initialData?: InvoiceFormData | null
  clients?: Array<{ id: string; name: string; email: string; whatsappNumber?: string | null; smsNumber?: string | null; chasingProfile?: string; contactChannel?: string }>
}

export interface InvoiceFormData {
  clientName: string
  clientEmail: string
  amount: string
  dueDate: string
  description: string
  clientId?: string
  whatsappNumber?: string
  smsNumber?: string
  chasingProfile?: string
  contactChannel?: string
}

export default function InvoiceModal({ isOpen, onClose, onSubmit, initialData, clients }: InvoiceModalProps) {
  const [formData, setFormData] = useState<InvoiceFormData>({
    clientName: '',
    clientEmail: '',
    amount: '',
    dueDate: '',
    description: '',
    whatsappNumber: '',
    smsNumber: '',
    chasingProfile: 'NORMAL',
    contactChannel: 'EMAIL',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (initialData) {
      setFormData(initialData)
    } else {
      setFormData({ 
        clientName: '', clientEmail: '', amount: '', dueDate: '', description: '',
        whatsappNumber: '', smsNumber: '', chasingProfile: 'NORMAL', contactChannel: 'EMAIL'
      })
    }
  }, [initialData, isOpen])

  const handleClientSelect = (clientId: string) => {
    const client = clients?.find((c) => c.id === clientId)
    if (client) {
      setFormData((prev) => ({
        ...prev,
        clientId: client.id,
        clientName: client.name,
        clientEmail: client.email,
        whatsappNumber: client.whatsappNumber || '',
        smsNumber: client.smsNumber || '',
        chasingProfile: client.chasingProfile || 'NORMAL',
        contactChannel: client.contactChannel || 'EMAIL',
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onSubmit(formData)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 pt-6 sm:pt-8 modal-backdrop" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl animate-fade-in flex flex-col max-h-[calc(100vh-5rem)] sm:max-h-[calc(100vh-6rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-surface-border shrink-0">
          <h2 className="text-xl font-semibold text-text-primary">
            {initialData ? 'Edit Invoice' : 'Create Invoice'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-raised">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/20 text-red-600 text-sm">
              {error}
            </div>
          )}

          {clients && clients.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Select Client</label>
              <select
                onChange={(e) => handleClientSelect(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl bg-surface-raised border border-surface-border text-text-primary focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all shadow-inner"
                defaultValue=""
              >
                <option value="" disabled>Choose existing client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Client Name *</label>
              <input
                type="text"
                required
                value={formData.clientName}
                onChange={(e) => setFormData((prev) => ({ ...prev, clientName: e.target.value }))}
                className="w-full px-4 py-3.5 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all shadow-inner"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Client Email *</label>
              <input
                type="email"
                required
                value={formData.clientEmail}
                onChange={(e) => setFormData((prev) => ({ ...prev, clientEmail: e.target.value }))}
                className="w-full px-4 py-3.5 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all shadow-inner"
                placeholder="billing@acme.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Amount (USD) *</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                className="w-full px-4 py-3.5 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all shadow-inner"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500 mb-2">Due Date *</label>
              <input
                type="date"
                required
                value={formData.dueDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="w-full px-4 py-3.5 rounded-xl bg-surface-raised border border-surface-border text-text-primary focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all shadow-inner"
              />
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
            >
              <svg className={`w-4 h-4 transition-transform duration-300 ${showAdvanced ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
            </button>
          </div>

          {/* Advanced Settings Content */}
          {showAdvanced && (
            <div className="space-y-4 animate-slide-down pb-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-2">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={formData.whatsappNumber || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, whatsappNumber: e.target.value }))}
                    className="w-full px-4 py-3.5 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all shadow-inner"
                    placeholder="+1234567890"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-2">SMS Number</label>
                  <input
                    type="tel"
                    value={formData.smsNumber || ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, smsNumber: e.target.value }))}
                    className="w-full px-4 py-3.5 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all shadow-inner"
                    placeholder="+1234567890"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-2">Risk Profile</label>
                  <select
                    value={formData.chasingProfile || 'NORMAL'}
                    onChange={(e) => setFormData((prev) => ({ ...prev, chasingProfile: e.target.value }))}
                    className="w-full px-4 py-3.5 rounded-xl bg-surface-raised border border-surface-border text-text-primary focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all shadow-inner"
                  >
                    <option value="STRICT">Strict (Fast)</option>
                    <option value="NORMAL">Normal</option>
                    <option value="RELAXED">Relaxed (Slow)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-2">Channel Options</label>
                  <select
                    value={formData.contactChannel || 'EMAIL'}
                    onChange={(e) => setFormData((prev) => ({ ...prev, contactChannel: e.target.value }))}
                    className="w-full px-4 py-3.5 rounded-xl bg-surface-raised border border-surface-border text-text-primary focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all shadow-inner"
                  >
                    <option value="EMAIL">Email Only</option>
                    <option value="WHATSAPP">WhatsApp Only</option>
                    <option value="SMS">SMS Only</option>
                    <option value="BOTH">Email + WhatsApp</option>
                    <option value="EMAIL_AND_SMS">Email + SMS</option>
                    <option value="ALL">All Channels</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-500 mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-3.5 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 transition-all shadow-inner resize-none"
              rows={3}
              placeholder="Project description..."
            />
          </div>

          <div className="flex gap-3 pt-6 pb-2 border-t border-surface-border mt-auto shrink-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 rounded-xl border border-surface-border text-text-primary hover:text-text-primary hover:bg-surface-raised font-medium active:scale-95 transition-transform"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium hover:shadow-lg hover:shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </span>
              ) : initialData ? 'Update Invoice' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
