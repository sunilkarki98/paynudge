'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useApi } from '@/hooks/useApi'

interface Client {
  id: string
  name: string
  email: string
  whatsappNumber?: string | null
  smsNumber?: string | null
  chasingProfile?: string
  contactChannel?: string
}

interface ParsedInvoice {
  clientName: string
  clientEmail: string
  amount: number
  dueDate: string
  description?: string
  confidenceScore: number
}

interface InvoiceFormData {
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

type Step = 'upload' | 'extracting' | 'review'

export default function NewInvoicePage() {
  const router = useRouter()
  const { apiFetch } = useApi()

  const [step, setStep] = useState<Step>('upload')
  const [clients, setClients] = useState<Client[]>([])
  
  // File drag & drop state
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Extraction state
  const [confidence, setConfidence] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form State
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
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Fetch clients on mount so we have them for the review step
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const result = await apiFetch('/api/clients?limit=100')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setClients(result.data || [])
      } catch (err) {
        console.error('Failed to pre-fetch clients', err)
      }
    }
    fetchClients()
  }, [apiFetch])

  const handleUpload = async (file: File) => {
    setStep('extracting')
    setError(null)
    
    try {
      const data = new FormData()
      data.append('file', file)

      const result = await apiFetch('/api/upload', {
        method: 'POST',
        // Omit Content-Type header so browser sets multipart/form-data boundary automatically
        body: data,
      })

      if (result.success && result.data) {
        const parsed = result.data as ParsedInvoice
        setConfidence(parsed.confidenceScore)
        
        // Auto-match existing client by email or exact name (case-insensitive)
        const matchedClient = clients.find(
          c => c.email.toLowerCase() === parsed.clientEmail?.toLowerCase() || 
               c.name.toLowerCase() === parsed.clientName?.toLowerCase()
        )

        setFormData({
          clientName: matchedClient ? matchedClient.name : (parsed.clientName || ''),
          clientEmail: matchedClient ? matchedClient.email : (parsed.clientEmail || ''),
          amount: parsed.amount ? parsed.amount.toString() : '',
          dueDate: parsed.dueDate || '',
          description: parsed.description || '',
          clientId: matchedClient ? matchedClient.id : undefined,
          whatsappNumber: matchedClient?.whatsappNumber || '',
          smsNumber: matchedClient?.smsNumber || '',
          chasingProfile: matchedClient?.chasingProfile || 'NORMAL',
          contactChannel: matchedClient?.contactChannel || 'EMAIL',
        })

        setStep('review')
      } else {
        throw new Error('Failed to parse invoice properly.')
      }
    } catch (err) {
      console.error('Upload Error:', err)
      setError(err instanceof Error ? err.message : 'Error extracting invoice. Please enter manually.')
      setStep('review') // Dump to review screen anyway so they can type it manually
    }
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients])

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files[0])
    }
  }

  const handleSkipToManual = () => {
    setError(null)
    setStep('review')
  }

  const handleClientSelect = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId)
    if (client) {
      setFormData((prev) => ({
        ...prev,
        clientId: client.id,
        clientName: client.name,
        clientEmail: client.email,
        whatsappNumber: client.whatsappNumber || prev.whatsappNumber,
        smsNumber: client.smsNumber || prev.smsNumber,
        chasingProfile: client.chasingProfile || prev.chasingProfile,
        contactChannel: client.contactChannel || prev.contactChannel,
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      await apiFetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify(formData),
      })
      router.push('/invoices') // Send back to table on success
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in relative">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">New Invoice</h1>
        <p className="text-text-secondary mt-1">
          {step === 'upload' ? 'Upload a document and let AI extract the details.' : 
           step === 'extracting' ? 'Analyzing document...' : 
           'Review and confirm invoice details.'}
        </p>
      </div>

      {step === 'upload' && (
        <div 
          className={`glass-card rounded-3xl border-2 border-dashed p-16 flex flex-col items-center justify-center text-center transition-all duration-300 ${
            isDragging 
              ? 'border-primary-500 bg-primary-500/10 scale-[1.02]' 
              : 'border-surface-border hover:border-primary-500/50 hover:bg-surface-raised/50'
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-accent-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-primary-500/20">
             <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 className="text-2xl font-semibold text-text-primary mb-2">Drag and drop your invoice</h3>
          <p className="text-text-secondary mb-8 max-w-sm">
            Supports PDF, CSV, JSON, or plain text formats. The AI will do the heavy lifting.
          </p>
          
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={onFileSelect}
            className="hidden" 
            accept=".pdf,.csv,.json,.txt,image/*"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-8 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary font-semibold hover:border-primary-500 hover:text-primary-400 transition-colors"
          >
            Browse Files
          </button>

          <div className="mt-8 pt-8 border-t border-surface-border/50 w-full max-w-md">
            <button 
              onClick={handleSkipToManual}
              className="text-sm text-text-muted hover:text-primary-400 transition-colors"
            >
              Skip AI and enter details manually
            </button>
          </div>
        </div>
      )}

      {step === 'extracting' && (
        <div className="glass-card rounded-3xl p-16 flex flex-col items-center justify-center text-center">
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 border-4 border-surface-border rounded-full"></div>
            <div className="absolute inset-0 border-4 border-primary-500 rounded-full border-t-transparent animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-8 h-8 text-primary-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <h3 className="text-2xl font-semibold text-text-primary mb-2 animate-pulse">Extracting Intelligence...</h3>
          <p className="text-text-secondary">Our AI is reading your document and mapping the important fields.</p>
        </div>
      )}

      {step === 'review' && (
        <div className="glass-card rounded-3xl overflow-hidden shadow-2xl">
          <div className="bg-surface-raised p-6 border-b border-surface-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Confirm Details
              </h2>
              <p className="text-sm text-text-secondary mt-1">Make any necessary corrections below before creating.</p>
            </div>
            
            {confidence !== null && (
              <div className={`px-4 py-2 rounded-xl flex items-center gap-2 border bg-opacity-10 backdrop-blur-md font-medium text-sm ${
                confidence >= 90 ? 'bg-emerald-500 text-emerald-400 border-emerald-500/20' :
                confidence >= 70 ? 'bg-amber-500 text-amber-400 border-amber-500/20' :
                'bg-red-500 text-red-400 border-red-500/20'
              }`}>
                AI Confidence: {confidence}%
                {confidence < 80 && (
                  <span className="ml-2 w-2 h-2 rounded-full bg-current animate-pulse" />
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
            {error && (
              <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
                 <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            {/* Client Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-surface-border pb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">1. Client Information</h3>
                
                {clients.length > 0 && (
                  <select
                    onChange={(e) => handleClientSelect(e.target.value)}
                    value={formData.clientId || ''}
                    className="text-sm px-3 py-1.5 rounded-lg bg-surface-raised border border-surface-border text-text-primary focus:border-primary-500"
                  >
                    <option value="" disabled>Link to existing client...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Client/Company Name *</label>
                  <input
                    type="text" required
                    value={formData.clientName}
                    onChange={(e) => setFormData(p => ({ ...p, clientName: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-card border border-surface-border text-text-primary placeholder-text-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-shadow"
                    placeholder="Acme Corp"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Billing Email *</label>
                  <input
                    type="email" required
                    value={formData.clientEmail}
                    onChange={(e) => setFormData(p => ({ ...p, clientEmail: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-card border border-surface-border text-text-primary placeholder-text-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-shadow"
                    placeholder="billing@acme.com"
                  />
                </div>
              </div>
            </div>

            {/* Financial Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary border-b border-surface-border pb-2">2. Financial Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Amount (USD) *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted font-medium">$</span>
                    <input
                      type="number" required min="0" step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData(p => ({ ...p, amount: e.target.value }))}
                      className="w-full pl-8 pr-4 py-3 rounded-xl bg-surface-card border border-surface-border text-text-primary placeholder-text-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-shadow"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Due Date *</label>
                  <input
                    type="date" required
                    value={formData.dueDate}
                    onChange={(e) => setFormData(p => ({ ...p, dueDate: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-card border border-surface-border text-text-primary focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-shadow"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-text-primary mb-2">Description / Memo</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-card border border-surface-border text-text-primary placeholder-text-muted focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-shadow resize-none"
                    rows={2}
                    placeholder="Design services rendered for Q3..."
                  />
                </div>
              </div>
            </div>

            {/* Automation Setup */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary border-b border-surface-border pb-2">3. Chase Automation</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Chasing Strategy</label>
                  <select
                    value={formData.chasingProfile || 'NORMAL'}
                    onChange={(e) => setFormData(p => ({ ...p, chasingProfile: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-card border border-surface-border text-text-primary focus:border-primary-500"
                  >
                    <option value="STRICT">Strict & Fast</option>
                    <option value="NORMAL">Standard Schedule</option>
                    <option value="RELAXED">Relaxed & Spaced Out</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-2">Active Channels</label>
                  <select
                    value={formData.contactChannel || 'EMAIL'}
                    onChange={(e) => setFormData(p => ({ ...p, contactChannel: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-card border border-surface-border text-text-primary focus:border-primary-500"
                  >
                    <option value="EMAIL">Email Only</option>
                    <option value="SMS">SMS Only</option>
                    <option value="EMAIL_AND_SMS">Email + SMS</option>
                    <option value="WHATSAPP">WhatsApp Only</option>
                    <option value="BOTH">Email + WhatsApp</option>
                    <option value="ALL">All Available Channels</option>
                  </select>
                </div>

                <div className={(formData.contactChannel !== 'EMAIL' && formData.contactChannel !== 'WHATSAPP') ? 'block' : 'hidden'}>
                  <label className="block text-sm font-medium text-text-primary mb-2">Client SMS Number</label>
                  <input
                    type="tel"
                    value={formData.smsNumber}
                    onChange={(e) => setFormData(p => ({ ...p, smsNumber: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-card border border-surface-border text-text-primary placeholder-text-muted focus:border-primary-500"
                    placeholder="+1234567890"
                  />
                  {formData.contactChannel?.includes('SMS') && !formData.smsNumber && (
                    <p className="text-xs text-amber-500 mt-2">Required for SMS chasing</p>
                  )}
                </div>

                 <div className={(formData.contactChannel === 'WHATSAPP' || formData.contactChannel === 'BOTH' || formData.contactChannel === 'ALL') ? 'block' : 'hidden'}>
                  <label className="block text-sm font-medium text-text-primary mb-2">Client WhatsApp</label>
                  <input
                    type="tel"
                    value={formData.whatsappNumber}
                    onChange={(e) => setFormData(p => ({ ...p, whatsappNumber: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-surface-card border border-surface-border text-text-primary placeholder-text-muted focus:border-primary-500"
                    placeholder="+1234567890"
                  />
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-6 border-t border-surface-border flex flex-col sm:flex-row gap-4 justify-end">
               <button
                type="button"
                onClick={() => setStep('upload')}
                className="px-8 py-3 rounded-xl border border-surface-border text-text-primary hover:bg-surface-raised font-medium transition-colors"
                disabled={isSubmitting}
              >
                Upload Different File
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-10 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-bold hover:shadow-lg hover:shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2 text-white">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating...
                  </span>
                ) : 'Activate Invoice & Start Chasing ⚡'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
