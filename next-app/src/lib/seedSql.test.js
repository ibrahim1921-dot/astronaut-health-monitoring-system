// supabase/seed.sql and supabase/reset_demo.sql match src/data/crew.json and standtests.json. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildResetSql, buildSeedSql, seedUuid } from './seedSql.js';
import { crewFile, standFile } from './testSupport.js';

const seedSql = readFileSync(new URL('../../supabase/seed.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const resetSql = readFileSync(new URL('../../supabase/reset_demo.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const unq = (s) => s.replace(/''/g, "'");
const STR = "'((?:[^']|'')*)'";

/** Rows of one INSERT … VALUES block, parsed back from the SQL text. */
function rowsOf(sql, table) {
  const start = sql.indexOf(`insert into public.${table} `);
  assert.ok(start >= 0, `no insert into ${table}`);
  const block = sql.slice(start, sql.indexOf('\non conflict', start));
  return block.split('\n').filter((l) => l.startsWith('  ('));
}

const readings = rowsOf(seedSql, 'readings').map((line) => {
  const m = line.match(new RegExp(`^  \\(${STR}, ${STR}, ${STR}, ${STR}, ${STR}::jsonb, ${STR}, ${STR}::jsonb, ${STR}\\),?$`));
  assert.ok(m, `unparsed reading row: ${line.slice(0, 120)}`);
  return {
    id: m[1],
    crew_id: m[2],
    kind: m[3],
    recorded_at: m[4],
    payload: JSON.parse(unq(m[5])),
    status: m[6],
    reasons: JSON.parse(unq(m[7])),
    engine_version: m[8],
  };
});

test('committed seed.sql and reset_demo.sql are up to date (run `npm run seed:build` if this fails)', () => {
  assert.equal(seedSql, buildSeedSql(crewFile, standFile));
  assert.equal(resetSql, buildResetSql(crewFile, standFile));
});

test('crew_members: the 4 crew from crew.json, with crew-03 Lena Kowalski as the only CMO', () => {
  const rows = rowsOf(seedSql, 'crew_members').map((l) => l.match(new RegExp(`^  \\(${STR}, ${STR}, ${STR}, ${STR}, ${STR}, ${STR}\\),?$`)).slice(1));
  assert.deepEqual(
    rows.map(([id, name, role, , title, launch]) => ({ id, name: unq(name), role, title: unq(title), launch })),
    crewFile.crew.map((c) => ({ id: c.id, name: c.name, role: c.id === 'crew-03' ? 'cmo' : 'crew', title: c.role, launch: c.launchDate })),
  );
  assert.equal(rows.find((r) => r[2] === 'cmo')[1], 'Lena Kowalski');
});

test('daily_vitals: every in-flight day of every crew member, unchanged, dated by its day', () => {
  const daily = readings.filter((r) => r.kind === 'daily_vitals');
  assert.equal(daily.length, crewFile.crew.reduce((n, c) => n + c.days.length, 0));
  for (const c of crewFile.crew) {
    const mine = daily.filter((r) => r.crew_id === c.id);
    assert.equal(mine.length, c.days.length);
    for (const d of c.days) {
      const row = mine.find((r) => r.payload.day.day === d.day);
      assert.ok(row, `${c.id} day ${d.day} missing`);
      assert.deepEqual(row.payload.day, d);
      assert.equal(row.payload.origin, 'seed');
      assert.equal(row.recorded_at.slice(0, 10), d.date);
      assert.ok(['normal', 'watch', 'alert'].includes(row.status));
    }
  }
});

test('baselines: one per person, the mean of their crew.json preflight list', () => {
  const rows = rowsOf(seedSql, 'baselines').map((l) => {
    const m = l.match(new RegExp(`^  \\(${STR}, ${STR}, ${STR}::jsonb, ${STR}\\),?$`));
    return { crew_id: m[1], kind: m[2], payload: JSON.parse(unq(m[3])) };
  });
  assert.equal(rows.length, crewFile.crew.length);
  for (const c of crewFile.crew) {
    const b = rows.find((r) => r.crew_id === c.id);
    assert.equal(b.kind, 'daily_vitals');
    assert.equal(b.payload.days, c.preflight.length);
    for (const key of ['systolic', 'diastolic', 'heartRate', 'sleepHours', 'glucose', 'temperature', 'mood']) {
      const mean = c.preflight.reduce((s, d) => s + d[key], 0) / c.preflight.length;
      assert.ok(Math.abs(b.payload[key] - mean) < 0.006, `${c.id} ${key}: ${b.payload[key]} vs ${mean}`);
    }
  }
});

test('stand tests: the 8 preflight tests from standtests.json, none after landing', () => {
  const stands = readings.filter((r) => r.kind === 'stand_test');
  const preflight = standFile.tests.filter((t) => t.phase === 'preflight');
  assert.equal(stands.length, preflight.length);
  assert.equal(stands.length, 8);
  for (const t of preflight) {
    const row = stands.find((r) => r.payload.seed_id === t.id);
    assert.ok(row, `${t.id} missing`);
    assert.equal(row.crew_id, t.crew_id);
    assert.deepEqual(row.payload.supine, t.supine);
    assert.deepEqual(row.payload.standing_3min, t.standing_3min);
    assert.equal(row.payload.phase, 'preflight');
    const launch = crewFile.crew.find((c) => c.id === t.crew_id).launchDate;
    assert.ok(Date.parse(row.recorded_at) < Date.parse(launch));
  }
  assert.equal(stands.some((r) => r.payload.phase === 'post-landing'), false);
});

test('ids are stable UUIDs and unique; no general-population (PhysioNet) data is seeded', () => {
  assert.equal(new Set(readings.map((r) => r.id)).size, readings.length);
  assert.equal(seedUuid('daily:crew-01:1'), seedUuid('daily:crew-01:1'));
  assert.match(seedUuid('x'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(/bidslab|subject_id|nights?_scored/i.test(seedSql), false);
  assert.equal(readings.every((r) => r.crew_id.startsWith('crew-')), true);
});

test('reset_demo.sql: trigger off → delete non-seeded readings → trigger on → seed, in one transaction', () => {
  const at = (s) => resetSql.indexOf(s);
  const order = [
    at('begin;'),
    at('alter table public.readings disable trigger readings_append_only;'),
    at("delete from public.readings where payload->>'origin' is distinct from 'seed';"),
    at('alter table public.readings enable trigger readings_append_only;'),
    at('insert into public.crew_members'),
    at('insert into public.readings'),
    at('commit;'),
  ];
  assert.ok(order.every((i) => i >= 0), 'a step is missing');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'steps are out of order');
  assert.equal((resetSql.match(/delete from/g) ?? []).length, 1);
  assert.equal(/delete from public\.(crew_members|baselines)|auth\.users/.test(resetSql), false, 'logins and crew are kept');
});
