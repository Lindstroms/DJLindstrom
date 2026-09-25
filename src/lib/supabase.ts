import { createClient } from '@supabase/supabase-js'

// Offentlig (publishable) nøgle – må gerne ligge i koden; databasen er beskyttet af Row Level Security.
// Kan overskrives med VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, fx til et testprojekt.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://vubxctebuwiftamiskxs.supabase.co'
const key =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? 'sb_publishable_AaYUzM6M035NQ7z1n-82UQ_PCJ31mFp'

// Sæt VITE_DEMO=true for at køre med eksempeldata uden database.
export const isDemo = import.meta.env.VITE_DEMO === 'true'

export const supabase = isDemo ? null : createClient(url, key)
