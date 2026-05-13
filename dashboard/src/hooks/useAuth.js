/**
 * useAuth — Persistent Supabase auth hook
 *
 * Handles session persistence, auto-refresh, and OAuth flows.
 * Session is automatically restored from localStorage on page load.
 */

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/api'

export const useAuth = () => {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true

    // Restore session from localStorage (Supabase handles this automatically)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return
      if (error) {
        setError(error)
        console.error('[useAuth] getSession error:', error)
      }
      setSession(session)
      setUser(session?.user || null)
      setLoading(false)
    })

    // Subscribe to auth state changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      console.log('[useAuth] event:', event, 'user:', session?.user?.email)
      setSession(session)
      setUser(session?.user || null)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) {
      setError(error)
      setLoading(false)
    }
  }, [])

  const signInWithEmail = useCallback(async (email, password) => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      setError(error)
    }
    setLoading(false)
    return { data, error }
  }, [])

  const signUpWithEmail = useCallback(async (email, password) => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) {
      setError(error)
    }
    setLoading(false)
    return { data, error }
  }, [])

  const signOut = useCallback(async () => {
    setLoading(true)
    const { error } = await supabase.auth.signOut()
    if (error) setError(error)
    setUser(null)
    setSession(null)
    setLoading(false)
  }, [])

  return {
    user,
    session,
    loading,
    error,
    isAuthenticated: !!user,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  }
}
