import { anonClient, demoPassword, serverConfigured, serviceClient } from '../../../lib/supabaseServer.js';
import { DEMO_ACCOUNTS, DEMO_ACCOUNT_LIST, isDemoWho } from '../../../lib/demoAccounts.js';

export const dynamic = 'force-dynamic';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Make sure the demo auth user exists with the server's password, and return its id. */
async function ensureUser(admin, email, password) {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!created.error) return created.data.user.id;
  // Already registered: find it and reset its password to the configured one.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      const upd = await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
      if (upd.error) throw upd.error;
      return found.id;
    }
    if (data.users.length < 200) break;
  }
  throw created.error;
}

/**
 * POST /api/demo-session   { who }   who: a key of DEMO_ACCOUNTS, one per crew member in crew.json
 * Signs into a demo account so judges never sign up or type a password.
 * The password stays on the server (DEMO_ACCOUNT_PASSWORD). The first use creates the auth user and
 * links it to its crew member, for any of the crew; the crew_members rows come from supabase/seed.sql.
 * -> { access_token, refresh_token, expires_at, crew_id, role }
 */
export async function POST(request) {
  let body = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!isDemoWho(body?.who)) {
    return json({ error: `who must be one of: ${DEMO_ACCOUNT_LIST.map((a) => `"${a.who}"`).join(', ')}.` }, 400);
  }
  const password = demoPassword();
  if (!serverConfigured() || !password) {
    return json({ configured: false, error: 'Onboard server offline: saved on this device' }, 503);
  }

  const account = DEMO_ACCOUNTS[body.who];
  try {
    const anon = anonClient();
    let signIn = await anon.auth.signInWithPassword({ email: account.email, password });
    const admin = serviceClient();
    let userId = signIn.data?.user?.id ?? null;
    if (signIn.error) {
      userId = await ensureUser(admin, account.email, password);
      signIn = await anon.auth.signInWithPassword({ email: account.email, password });
      if (signIn.error) throw signIn.error;
    }

    // Link the login to its crew member (crew_members is not append-only; only readings are).
    const { data: member, error: memberError } = await admin
      .from('crew_members')
      .select('id, role, user_id')
      .eq('id', account.crewId)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!member) return json({ error: `Crew member ${account.crewId} is not in the database. Run supabase/seed.sql.` }, 503);
    if (member.user_id !== userId) {
      const { error } = await admin.from('crew_members').update({ user_id: userId }).eq('id', account.crewId);
      if (error) throw error;
    }

    const { session } = signIn.data;
    return json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      crew_id: member.id,
      role: member.role,
    });
  } catch (err) {
    return json({ error: `Demo sign-in failed: ${err?.message ?? 'unknown error'}` }, 503);
  }
}
