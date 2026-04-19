'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

interface ModelMeta {
  id: string
  displayName: string
  description: string
}

interface UserData {
  id: string
  email: string
  name: string | null
  subscriptionTier: 'FREE' | 'PRO'
  createdAt: string
}

export default function AdminSettingsPage() {
  const [adminKey, setAdminKey] = useState('')
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [authError, setAuthError] = useState('')

  const [activeTab, setActiveTab] = useState<'ai' | 'users'>('ai')

  // AI Config State
  const [apiKey, setApiKey] = useState('')
  const [parserModel, setParserModel] = useState('')
  const [generatorModel, setGeneratorModel] = useState('')
  const [availableModels, setAvailableModels] = useState<ModelMeta[]>([])
  const [isDetecting, setIsDetecting] = useState(false)
  
  // User Management State
  const [users, setUsers] = useState<UserData[]>([])
  
  // General State
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Standard fetch wrapper with admin key
  const callAdmin = async (path: string, options: any = {}) => {
    return await api.request(path, {
      ...options,
      headers: {
        'x-admin-key': adminKey,
        ...options.headers,
      }
    })
  }

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setAuthError('')
    
    try {
      // 1. Fetch AI settings
      const result = await api.get<any>('/admin/settings', {
        headers: { 'x-admin-key': adminKey }
      })
      setApiKey(result.apiKey || '')
      setParserModel(result.parserModel || '')
      setGeneratorModel(result.generatorModel || '')
      
      // 2. Fetch Users
      const userResult = await api.get<any>('/admin/users', {
        headers: { 'x-admin-key': adminKey }
      })
      if (userResult.success) {
        setUsers(userResult.users)
      }

      setIsUnlocked(true)

      if (result.apiKey) {
         detectModels(result.apiKey, adminKey)
      }
    } catch (err) {
      setAuthError('Invalid Admin Key')
    } finally {
      setIsLoading(false)
    }
  }

  // ─── AI Config Methods ─────────────────────────────────

  const detectModels = async (keyToUse: string, activeAdminKey: string) => {
    setIsDetecting(true)
    setMessage(null)
    try {
      const result = await api.post<any>('/admin/settings/models', { apiKey: keyToUse }, {
        headers: { 'x-admin-key': activeAdminKey }
      })
      
      if (result.success) {
        setAvailableModels(result.models || [])
        if (result.models.length > 0) {
            setParserModel(prev => prev || result.models[0].id)
            setGeneratorModel(prev => prev || result.models[0].id)
        }
      } else {
        throw new Error(result.error)
      }
    } catch (err) {
       setAvailableModels([])
    } finally {
      setIsDetecting(false)
    }
  }

  const handleSaveAI = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setMessage(null)

    try {
      await api.post('/admin/settings', { apiKey, parserModel, generatorModel }, {
        headers: { 'x-admin-key': adminKey }
      })
      setMessage({ type: 'success', text: 'System AI Settings saved successfully. Changes are live instantly.' })
    } catch (err) {
       setMessage({ type: 'error', text: 'Failed to save settings.' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTierChange = async (userId: string, newTier: 'FREE' | 'PRO') => {
    try {
      await api.post(`/admin/users/${userId}/tier`, { tier: newTier }, {
        headers: { 'x-admin-key': adminKey }
      })
      
      // Optimistically update UI
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, subscriptionTier: newTier } : u))
    } catch (err) {
      alert('Failed to update user tier')
    }
  }

  if (!isUnlocked) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="glass-card p-8 rounded-2xl w-full max-w-md border border-surface-border text-center">
                <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl">
                    🔒
                </div>
                <h1 className="text-2xl font-bold text-text-primary mb-2">Restricted Access</h1>
                <p className="text-text-secondary mb-8 text-sm">Enter the master administrative key to alter system configuration.</p>
                
                <form onSubmit={handleUnlock} className="space-y-4">
                    {authError && <div className="text-red-400 text-sm font-medium bg-red-500/10 py-2 rounded-lg">{authError}</div>}
                    <input
                        type="password"
                        value={adminKey}
                        required
                        placeholder="Admin Key"
                        onChange={(e) => setAdminKey(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary focus:border-red-500"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !adminKey}
                        className="w-full px-4 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-500 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? 'Verifying...' : 'Unlock System'}
                    </button>
                </form>
            </div>
        </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Admin Center</h1>
          <p className="text-text-secondary mt-1">
            Global system management. <span className="text-red-400 font-medium ml-2">Changes apply instantly to all users.</span>
          </p>
        </div>

        <div className="flex items-center gap-2 p-1 glass-card border border-surface-border rounded-xl">
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'ai' 
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' 
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            AI Configuration
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
              activeTab === 'users' 
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' 
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            User Management
          </button>
        </div>
      </div>

      {message && (
          <div className={`p-4 rounded-xl text-sm border font-medium ${
              message.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
              {message.text}
          </div>
      )}

      {activeTab === 'ai' && (
        <div className="glass-card rounded-2xl p-6 md:p-8 max-w-3xl border border-surface-border">
            <form onSubmit={handleSaveAI} className="space-y-6">
               <div className="space-y-2">
                  <label className="block text-sm font-semibold tracking-wider text-text-primary uppercase">
                      Master Google Gemini API Key
                  </label>
                  <div className="flex gap-4">
                    <input
                        type="password"
                        value={apiKey}
                        required
                        placeholder="AIzaSy..."
                        onChange={(e) => setApiKey(e.target.value)}
                        className="flex-1 px-4 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary focus:border-red-500 font-mono"
                    />
                    <button
                        type="button"
                        onClick={() => detectModels(apiKey, adminKey)}
                        disabled={isDetecting || !apiKey}
                        className="px-6 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary font-medium hover:border-red-500 hover:text-red-400 disabled:opacity-50 transition-colors"
                    >
                        {isDetecting ? 'Detecting...' : 'Detect Models'}
                    </button>
                  </div>
                  <p className="text-xs text-text-muted">This key will be utilized by all system workers for global extraction and chase generation.</p>
              </div>
  
              <div className="h-px bg-surface-border my-6" />
  
              <div className="space-y-6">
                  <div>
                     <label className="block text-sm font-semibold tracking-wider text-text-primary uppercase mb-2">
                          Parser Model (OCR & Extraction)
                      </label>
                      <select
                          value={parserModel}
                          onChange={(e) => setParserModel(e.target.value)}
                          className={`w-full px-4 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary focus:border-red-500 ${availableModels.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                          disabled={availableModels.length === 0}
                          required
                      >
                          {availableModels.length === 0 && <option value={parserModel}>{parserModel || 'Unknown Model (Detect Key First)'}</option>}
                          {availableModels.map(m => (
                              <option key={m.id} value={m.id}>{m.displayName} ({m.id})</option>
                          ))}
                      </select>
                      <p className="text-xs text-text-muted mt-2">Recommended: <span className="font-mono text-emerald-400 font-semibold">gemini-1.5-flash</span> (Best balance of speed and JSON-structuring capabilities)</p>
                  </div>
  
                  <div>
                     <label className="block text-sm font-semibold tracking-wider text-text-primary uppercase mb-2">
                          Generator Model (Email/SMS Writer)
                      </label>
                      <select
                          value={generatorModel}
                          onChange={(e) => setGeneratorModel(e.target.value)}
                          className={`w-full px-4 py-3 rounded-xl bg-surface-raised border border-surface-border text-text-primary focus:border-red-500 ${availableModels.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                          disabled={availableModels.length === 0}
                          required
                      >
                         {availableModels.length === 0 && <option value={generatorModel}>{generatorModel || 'Unknown Model (Detect Key First)'}</option>}
                          {availableModels.map(m => (
                              <option key={m.id} value={m.id}>{m.displayName} ({m.id})</option>
                          ))}
                      </select>
                      <p className="text-xs text-text-muted mt-2">Recommended: <span className="font-mono text-emerald-400 font-semibold">gemini-2.0-flash</span> (superior conversational reasoning and strict tone adherence)</p>
                  </div>
              </div>
  
              <div className="pt-6">
                  <button
                      type="submit"
                      disabled={isSaving || !apiKey || !parserModel || !generatorModel}
                      className="w-full sm:w-auto px-10 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-800 text-white font-bold hover:shadow-lg hover:shadow-red-500/20 disabled:opacity-50 transition-all"
                  >
                      {isSaving ? 'Deploying Changes...' : 'Save & Deploy AI Configuration'}
                  </button>
              </div>
            </form>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="glass-card rounded-2xl border border-surface-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-raised/50 border-b border-surface-border">
                <tr>
                  <th className="px-6 py-4 font-medium text-text-secondary">User</th>
                  <th className="px-6 py-4 font-medium text-text-secondary">Joined</th>
                  <th className="px-6 py-4 font-medium text-text-secondary">Plan Tier</th>
                  <th className="px-6 py-4 font-medium text-text-secondary text-right">Admin Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-raised/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-text-primary">{u.name || 'Unnamed User'}</div>
                      <div className="text-text-muted text-xs mt-1">{u.email}</div>
                    </td>
                    <td className="px-6 py-4 text-text-secondary">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        u.subscriptionTier === 'PRO' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-surface-raised text-text-secondary border border-surface-border'
                      }`}>
                        {u.subscriptionTier}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {u.subscriptionTier === 'FREE' ? (
                        <button
                          onClick={() => handleTierChange(u.id, 'PRO')}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        >
                          Promote to PRO
                        </button>
                      ) : (
                        <button
                          onClick={() => handleTierChange(u.id, 'FREE')}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-surface-raised text-text-secondary hover:text-text-primary transition-colors"
                        >
                          Demote to FREE
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-text-secondary">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
