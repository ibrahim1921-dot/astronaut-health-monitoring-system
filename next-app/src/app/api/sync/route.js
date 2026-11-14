import { serverConfigured, serviceClient } from '../../../lib/supabaseServer.js';
import { MAX_SYNC_BATCH, authorize, processBatch } from '../../../lib/syncCore.js';
import { getPreflightTests } from '../../../lib/standTestsData.js';

export const dynamic = 'force-dynamic';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const OFFLINE = 'Onboard server offline: saved on this device';

/**
 * GET /api/sync -> { configured, reachable }   for the header's "Onboard server" status.
 */
export async function GET() {
  if (!serverConfigured()) return json({ configured: false, reachable: false, message: OFFLINE });
  try {
    const { error } = await serviceClient().from('crew_members').select('id', { head: true, count: 'exact' });
    if (error) throw error;
    return json({ configured: true, reachable: true });
  } catch {
    return json({ configured: true, reachable: false, message: OFFLINE });
  }
}

/** The database, as lib/syncCore.js expects it. Writes use the service role (clients cannot write). */
function supabaseDb(db) {
  return {
    async findByIds(ids) {
      const { data, error } = await db.from('readings').select('*').in('id', ids);
      if (error) throw error;
      return data;
    },
    async dailyRows(crewId) {
      const { data, error } = await db
        .from('readings')
        .select('id, crew_id, recorded_at, payload')
        .eq('crew_id', crewId)
        .eq('kind', 'daily_vitals')
        .order('recorded_at', { ascending: true })
        .range(0, 9999);
      if (error) throw error;
      return data;
    },
    async insert(row) {
      // ON CONFLICT (id) DO NOTHING: a retried sync never duplicates and never updates.
      const { data, error } = await db.from('readings').upsert(row, { onConflict: 'id', ignoreDuplicates: true }).select();
      if (error) throw error;
      return data?.[0] ?? null;
    },
  };
}

/**
 * POST /api/sync   Authorization: Bearer <access token>
 * Body: { readings: [{ id, crew_id, kind, recorded_at, payload, device_result? }] }
 * -> { results: [{ id, code, result: 'stored'|'already_stored'|'rejected'|'error', status, reasons,
 *                  engine_version, synced_at, server_differs, device_status, official, error? }] }
 * Per-reading codes: 201 stored, 200 already stored, 400 invalid, 403 not your reading.
 * A reading for another crew_id is accepted only as a CMO exam: the signed-in user's crew_members role is
 * 'cmo', payload.entered_by.crew_id is that user, and payload.kind_detail is 'cmo_exam' (lib/syncCore.js checkAuthor).
 */
export async function POST(request) {
  if (!serverConfigured()) return json({ error: OFFLINE, configured: false }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }
  const readings = body?.readings;
  if (!Array.isArray(readings)) return json({ error: 'Send { readings: [...] }.' }, 400);
  if (readings.length > MAX_SYNC_BATCH) return json({ error: `Send at most ${MAX_SYNC_BATCH} readings at a time.` }, 400);

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
        // The role (and so the right to record an exam for someone else) comes from the database only.
        const { data, error } = await db.from('crew_members').select('id, role, name').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        return data ? { id: data.id, role: data.role, name: data.name } : null;
      },
    });
    if (who.status !== 200) return json({ error: who.error }, who.status);

    const out = await processBatch({
      readings,
      crewId: who.crewId,
      role: who.role,
      name: who.name,
      db: supabaseDb(db),
      preflightFor: getPreflightTests,
    });
    return json({ crew_id: who.crewId, ...out });
  } catch (err) {
    return json({ error: `Onboard server could not store readings: ${err?.message ?? 'unknown error'}` }, 503);
  }
}
