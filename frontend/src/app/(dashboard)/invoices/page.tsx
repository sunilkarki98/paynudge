'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApi } from '@/hooks/useApi'
import StatusBadge from '@/components/StatusBadge'
import InvoiceModal, { InvoiceFormData } from '@/components/InvoiceModal'

interface Invoice {
  id: string
  clientName: string
  clientEmail: string
  amount: number | string
  dueDate: string
  description: string | null
  status: string
  reminderStage: number
  whatsappNumber?: string | null
  smsNumber?: string | null
  chasingProfile?: string
  contactChannel?: string
  createdAt: string
}

interface ReminderLog {
  id: string
  stage: number
  status: string
  channel: string | null
  tone: string | null
  messageBody: string | null
  error: string | null
  sentAt: string
}

interface Client {
  id: string
  name: string
  email: string
  whatsappNumber?: string | null
  smsNumber?: string | null
  chasingProfile?: string
  contactChannel?: string
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num)
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [currentPage, setCurrentPage] = useState(1)
  const { apiFetch } = useApi()

  // Reminder states
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null)
  const [reminderFeedback, setReminderFeedback] = useState<{ id: string; type: 'success' | 'error'; message: string } | null>(null)
  const [historyInvoice, setHistoryInvoice] = useState<Invoice | null>(null)
  const [historyData, setHistoryData] = useState<ReminderLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const fetchInvoices = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
      })

      if (filterStatus !== 'all') params.set('status', filterStatus.toUpperCase())
      if (searchTerm) params.set('search', searchTerm)

      const [invoiceResult, clientResult] = await Promise.all([
        apiFetch(`/api/invoices?${params.toString()}`),
        apiFetch('/api/clients?limit=100'),
      ])
      setInvoices(invoiceResult.data)
      setPagination(invoiceResult.pagination)
      setClients(clientResult.data)
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [apiFetch, currentPage, filterStatus, searchTerm])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filterStatus, searchTerm])

  const handleCreate = async (data: InvoiceFormData) => {
    await apiFetch('/api/invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    await fetchInvoices()
  }

  const handleUpdate = async (data: InvoiceFormData) => {
    if (!editInvoice) return
    await apiFetch(`/api/invoices/${editInvoice.id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    setEditInvoice(null)
    await fetchInvoices()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return
    await apiFetch(`/api/invoices/${id}`, { method: 'DELETE' })
    await fetchInvoices()
  }

  const handleToggleStatus = async (invoice: Invoice) => {
    const normalizedStatus = invoice.status.toUpperCase()
    const newStatus = normalizedStatus === 'PAID' ? 'UNPAID' : 'PAID'
    await apiFetch(`/api/invoices/${invoice.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus }),
    })
    await fetchInvoices()
  }

  const handleEdit = (invoice: Invoice) => {
    setEditInvoice(invoice)
    setModalOpen(true)
  }

  const handleSendReminder = async (invoice: Invoice) => {
    setSendingReminderId(invoice.id)
    setReminderFeedback(null)
    try {
      const result = await apiFetch(`/api/invoices/${invoice.id}/remind`, { method: 'POST' })
      setReminderFeedback({
        id: invoice.id,
        type: 'success',
        message: `Sent via ${result.channels?.join(', ') || 'email'}`,
      })
      setTimeout(() => setReminderFeedback(null), 4000)
    } catch (err) {
      setReminderFeedback({
        id: invoice.id,
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to send',
      })
      setTimeout(() => setReminderFeedback(null), 5000)
    } finally {
      setSendingReminderId(null)
    }
  }

  const handleViewHistory = async (invoice: Invoice) => {
    setHistoryInvoice(invoice)
    setHistoryLoading(true)
    try {
      const result = await apiFetch(`/api/invoices/${invoice.id}/history`)
      setHistoryData(result.data || [])
    } catch {
      setHistoryData([])
    } finally {
      setHistoryLoading(false)
    }
  }

  // Using server-side pagination and filtering, so we don't need client-filter
  // (Previously this was filtering 'overdue' and 'pending' locally while fetching 'unpaid' globally)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Invoices</h1>
          <p className="text-text-secondary mt-1">{pagination.total} total invoices</p>
        </div>
        <button
          onClick={() => { setEditInvoice(null); setModalOpen(true) }}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-text-primary font-semibold hover:shadow-lg hover:shadow-primary-500/25 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary placeholder-slate-500 focus:border-primary-500"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'paid', 'pending', 'overdue'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize ${
                filterStatus === status
                  ? 'bg-primary-500/15 text-primary-600 border border-primary-500/40'
                  : 'text-text-secondary hover:text-text-primary bg-surface-raised/50 border border-surface-border'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-raised border-b border-surface-border">
              <tr className="text-left text-xs uppercase tracking-wider text-text-secondary">
                <th className="px-6 py-4 font-bold">Invoice</th>
                <th className="px-6 py-4 font-bold">Client</th>
                <th className="px-6 py-4 font-bold">Amount</th>
                <th className="px-6 py-4 font-bold">Due Date</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4 font-bold">Reminders</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-text-muted">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    No invoices found
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {
                  const isPaid = invoice.status.toUpperCase() === 'PAID'
                  return (
                  <tr key={invoice.id} className="border-b border-surface-border table-row-hover">
                    <td className="px-6 py-5 text-sm font-mono text-text-muted">
                      #{invoice.id.slice(-8).toUpperCase()}
                    </td>
                    <td className="px-6 py-5">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{invoice.clientName}</p>
                        <p className="text-xs text-text-secondary font-medium">{invoice.clientEmail}</p>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-text-primary">{formatCurrency(invoice.amount)}</td>
                    <td className="px-6 py-5 text-sm font-medium text-text-secondary">
                      {new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-5">
                      <StatusBadge status={invoice.status} dueDate={invoice.dueDate} />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4].map((stage) => (
                          <div
                            key={stage}
                            className={`w-2.5 h-2.5 rounded-full ${
                              invoice.reminderStage >= stage
                                ? stage <= 2 ? 'bg-amber-400 shadow-sm' : 'bg-red-500 shadow-sm'
                                : 'bg-slate-200 shadow-inner'
                            }`}
                            title={`Reminder ${stage}${invoice.reminderStage >= stage ? ' (sent)' : ''}`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-end gap-2">
                        {/* Send Reminder (only for unpaid) */}
                        {!isPaid && (
                          <div className="relative">
                            <button
                              onClick={() => handleSendReminder(invoice)}
                              disabled={sendingReminderId === invoice.id}
                              className="p-2 rounded-xl text-blue-600 hover:bg-blue-500/15 hover:text-blue-700 disabled:opacity-50 transition-colors"
                              title="Send reminder now"
                            >
                              {sendingReminderId === invoice.id ? (
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                              )}
                            </button>
                            {/* Inline feedback tooltip */}
                            {reminderFeedback?.id === invoice.id && (
                              <div className={`absolute bottom-full right-0 mb-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shadow-lg animate-fade-in z-10 ${
                                reminderFeedback.type === 'success'
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-red-600 text-white'
                              }`}>
                                {reminderFeedback.message}
                              </div>
                            )}
                          </div>
                        )}
                        {/* View History */}
                        <button
                          onClick={() => handleViewHistory(invoice)}
                          className="p-2 rounded-xl text-text-secondary hover:text-primary-600 hover:bg-primary-500/15 transition-colors"
                          title="View reminder history"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleToggleStatus(invoice)}
                          className={`p-2 rounded-xl transition-colors ${
                            isPaid
                              ? 'text-amber-600 hover:bg-amber-500/15 hover:text-amber-700'
                              : 'text-emerald-600 hover:bg-emerald-500/15 hover:text-emerald-700'
                          }`}
                          title={isPaid ? 'Mark unpaid' : 'Mark paid'}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isPaid ? 'M6 18L18 6M6 6l12 12' : 'M5 13l4 4L19 7'} />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleEdit(invoice)}
                          className="p-2 rounded-xl text-text-secondary hover:text-indigo-600 hover:bg-indigo-500/15 transition-colors"
                          title="Edit invoice"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(invoice.id)}
                          className="p-2 rounded-xl text-text-secondary hover:text-red-600 hover:bg-red-500/15 transition-colors"
                          title="Delete invoice"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-surface-border">
            <p className="text-sm text-text-secondary">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-surface-raised border border-surface-border text-text-primary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={currentPage >= pagination.totalPages}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-surface-raised border border-surface-border text-text-primary hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Invoice Modal — rendered outside animated div to fix fixed positioning */}
    <InvoiceModal
      isOpen={modalOpen}
      onClose={() => { setModalOpen(false); setEditInvoice(null) }}
      onSubmit={editInvoice ? handleUpdate : handleCreate}
      initialData={
        editInvoice
          ? {
              clientName: editInvoice.clientName,
              clientEmail: editInvoice.clientEmail,
              amount: editInvoice.amount.toString(),
              dueDate: new Date(editInvoice.dueDate).toISOString().split('T')[0],
              description: editInvoice.description || '',
              whatsappNumber: editInvoice.whatsappNumber || '',
              smsNumber: editInvoice.smsNumber || '',
              chasingProfile: editInvoice.chasingProfile || 'NORMAL',
              contactChannel: editInvoice.contactChannel || 'EMAIL',
            }
          : null
      }
      clients={clients}
    />

    {/* Reminder History Modal */}
    {historyInvoice && (
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 pt-6 sm:pt-8 modal-backdrop" onClick={() => setHistoryInvoice(null)}>
        <div
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl animate-fade-in flex flex-col max-h-[calc(100vh-5rem)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-surface-border shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Reminder History</h2>
              <p className="text-sm text-text-secondary mt-0.5">
                {historyInvoice.clientName} — {formatCurrency(historyInvoice.amount)}
              </p>
            </div>
            <button onClick={() => setHistoryInvoice(null)} className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-raised">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto flex-1 min-h-0">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : historyData.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-12 h-12 mx-auto mb-3 text-text-dim opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-text-muted">No reminders sent yet for this invoice.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyData.map((log) => (
                  <div key={log.id} className="p-4 rounded-xl border border-surface-border bg-surface-base hover:bg-surface-raised transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {/* Status badge */}
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          log.status === 'sent'
                            ? 'bg-green-100 text-green-700'
                            : log.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : log.status === 'dead_letter'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {log.status === 'sent' && (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          )}
                          {log.status === 'failed' && (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          )}
                          {log.status}
                        </span>
                        {/* Channel */}
                        {log.channel && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            {log.channel}
                          </span>
                        )}
                        {/* Stage */}
                        <span className="text-xs text-text-muted">
                          {log.stage === 0 ? 'Manual' : `Stage ${log.stage}`}
                        </span>
                      </div>
                      <span className="text-xs text-text-muted whitespace-nowrap">
                        {new Date(log.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                        {new Date(log.sentAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {/* Message preview */}
                    {log.messageBody && (
                      <p className="text-sm text-text-secondary line-clamp-2 mt-1">{log.messageBody}</p>
                    )}
                    {/* Error */}
                    {log.error && (
                      <p className="text-xs text-red-500 mt-1">Error: {log.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
