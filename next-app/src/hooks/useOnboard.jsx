'use client';

// Onboard server connection for the whole app: who is signed in (demo identity), whether the onboard
// server is reachable, and the outbox loop that copies readings saved on this device to POST /api/sync.
// Everything works without the server: readings are always saved and scored on the device first.
//
// Identity: nothing is chosen until the person clicks one of the "Enter as …" doors, one per crew
// member (lib/identity.js, lib/demoAccounts.js). Sign out and switch go through lib/session.js, which ends the Supabase session
// for this browser first (scope 'local') and never touches readings saved on the device.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { browserSupabase, supabaseConfigured } from '../lib/supabaseBrowser.js';
import { DEMO_ACCOUNTS, isDemoWho } from '../lib/demoAccounts.js';
import { browserStorage, readIdentity, writeIdentity } from '../lib/identity.js';
import { endSupabaseSession, sessionMatches, signOutFlow, switchFlow } from '../lib/session.js';
import { OUTBOX_STATE_KEY, nextDueAt, syncOnce, syncStateOf } from '../lib/outbox.js';
import { RECORDS_CHANGED_EVENT, readAllStandTests, writeStandTest } from '../lib/standTestStore.js';
import { readAllVitals, writeVitalsCheckin } from '../lib/vitalsCheckinStore.js';

const HEALTH_EVERY_MS = 30_000;
const LAST_COPY_KEY = 'ahm.lastCopyToGround.v1';

const OnboardContext = createContext(null);

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: retry bookkeeping lasts for this page view only
  }
}

const allRecords = () => [...readAllVitals(), ...readAllStandTests()];

export function OnboardProvider({ children }) {
  const [ready, setReady] = useState(false); // stored identity has been read
  const [who, setWho] = useState(null); // a DEMO_ACCOUNTS key, or null (signed out)
  const account = who ? DEMO_ACCOUNTS[who] : null;
  const supabase = browserSupabase();

  // 'checking' | 'connected' | 'offline'
  const [server, setServer] = useState('checking');
  const [session, setSession] = useState(null); // { crewId, role } once signed in on the onboard server
  const [signInError, setSignInError] = useState(null);
  const [busy, setBusy] = useState(false); // signing out / switching
  const [lastCopy, setLastCopy] = useState(null);
  const [outboxState, setOutboxState] = useState({});
  const [version, setVersion] = useState(0); // bumps when saved records change
  const running = useRef(false);
  const timer = useRef(null);
  const epoch = useRef(0); // bumped on sign-out / switch: an in-flight sync must not schedule more work

  useEffect(() => {
    setWho(readIdentity(browserStorage()));
    setLastCopy(readJson(LAST_COPY_KEY, null));
    setOutboxState(readJson(OUTBOX_STATE_KEY, {}));
    setReady(true);
  }, []);

  // ---- Is the onboard server there? ----
  const checkServer = useCallback(async () => {
    if (!supabaseConfigured() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      setServer('offline');
      return false;
    }
    try {
      const res = await fetch('/api/sync', { cache: 'no-store' });
      const body = await res.json();
      const ok = Boolean(body?.configured && body?.reachable);
      setServer(ok ? 'connected' : 'offline');
      return ok;
    } catch {
      setServer('offline');
      return false;
    }
  }, []);

  useEffect(() => {
    checkServer();
    const id = setInterval(checkServer, HEALTH_EVERY_MS);
    const onNet = () => checkServer();
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
    };
  }, [checkServer]);

  // ---- Demo sign-in on the onboard server: one click, no password typed ----
  useEffect(() => {
    if (!account || busy || server !== 'connected' || !supabase) return undefined;
    if (session?.crewId === account.crewId) return undefined;
    let active = true;
    (async () => {
      try {
        // Reuse this browser's session if it belongs to this person; otherwise end it first.
        const { data } = await supabase.auth.getSession();
        if (sessionMatches(data?.session, account)) {
          if (active) {
            setSession({ crewId: account.crewId, role: account.role });
            setSignInError(null);
          }
          return;
        }
        if (data?.session) await endSupabaseSession({ supabase, storage: browserStorage() });
        const res = await fetch('/api/demo-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ who: account.who }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `Sign-in failed (${res.status})`);
        if (!active) return; // signed out or switched while this was in flight
        const { error } = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
        if (error) throw error;
        if (active) {
          setSession({ crewId: body.crew_id, role: body.role });
          setSignInError(null);
        }
      } catch (err) {
        if (active) {
          setSession(null);
          setSignInError(err.message);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [server, supabase, account, busy, session?.crewId]);

  // ---- Outbox ----
  const stopOutbox = useCallback(() => {
    epoch.current += 1;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const runSync = useCallback(async () => {
    if (running.current || !account || server !== 'connected' || !supabase || session?.crewId !== account.crewId) return;
    const myEpoch = epoch.current;
    running.current = true;
    clearTimeout(timer.current);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token || epoch.current !== myEpoch) return;
      const state = readJson(OUTBOX_STATE_KEY, {});
      const out = await syncOnce({
        records: allRecords(),
        crewId: account.crewId,
        state,
        now: Date.now(),
        send: async (readings) => {
          const res = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ readings }),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) throw new Error(body?.error ?? `Onboard server answered ${res.status}`);
          return body;
        },
      });
      // Whatever the server already stored is recorded on the device, even after a sign-out.
      for (const r of out.updated) (r.kind === 'stand_test' ? writeStandTest : writeVitalsCheckin)(r);
      writeJson(OUTBOX_STATE_KEY, out.state);
      setOutboxState(out.state);
      if (out.updated.length) {
        const newest = out.updated.map((r) => r.synced_at).sort().at(-1);
        writeJson(LAST_COPY_KEY, newest);
        setLastCopy(newest);
        setVersion((v) => v + 1);
      }
      if (out.error) checkServer();
      if (epoch.current !== myEpoch) return; // stopped: schedule nothing more
      const due = nextDueAt(allRecords(), account.crewId, out.state);
      if (due !== null) timer.current = setTimeout(() => runSync(), Math.max(1000, due - Date.now()));
    } finally {
      running.current = false;
    }
  }, [account, server, supabase, session?.crewId, checkServer]);

  useEffect(() => {
    runSync();
  }, [runSync]);

  useEffect(() => {
    const onChange = () => {
      setVersion((v) => v + 1);
      setTimeout(() => runSync(), 0);
    };
    window.addEventListener(RECORDS_CHANGED_EVENT, onChange);
    window.addEventListener('online', onChange);
    return () => {
      window.removeEventListener(RECORDS_CHANGED_EVENT, onChange);
      window.removeEventListener('online', onChange);
      clearTimeout(timer.current);
    };
  }, [runSync]);

  // ---- Enter, switch, sign out ----
  const enter = useCallback(
    async (next) => {
      if (!isDemoWho(next) || next === who || busy) return;
      setBusy(true);
      try {
        const storage = browserStorage();
        if (who) await switchFlow({ next, supabase, storage, stopOutbox });
        else writeIdentity(storage, next);
        setSession(null);
        setSignInError(null);
        setWho(next);
      } finally {
        setBusy(false);
      }
    },
    [who, busy, supabase, stopOutbox],
  );

  const signOut = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signOutFlow({ supabase, storage: browserStorage(), stopOutbox });
      setSession(null);
      setSignInError(null);
      setWho(null);
    } finally {
      setBusy(false);
    }
  }, [busy, supabase, stopOutbox]);

  const pendingCount = useMemo(
    () => (typeof window === 'undefined' ? 0 : allRecords().filter((r) => !r.synced_at).length),
    [version], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const value = useMemo(
    () => ({
      ready,
      who,
      account,
      crewId: account?.crewId ?? null,
      isCmo: account?.role === 'cmo',
      enter,
      signOut,
      busy,
      server,
      connected: server === 'connected',
      signedIn: Boolean(account && session?.crewId === account.crewId),
      signInError,
      supabase,
      lastCopy,
      version,
      pendingCount,
      syncState: (record) => syncStateOf(record, outboxState),
    }),
    [ready, who, account, enter, signOut, busy, server, session?.crewId, signInError, supabase, lastCopy, version, pendingCount, outboxState],
  );

  return <OnboardContext.Provider value={value}>{children}</OnboardContext.Provider>;
}

export function useOnboard() {
  const ctx = useContext(OnboardContext);
  if (!ctx) throw new Error('useOnboard must be used inside <OnboardProvider>.');
  return ctx;
}
