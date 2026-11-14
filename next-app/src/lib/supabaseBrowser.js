'use client';

// Browser Supabase client: public URL and anon key only. Reads go through RLS; the browser never writes
// (all writes go through POST /api/sync). Returns null when the project is not configured, and the app
// then runs on this device only.

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_AUTH_KEY } from './identity.js';

// Next.js inlines NEXT_PUBLIC_* at build time, so these must be literal property reads.
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client;

export function browserSupabase() {
  if (client !== undefined) return client;
  client = URL_ && ANON && typeof window !== 'undefined'
    ? createClient(URL_, ANON, { auth: { persistSession: true, autoRefreshToken: true, storageKey: SUPABASE_AUTH_KEY } })
    : null;
  return client;
}

export const supabaseConfigured = () => Boolean(URL_ && ANON);
