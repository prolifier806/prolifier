import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "implicit",
    storageKey: "prolifier_auth_v1",
    // Replace the default Web Locks implementation with a simple pass-through.
    // The default lock waits up to 5000ms before force-acquiring, causing a
    // noticeable freeze every time a new tab initializes while another tab
    // holds the lock. Token refresh races are handled gracefully by Supabase
    // server-side (duplicate refresh tokens are idempotent), so the lock
    // provides no meaningful protection here.
    lock: (_name, _timeout, fn) => fn(),
  },
})
