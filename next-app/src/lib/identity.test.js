// Signed-out state, sign-out, switch, and who sees which tabs. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDENTITY_KEY, SUPABASE_AUTH_KEY, readIdentity, writeIdentity } from './identity.js';
import { endSupabaseSession, sessionMatches, signOutFlow, switchFlow } from './session.js';
import { canOpen, screenFor, tabsFor } from './appScreens.js';
import { DEMO_ACCOUNTS } from './demoAccounts.js';

/** localStorage stand-in. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/** Supabase client stand-in that records calls and keeps a "session" in storage like the real one. */
function fakeSupabase(storage, { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      async signOut(opts) {
        calls.push(['signOut', opts]);
        if (fail) return { error: new Error('Failed to fetch') };
        storage.removeItem(SUPABASE_AUTH_KEY);
        return { error: null };
      },
    },
  };
}

const READINGS = { 'ahm.dailyVitals.v1': '[{"id":"r1","synced_at":null}]', 'ahm.standTests.v1': '[{"id":"s1"}]' };

test('first load with nothing stored: no identity, so the landing screen shows', () => {
  const storage = memoryStorage();
  const who = readIdentity(storage);
  assert.equal(who, null);
  assert.equal(screenFor({ ready: true, who }), 'landing');
  assert.equal(screenFor({ ready: false, who }), 'loading', 'nothing flashes before storage is read');
  assert.deepEqual(tabsFor(null), []);
});

test('a stored identity opens the app; junk in storage is treated as signed out', () => {
  assert.equal(screenFor({ ready: true, who: readIdentity(memoryStorage({ [IDENTITY_KEY]: '"maya"' })) }), 'app');
  assert.equal(readIdentity(memoryStorage({ [IDENTITY_KEY]: '"tomas"' })), 'tomas', 'every crew member is a valid identity');
  assert.equal(readIdentity(memoryStorage({ [IDENTITY_KEY]: '"nobody"' })), null);
  assert.equal(readIdentity(memoryStorage({ [IDENTITY_KEY]: 'not json' })), null);
  const blocked = { getItem: () => { throw new Error('SecurityError'); } };
  assert.equal(readIdentity(blocked), null);
});

test('sign-out clears the identity and the Supabase session (scope local), stops the outbox, keeps readings', async () => {
  const storage = memoryStorage({ [IDENTITY_KEY]: '"maya"', [SUPABASE_AUTH_KEY]: '{"access_token":"t"}', ...READINGS });
  const supabase = fakeSupabase(storage);
  const order = [];
  const stopOutbox = () => order.push('stopOutbox');
  supabase.auth.signOut = ((orig) => async (opts) => {
    order.push('signOut');
    return orig(opts);
  })(supabase.auth.signOut);

  await signOutFlow({ supabase, storage, stopOutbox });

  assert.deepEqual(order, ['stopOutbox', 'signOut']);
  assert.deepEqual(supabase.calls, [['signOut', { scope: 'local' }]]);
  assert.equal(readIdentity(storage), null);
  assert.equal(storage.getItem(SUPABASE_AUTH_KEY), null);
  assert.equal(screenFor({ ready: true, who: readIdentity(storage) }), 'landing');
  for (const [k, v] of Object.entries(READINGS)) assert.equal(storage.getItem(k), v, `${k} must stay on the device`);
});

test('sign-out still clears the session on this device when the server cannot be reached', async () => {
  const storage = memoryStorage({ [IDENTITY_KEY]: '"lena"', [SUPABASE_AUTH_KEY]: '{"access_token":"t"}' });
  const { error } = await signOutFlow({ supabase: fakeSupabase(storage, { fail: true }), storage });
  assert.ok(error);
  assert.equal(storage.getItem(SUPABASE_AUTH_KEY), null);
  assert.equal(readIdentity(storage), null);
  const throwing = { auth: { signOut: async () => { throw new Error('boom'); } } };
  storage.setItem(SUPABASE_AUTH_KEY, 'x');
  await endSupabaseSession({ supabase: throwing, storage });
  assert.equal(storage.getItem(SUPABASE_AUTH_KEY), null);
});

test('sign-out without Supabase configured (offline demo) just forgets the identity', async () => {
  const storage = memoryStorage({ [IDENTITY_KEY]: '"maya"', ...READINGS });
  await signOutFlow({ supabase: null, storage });
  assert.equal(readIdentity(storage), null);
  assert.equal(storage.getItem('ahm.dailyVitals.v1'), READINGS['ahm.dailyVitals.v1']);
});

test('switching person signs out the previous Supabase session before storing the new identity', async () => {
  const storage = memoryStorage({ [IDENTITY_KEY]: '"maya"', [SUPABASE_AUTH_KEY]: '{"user":"maya"}' });
  const order = [];
  const supabase = {
    auth: {
      signOut: async (opts) => {
        order.push(['signOut', opts.scope, readIdentity(storage)]);
        storage.removeItem(SUPABASE_AUTH_KEY);
        return { error: null };
      },
    },
  };
  await switchFlow({ next: 'lena', supabase, storage, stopOutbox: () => order.push(['stopOutbox']) });
  assert.deepEqual(order, [['stopOutbox'], ['signOut', 'local', 'maya']], 'Maya’s session ended while Maya was still the identity');
  assert.equal(readIdentity(storage), 'lena');
  assert.equal(storage.getItem(SUPABASE_AUTH_KEY), null);
  assert.throws(() => writeIdentity(storage, 'nobody'));
});

test('a stored Supabase session is reused only for the matching demo account', () => {
  const maya = { user: { email: DEMO_ACCOUNTS.maya.email } };
  assert.equal(sessionMatches(maya, DEMO_ACCOUNTS.maya), true);
  assert.equal(sessionMatches(maya, DEMO_ACCOUNTS.lena), false);
  assert.equal(sessionMatches(null, DEMO_ACCOUNTS.maya), false);
});

test('Maya never sees the CMO tab; Lena sees her personal tabs plus the CMO tab', () => {
  const maya = tabsFor(DEMO_ACCOUNTS.maya).map((t) => t.id);
  const lena = tabsFor(DEMO_ACCOUNTS.lena).map((t) => t.id);
  assert.equal(maya.includes('cmo'), false);
  assert.equal(canOpen(DEMO_ACCOUNTS.maya, 'cmo'), false);
  assert.deepEqual(lena, [...maya.slice(0, -1), 'cmo', maya.at(-1)]);
  assert.equal(canOpen(DEMO_ACCOUNTS.lena, 'cmo'), true);
  for (const id of ['dashboard', 'standtest', 'checkin']) {
    assert.equal(canOpen(DEMO_ACCOUNTS.maya, id), true);
    assert.equal(canOpen(DEMO_ACCOUNTS.lena, id), true);
  }
});
