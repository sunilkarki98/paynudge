/**
 * Centralized API Client
 *
 * This utility ensures all requests are correctly prefixed with NEXT_PUBLIC_API_URL
 * and handles authentication headers and error responses consistently.
 */

import { supabase } from './supabase'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export interface ApiRequestOptions extends RequestInit {
  params?: Record<string, string>
}

class ApiError extends Error {
  status: number
  data: any

  constructor(message: string, status: number, data: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { params, ...fetchOptions } = options

  // 1. Build URL
  let url = path.startsWith('http') ? path : `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`

  // Add query parameters if any
  if (params) {
    const searchParams = new URLSearchParams(params)
    url += `?${searchParams.toString()}`
  }

  // 2. Get active session for auth header
  const { data: { session } } = await supabase.auth.getSession()

  // 3. Merge Headers
  const headers = new Headers(fetchOptions.headers)
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (session?.access_token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  // 4. Perform Fetch
  const response = await fetch(url, {
    ...fetchOptions,
    headers,
  })

  // 5. Handle Response
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new ApiError(data.error || 'Request failed', response.status, data)
  }

  return data as T
}

export const api = {
  request,
  get: <T>(path: string, options?: ApiRequestOptions) => 
    request<T>(path, { ...options, method: 'GET' }),
    
  post: <T>(path: string, body?: any, options?: ApiRequestOptions) => 
    request<T>(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
    
  put: <T>(path: string, body?: any, options?: ApiRequestOptions) => 
    request<T>(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
    
  patch: <T>(path: string, body?: any, options?: ApiRequestOptions) => 
    request<T>(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
    
  delete: <T>(path: string, options?: ApiRequestOptions) => 
    request<T>(path, { ...options, method: 'DELETE' }),
}
