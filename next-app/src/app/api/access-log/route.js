import { serverConfigured, serviceClient } from '../../../lib/supabaseServer.js';
import { authorize } from '../../../lib/syncCore.js';
import { MAX_POST_ENTRIES, processAccess } from '../../../lib/accessLog.js';

export const dynamic = 'force-dynamic';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * POST /api/access-log   Authorization: Bearer <access token>
 * Body: { entries: [{ id, viewer, patient, at }] }
 * -> { results: [{ id, code, result: 'stored'|'rejected', error? }] }
 * Only the Crew Medical Officer (role from crew_members) may log, as themselves, views of other crew.
 * Writes use the service role; clients only read access_log, through RLS.
 */
export async function POST(request) {
  if (!serverConfigured()) return json({ error: 'Onboard server offline: kept on this device', configured: false }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }
  const entries = body?.entries;
  if (!Array.isArray(entries)) return json({ error: 'Send { entries: [...] }.' }, 400);
  if (entries.length > MAX_POST_ENTRIES) return json({ error: `Send at most ${MAX_POST_ENTRIES} entries at a time.` }, 400);

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  try {
    const db = serviceClient();
    const who = await authorize({
      token,
      getUser: async (t) => {
        const { data, error } = await db.auth.getUser(t);
        return error ? null : data.user;
      },
      crewForUser: async (userId) => {
        const { data, error } = await db.from('crew_members').select('id, role, name').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        return data ? { id: data.id, role: data.role, name: data.name } : null;
      },
    });
    if (who.status !== 200) return json({ error: who.error }, who.status);

    const out = await processAccess({
      entries,
      crewId: who.crewId,
      role: who.role,
      db: {
        async insertAccess(row) {
          // A retried entry keeps its id: ON CONFLICT (id) DO NOTHING.
          const { error } = await db.from('access_log').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
          if (error) throw error;
        },
      },
    });
    return json(out);
  } catch (err) {
    return json({ error: `Onboard server could not store the access log: ${err?.message ?? 'unknown error'}` }, 503);
  }
}
