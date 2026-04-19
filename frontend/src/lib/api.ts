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
  body?: any
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
  const { params, body, ...fetchOptions } = options

  // 1. Ensure path starts with /api if it doesn't already and isn't a full URL
  let adjustedPath = path
  if (!path.startsWith('http')) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    if (!cleanPath.startsWith('/api')) {
      adjustedPath = `/api${cleanPath}`
    } else {
      adjustedPath = cleanPath
    }
  }

  // 2. Build URL
  // Use a simple concatenation, ensuring no double slashes except after protocol
  const url = adjustedPath.startsWith('http') 
    ? adjustedPath 
    : `${BASE_URL}${adjustedPath}`

  // Add query parameters if any
  let finalUrl = url
  if (params) {
    const searchParams = new URLSearchParams(params)
    finalUrl += `?${searchParams.toString()}`
  }

  // 3. Get active session for auth header
  const { data: { session } } = await supabase.auth.getSession()

  // 4. Merge Headers
  const headers = new Headers(fetchOptions.headers)
  
  // Only set Content-Type if we aren't sending FormData (browser handles boundary)
  const isFormData = body instanceof FormData
  if (!headers.has('Content-Type') && !isFormData) {
    headers.set('Content-Type', 'application/json')
  }

  if (session?.access_token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  // 5. Smart Body Serialization
  let serializedBody = body
  if (body && !isFormData && typeof body !== 'string') {
    serializedBody = JSON.stringify(body)
  }

  // 6. Perform Fetch
  const response = await fetch(finalUrl, {
    ...fetchOptions,
    body: serializedBody,
    headers,
  })

  // 7. Handle Response
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
    request<T>(path, { ...options, method: 'POST', body }),
    
  put: <T>(path: string, body?: any, options?: ApiRequestOptions) => 
    request<T>(path, { ...options, method: 'PUT', body }),
    
  patch: <T>(path: string, body?: any, options?: ApiRequestOptions) => 
    request<T>(path, { ...options, method: 'PATCH', body }),
    
  delete: <T>(path: string, options?: ApiRequestOptions) => 
    request<T>(path, { ...options, method: 'DELETE' }),
}
