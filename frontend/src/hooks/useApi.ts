'use client'

import { useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export function useApi() {
  const { logout } = useAuth()
  const router = useRouter()

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const { data: { session } } = await supabase.auth.getSession()
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        ...(options.headers as Record<string, string>),
      }

      const fetchOptions: RequestInit = {
        ...options,
        headers,
      }

      const res = await fetch(url, fetchOptions)
      const data = await res.json().catch(() => ({}))

      if (res.status === 401) {
        // Automatic logout on token expiration or invalidity
        await logout()
        router.push('/login')
        throw new Error('Authentication expired. Please log in again.')
      }

      if (!res.ok) {
        throw new Error(data.error || 'Request failed')
      }

      return data
    },
    [logout, router]
  )

  return { apiFetch }
}
