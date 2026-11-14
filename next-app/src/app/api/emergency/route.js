import { serverConfigured, serviceClient } from '../../../lib/supabaseServer.js';
import { authorize } from '../../../lib/syncCore.js';
import { MAX_POST_EMERGENCIES, processEmergencies } from '../../../lib/emergency.js';
import { crewRoster } from '../../../mocks/crew.js';

export const dynamic = 'force-dynamic';

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

const COLUMNS = 'id, patient_crew_id, reporter_crew_id, reporter_name, flow, environment, drill, started_at, ended_at, events, revision, updated_at';

/**
 * POST /api/emergency   Authorization: Bearer <access token>
 * Body: { emergencies: [{ id, patient_crew_id, reporter: { crew_id, name }, flow, environment, started_at,
 *         ended_at, drill, events: [{ id, at, type, detail? }] }] }
 * -> { results: [{ id, code, result: 'stored'|'rejected', error?, emergency? }] }
 * Any signed-in crew member may report an emergency for any crew id, as themselves (the server rebuilds
 * `reporter` from the session). The reporter or the Crew Medical Officer (role from crew_members) may add
 * events and end it. Writes use the service role; clients only read emergency_events, through RLS.
 */
export async function POST(request) {
  if (!serverConfigured()) return json({ error: 'Onboard server offline: kept on this device', configured: false }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be JSON.' }, 400);
  }
  const emergencies = body?.emergencies;
  if (!Array.isArray(emergencies)) return json({ error: 'Send { emergencies: [...] }.' }, 400);
  if (emergencies.length > MAX_POST_EMERGENCIES) return json({ error: `Send at most ${MAX_POST_EMERGENCIES} emergencies at a time.` }, 400);

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

    const out = await processEmergencies({
      emergencies,
      crewId: who.crewId,
      role: who.role,
      name: who.name,
      knownCrew: crewRoster.map((c) => c.id),
      db: {
        async find(id) {
          const { data, error } = await db.from('emergency_events').select(COLUMNS).eq('id', id).maybeSingle();
          if (error) throw error;
          return data ?? null;
        },
        async insert(row) {
          // Same id inserted by another request first: false, and the caller merges into that row.
          const { data, error } = await db.from('emergency_events').upsert(row, { onConflict: 'id', ignoreDuplicates: true }).select('id');
          if (error) throw error;
          return (data ?? []).length === 1;
        },
        async update(row, prevRevision) {
          // Compare-and-set: only if nobody changed the row since it was read.
          const { id, ...rest } = row;
          const { data, error } = await db.from('emergency_events').update(rest).eq('id', id).eq('revision', prevRevision).select('id');
          if (error) throw error;
          return (data ?? []).length === 1;
        },
      },
    });
    return json(out);
  } catch (err) {
    return json({ error: `Onboard server could not store the emergency: ${err?.message ?? 'unknown error'}` }, 503);
  }
}
