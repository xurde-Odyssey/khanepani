import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabaseConfigError =
  !supabaseUrl || !supabaseAnonKey
    ? 'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
    : null

if (supabaseConfigError) {
  // eslint-disable-next-line no-console
  console.error(supabaseConfigError)
}

export const supabase = createClient<Database>(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'missing-supabase-anon-key'
)
