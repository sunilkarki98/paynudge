'use client'

import { useState, useEffect } from 'react'
import { useApi } from '@/hooks/useApi'
import StatsCard from '@/components/StatsCard'
import StatusBadge from '@/components/StatusBadge'
import Link from 'next/link'

interface DashboardData {
  paidInvoices: number
  dueInvoices: number
  overdueInvoices: number
  totalPendingAmount: number
  recentInvoices: Array<{
    id: string
    clientName: string
    amount: number | string
    dueDate: string
    status: string
    aiMetadata?: {
      riskScore: string
    }
  }>
}

function formatCurrency(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(num)
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const { apiFetch } = useApi()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await apiFetch('/api/dashboard')
        setData(result)
      } catch (err) {
        console.error('Dashboard fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [apiFetch])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-text-secondary">
        <p>Failed to load dashboard data</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-text-secondary mt-1">Overview of your invoicing activity</p>
        </div>
        <Link
          href="/invoices/new"
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-xl font-medium transition-colors shadow-lg shadow-primary-500/20"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Upload Invoice
        </Link>
      </div>

      {/* Action Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 stagger-children">
        <StatsCard
          title="Paid Invoices"
          value={data.paidInvoices}
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          gradient="from-emerald-500 to-green-500"
        />
        <StatsCard
          title="Due Invoices"
          value={data.dueInvoices}
          subtitle="Pending but not overdue"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          gradient="from-amber-500 to-yellow-500"
        />
        <StatsCard
          title="Overdue Invoices"
          value={data.overdueInvoices}
          subtitle="Action required"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.832c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          }
          gradient="from-red-500 to-rose-500"
        />
        <StatsCard
          title="Total Pending"
          value={formatCurrency(data.totalPendingAmount)}
          subtitle="Combined due & overdue amounts"
          icon={
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          gradient="from-indigo-500 to-purple-500"
        />
      </div>

      {/* Recent Invoices */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-surface-border">
          <h3 className="text-lg font-semibold text-text-primary">Recent Invoices</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-text-secondary border-b border-surface-border">
                <th className="px-6 py-4 font-medium">Client</th>
                <th className="px-6 py-4 font-medium">Amount</th>
                <th className="px-6 py-4 font-medium">Due Date</th>
                <th className="px-6 py-4 font-medium">Status / Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.recentInvoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-surface-border table-row-hover">
                  <td className="px-6 py-4 text-sm text-text-primary font-medium">{invoice.clientName}</td>
                  <td className="px-6 py-4 text-sm text-text-primary">{formatCurrency(invoice.amount)}</td>
                  <td className="px-6 py-4 text-sm text-text-primary">
                    {new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4 flex flex-col gap-1 items-start">
                    <StatusBadge status={invoice.status} dueDate={invoice.dueDate} />
                    {invoice.aiMetadata && invoice.status !== 'PAID' && (
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                        invoice.aiMetadata.riskScore === 'HIGH' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                        invoice.aiMetadata.riskScore === 'MEDIUM' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                        'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                      }`}>
                        AI Risk: {invoice.aiMetadata.riskScore}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {data.recentInvoices.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-text-secondary">
                    No recent invoices found. Upload one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
