import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import Login from './Login'

// Viser login, indtil Viktor er logget ind
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (!supabase) return <p className="text-zinc-400">Kræver forbindelse til databasen.</p>
  if (session === undefined) return <p className="text-zinc-400">Indlæser …</p>
  if (!session) return <Login />
  return <>{children}</>
}
