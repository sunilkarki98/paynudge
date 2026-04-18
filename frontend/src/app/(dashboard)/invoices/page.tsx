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
            <thead>
              <tr className="text-left text-sm text-text-secondary border-b border-surface-border">
                <th className="px-6 py-4 font-medium">Invoice</th>
                <th className="px-6 py-4 font-medium">Client</th>
                <th className="px-6 py-4 font-medium">Amount</th>
                <th className="px-6 py-4 font-medium">Due Date</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Reminders</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
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
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono text-text-muted">#{invoice.id.slice(-8).toUpperCase()}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{invoice.clientName}</p>
                        <p className="text-xs text-text-muted">{invoice.clientEmail}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-text-primary">{formatCurrency(invoice.amount)}</td>
                    <td className="px-6 py-4 text-sm text-text-primary">
                      {new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={invoice.status} dueDate={invoice.dueDate} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((stage) => (
                          <div
                            key={stage}
                            className={`w-2 h-2 rounded-full ${
                              invoice.reminderStage >= stage
                                ? stage <= 2 ? 'bg-amber-400' : 'bg-red-400'
                                : 'bg-slate-700'
                            }`}
                            title={`Reminder ${stage}${invoice.reminderStage >= stage ? ' (sent)' : ''}`}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleStatus(invoice)}
                          className={`p-2 rounded-lg ${
                            isPaid
                              ? 'text-amber-600 hover:bg-amber-500/10'
                              : 'text-emerald-600 hover:bg-emerald-500/10'
                          }`}
                          title={isPaid ? 'Mark unpaid' : 'Mark paid'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isPaid ? 'M6 18L18 6M6 6l12 12' : 'M5 13l4 4L19 7'} />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleEdit(invoice)}
                          className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-raised"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(invoice.id)}
                          className="p-2 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-500/10"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Invoice Modal */}
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
    </div>
  )
}
