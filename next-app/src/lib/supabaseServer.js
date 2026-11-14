// SERVER ONLY. The one file allowed to read SUPABASE_SERVICE_ROLE_KEY.
// lib/serverSecrets.test.js fails the test run (and `npm run build`, through prebuild) if any client
// component can reach this file, or if the key is read anywhere else.
//
// Env (set in .env.local and in Vercel; this code never writes them):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY   (public, also used in the browser)
//   SUPABASE_SERVICE_ROLE_KEY                                 (secret, server only)
//   DEMO_ACCOUNT_PASSWORD                                     (secret, server only)

import { createClient } from '@supabase/supabase-js';

if (typeof window !== 'undefined') {
  throw new Error('lib/supabaseServer.js was loaded in the browser. It holds the service-role key and is server only.');
}

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Sync and demo sign-in need all three; without them the app runs on this device only. */
export const serverConfigured = () => Boolean(url() && anonKey() && serviceKey());

export const demoPassword = () => process.env.DEMO_ACCOUNT_PASSWORD || null;

/** Bypasses RLS. Use only after checking who is asking. */
export function serviceClient() {
  return createClient(url(), serviceKey(), NO_SESSION);
}

/** Acts as an ordinary client (RLS applies); used to sign the demo accounts in. */
export function anonClient() {
  return createClient(url(), anonKey(), NO_SESSION);
}
