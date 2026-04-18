'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApi } from '@/hooks/useApi'

interface Client {
  id: string
  name: string
  email: string
  createdAt: string
  whatsappNumber?: string | null
  smsNumber?: string | null
  chasingProfile: string
  contactChannel: string
  invoices: Array<{ id: string; amount: number | string; status: string }>
}

function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const defaultForm = { name: '', email: '', whatsappNumber: '', smsNumber: '', chasingProfile: 'NORMAL', contactChannel: 'EMAIL' }
  const [formData, setFormData] = useState(defaultForm)
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const { apiFetch } = useApi()

  const fetchClients = useCallback(async () => {
    try {
      const result = await apiFetch('/api/clients?limit=100')
      setClients(result.data)
    } catch (err) {
      console.error('Fetch clients error:', err)
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormLoading(true)
    try {
      if (editClient) {
        await apiFetch(`/api/clients/${editClient.id}`, {
          method: 'PUT',
          body: JSON.stringify(formData),
        })
      } else {
        await apiFetch('/api/clients', {
          method: 'POST',
          body: JSON.stringify(formData),
        })
      }
      setModalOpen(false)
      setEditClient(null)
      setFormData(defaultForm)
      await fetchClients()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this client? Their invoices will be preserved but disassociated.')) return
    try {
      await apiFetch(`/api/clients/${id}`, { method: 'DELETE' })
      await fetchClients()
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const openEdit = (client: Client) => {
    setEditClient(client)
    setFormData({ 
      name: client.name, 
      email: client.email, 
      whatsappNumber: client.whatsappNumber || '',
      smsNumber: client.smsNumber || '',
      chasingProfile: client.chasingProfile || 'NORMAL',
      contactChannel: client.contactChannel || 'EMAIL'
    })
    setModalOpen(true)
  }

  const openCreate = () => {
    setEditClient(null)
    setFormData(defaultForm)
    setModalOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Clients</h1>
          <p className="text-text-secondary mt-1">{clients.length} total clients</p>
        </div>
        <button
          onClick={openCreate}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-text-primary font-semibold hover:shadow-lg hover:shadow-primary-500/25 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </button>
      </div>

      {/* Client Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.length === 0 ? (
          <div className="col-span-full text-center py-16 glass-card rounded-2xl">
            <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-text-muted">No clients yet. Add your first client!</p>
          </div>
        ) : (
          clients.map((client) => {
            const paidAmount = client.invoices
              .filter((inv) => inv.status.toUpperCase() === 'PAID')
              .reduce((sum, inv) => sum + (typeof inv.amount === 'string' ? parseFloat(inv.amount) : inv.amount), 0)
            const unpaidCount = client.invoices.filter((inv) => inv.status.toUpperCase() === 'UNPAID').length

            return (
              <div key={client.id} className="glass-card rounded-2xl p-6 hover:scale-[1.02] transition-transform duration-300 group">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-text-primary text-lg font-bold">
                      {client.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-text-primary">{client.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${client.chasingProfile === 'STRICT' ? 'bg-red-500/10 text-red-600 border-red-500/20' : client.chasingProfile === 'RELAXED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-blue-500/10 text-blue-600 border-blue-500/20'}`}>
                          {client.chasingProfile}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary">{client.email}</p>
                      <div className="flex items-center gap-3">
                        {client.whatsappNumber && <p className="text-xs tracking-tight text-text-muted mt-0.5 max-w-[140px] truncate">WA: {client.whatsappNumber}</p>}
                        {client.smsNumber && <p className="text-xs tracking-tight text-text-muted mt-0.5 max-w-[140px] truncate">SMS: {client.smsNumber}</p>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(client)}
                      className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-raised"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(client.id)}
                      className="p-2 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-500/10"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-surface-border">
                  <div className="text-center">
                    <p className="text-lg font-bold text-text-primary">{client.invoices.length}</p>
                    <p className="text-xs text-text-muted">Invoices</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-600">{formatCurrency(paidAmount)}</p>
                    <p className="text-xs text-text-muted">Paid</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-amber-600">{unpaidCount}</p>
                    <p className="text-xs text-text-muted">Unpaid</p>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Client Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 modal-backdrop" onClick={() => setModalOpen(false)}>
          <div
            className="w-full max-w-md glass-card rounded-2xl shadow-2xl animate-fade-in flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-surface-border shrink-0">
              <h2 className="text-xl font-semibold text-text-primary">
                {editClient ? 'Edit Client' : 'Add Client'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-raised">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              {formError && (
                <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/20 text-red-600 text-sm">{formError}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-500 focus:border-primary-500"
                  placeholder="Client name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Email *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-500 focus:border-primary-500"
                  placeholder="client@example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={formData.whatsappNumber}
                    onChange={(e) => setFormData((p) => ({ ...p, whatsappNumber: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-500 focus:border-primary-500"
                    placeholder="+1234567890"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">SMS Number</label>
                  <input
                    type="tel"
                    value={formData.smsNumber}
                    onChange={(e) => setFormData((p) => ({ ...p, smsNumber: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-500 focus:border-primary-500"
                    placeholder="+1234567890"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Risk Profile</label>
                  <select
                    value={formData.chasingProfile}
                    onChange={(e) => setFormData((p) => ({ ...p, chasingProfile: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-500 focus:border-primary-500"
                  >
                    <option value="STRICT">Strict (Fast)</option>
                    <option value="NORMAL">Normal</option>
                    <option value="RELAXED">Relaxed (Slow)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Channel Options</label>
                  <select
                    value={formData.contactChannel}
                    onChange={(e) => setFormData((p) => ({ ...p, contactChannel: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-500 focus:border-primary-500"
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
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 px-6 py-3 rounded-xl border border-surface-border text-text-primary hover:text-text-primary hover:bg-surface-raised font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-text-primary font-medium hover:shadow-lg hover:shadow-primary-500/25 disabled:opacity-50"
                >
                  {formLoading ? 'Saving...' : editClient ? 'Update' : 'Add Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
