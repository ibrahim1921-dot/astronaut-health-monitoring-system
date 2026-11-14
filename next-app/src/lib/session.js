// Sign out and switch person. Pure flows with everything injected (storage, Supabase client, the
// outbox's stop function), so node:test can check the order of steps.
//
// Supabase sign-out uses scope 'local': only this browser's session ends. The demo accounts are shared
// by every judge, and the default ('global') would sign all of them out at once.
// Readings saved on this device are never touched: they stay on the device (and in the outbox).

import { SUPABASE_AUTH_KEY, clearIdentity, writeIdentity } from './identity.js';

export const SIGN_OUT_SCOPE = 'local';

/** End this browser's Supabase session. Never throws; works offline. */
export async function endSupabaseSession({ supabase, storage }) {
  if (!supabase) return { error: null };
  try {
    const { error } = (await supabase.auth.signOut({ scope: SIGN_OUT_SCOPE })) ?? {};
    // Server-side revoke can fail offline; the local session must still be gone.
    if (error) storage?.removeItem(SUPABASE_AUTH_KEY);
    return { error: error ?? null };
  } catch (err) {
    try {
      storage?.removeItem(SUPABASE_AUTH_KEY);
    } catch {
      // blocked storage
    }
    return { error: err };
  }
}

/** "Sign out": stop the outbox, end the Supabase session, forget the identity → landing screen. */
export async function signOutFlow({ supabase, storage, stopOutbox }) {
  stopOutbox?.();
  const result = await endSupabaseSession({ supabase, storage });
  clearIdentity(storage);
  return result;
}

/** "Switch to …": the previous person's session ends first, then the new identity is stored. */
export async function switchFlow({ next, supabase, storage, stopOutbox }) {
  stopOutbox?.();
  const result = await endSupabaseSession({ supabase, storage });
  writeIdentity(storage, next);
  return result;
}

/**
 * On load: may the stored Supabase session be reused for this person? Only when it belongs to the
 * selected demo account; anything else is signed out before a new demo session is requested.
 */
export function sessionMatches(session, account) {
  const email = session?.user?.email?.toLowerCase();
  return Boolean(email && account && email === account.email.toLowerCase());
}
