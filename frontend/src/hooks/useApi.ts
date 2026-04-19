'use client'

import { useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export function useApi() {
  const { logout } = useAuth()
  const router = useRouter()

  const apiFetch = useCallback(
    async (url: string, options: any = {}) => {
      try {
        const { method = 'GET', body, ...rest } = options

        // Map methods to our central api utility
        let res: any
        if (method === 'GET') res = await api.get(url, rest)
        else if (method === 'POST') res = await api.post(url, body, rest)
        else if (method === 'PUT') res = await api.put(url, body, rest)
        else if (method === 'PATCH') res = await api.patch(url, body, rest)
        else if (method === 'DELETE') res = await api.delete(url, rest)
        else throw new Error(`Unsupported method: ${method}`)

        return res
      } catch (error: any) {
        // If it's a 401 Unauthorized, log the user out
        if (error.status === 401) {
          await logout()
          router.push('/login')
          throw new Error('Authentication expired. Please log in again.')
        }
        throw error
      }
    },
    [logout, router]
  )

  return { apiFetch }
}
