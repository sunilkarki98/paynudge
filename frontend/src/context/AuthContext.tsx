'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

interface User {
  id: string
  email: string
  name: string | null
  emailVerified?: boolean
  subscriptionTier?: 'FREE' | 'PRO'
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let initialSessionHandled = false

    // Fetch subscription details from backend
    const fetchSubscription = async (token: string, baseUser: any) => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/billing/subscription`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setUser({ ...baseUser, subscriptionTier: data.tier })
        } else {
          setUser(baseUser)
        }
      } catch (err) {
        setUser(baseUser)
      }
    }

    // Check active session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const baseUser = {
          id: session.user.id,
          email: session.user.email!,
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || null,
          emailVerified: !!session.user.email_confirmed_at,
        }
        await fetchSubscription(session.access_token, baseUser)
      }
      initialSessionHandled = true
      setIsLoading(false)
    })

    // Listen for auth changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Skip if the initial session hasn't been handled yet — getSession handles it
      if (!initialSessionHandled) return

      if (session?.user) {
        const baseUser = {
          id: session.user.id,
          email: session.user.email!,
          name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || null,
          emailVerified: !!session.user.email_confirmed_at,
        }
        fetchSubscription(session.access_token, baseUser)
      } else {
        setUser(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // #region agent log
    if (error) {
      fetch('http://127.0.0.1:7359/ingest/3b0c2916-fdb5-45b8-9836-ac0638fd59ae', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '964b3b' },
        body: JSON.stringify({
          sessionId: '964b3b',
          runId: 'auth-client',
          hypothesisId: 'H-client-password',
          location: 'frontend/src/context/AuthContext.tsx:login',
          message: 'signInWithPassword error',
          data: { code: error.code, message: error.message },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
    }
    // #endregion
    if (error) throw new Error(error.message)
  }, [])

  const register = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
        }
      }
    })
    // #region agent log
    if (error) {
      fetch('http://127.0.0.1:7359/ingest/3b0c2916-fdb5-45b8-9836-ac0638fd59ae', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '964b3b' },
        body: JSON.stringify({
          sessionId: '964b3b',
          runId: 'auth-client',
          hypothesisId: 'H-client-signup',
          location: 'frontend/src/context/AuthContext.tsx:register',
          message: 'signUp error',
          data: { code: error.code, message: error.message },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
    }
    // #endregion
    if (error) throw new Error(error.message)
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      }
    })
    // #region agent log
    if (error) {
      fetch('http://127.0.0.1:7359/ingest/3b0c2916-fdb5-45b8-9836-ac0638fd59ae', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '964b3b' },
        body: JSON.stringify({
          sessionId: '964b3b',
          runId: 'auth-client',
          hypothesisId: 'H-client-oauth-start',
          location: 'frontend/src/context/AuthContext.tsx:signInWithGoogle',
          message: 'signInWithOAuth error (before redirect)',
          data: { code: error.code, message: error.message },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
    }
    // #endregion
    if (error) throw new Error(error.message)
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
