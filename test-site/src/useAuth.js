import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabaseClient'

export function useAuth() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = signed out
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return }
    setProfileLoading(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, callsign, email, credits, games_attended, waiver_signed, waiver_year, vip_status, join_date, role')
        .eq('id', userId)
        .single()
      if (error) throw error
      setProfile(data)
    } catch {
      setProfile(null)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setSession(session)
      if (session?.user?.id) loadProfile(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user?.id) loadProfile(session.user.id)
      else setProfile(null)
    })
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [loadProfile])

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw error
  }

  const signUp = async (email, password) => {
    const { error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) throw error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return {
    session,
    user: session?.user || null,
    profile,
    profileLoading,
    loading: session === undefined,
    signIn,
    signUp,
    signOut,
  }
}
