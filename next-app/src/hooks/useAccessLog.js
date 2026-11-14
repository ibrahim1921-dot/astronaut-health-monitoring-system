'use client';

// Access log for the whole app (lib/accessLog.js): the CMO's views of other crew members' dashboards.
// Saved on this device first, then copied to the onboard server (POST /api/access-log) when connected.
// A failed copy stays unsynced and is retried on the next open or reconnect. Server rows (RLS: the CMO
// reads all, crew read their own) are merged in when connected; if the access_log migration has not
// been run yet, only this device's entries are shown.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnboard } from './useOnboard.jsx';
import { browserStorage } from '../lib/identity.js';
import { newRecordId } from '../lib/standTestStore.js';
import { addAccess, markSynced, mergeLog, readLog, unsyncedEntries, writeLog } from '../lib/accessLog.js';

const PERMANENT = new Set([400, 403]);

export function useAccessLog() {
  const { supabase, connected, signedIn, crewId, isCmo } = useOnboard();
  const [local, setLocal] = useState([]);
  const [server, setServer] = useState([]);
  const sending = useRef(false);
  const online = Boolean(connected && signedIn && supabase);

  useEffect(() => {
    setLocal(readLog(browserStorage()));
  }, []);

  const loadServer = useCallback(async () => {
    if (!online) return;
    try {
      const { data, error } = await supabase.from('access_log').select('id, viewer, patient, at').order('at', { ascending: false }).limit(50);
      if (!error) setServer(data ?? []);
    } catch {
      // table missing or offline: the device copy is still shown
    }
  }, [online, supabase]);

  const flush = useCallback(async () => {
    if (!online || !isCmo || sending.current) return;
    const storage = browserStorage();
    const pending = unsyncedEntries(readLog(storage)).filter((e) => e.viewer === crewId);
    if (!pending.length) return;
    sending.current = true;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/access-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entries: pending.map(({ id, viewer, patient, at }) => ({ id, viewer, patient, at })) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) return; // kept on this device; tried again next time
      // Stored, or refused for good (it would never be accepted): either way stop sending it.
      const done = (body?.results ?? []).filter((r) => r.result === 'stored' || PERMANENT.has(r.code)).map((r) => r.id);
      const next = markSynced(readLog(storage), done);
      writeLog(storage, next);
      setLocal(next);
      loadServer();
    } catch {
      // network error: kept on this device
    } finally {
      sending.current = false;
    }
  }, [online, isCmo, crewId, supabase, loadServer]);

  useEffect(() => {
    loadServer();
    flush();
  }, [loadServer, flush]);

  /** The CMO opened another crew member's dashboard. Throttled: one entry per patient every 10 minutes. */
  const logView = useCallback(
    (patient) => {
      if (!isCmo || !crewId || !patient || patient === crewId) return;
      const storage = browserStorage();
      const { list, added } = addAccess(readLog(storage), { id: newRecordId(), viewer: crewId, patient, at: new Date().toISOString() });
      if (added) {
        writeLog(storage, list);
        setLocal(list);
      }
      flush();
    },
    [isCmo, crewId, flush],
  );

  return { entries: mergeLog(server, local), logView };
}
