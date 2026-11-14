// The service-role key must never reach the browser. Run with: npm test (also runs before `npm run build`).
//  1. Only lib/supabaseServer.js may read SUPABASE_SERVICE_ROLE_KEY.
//  2. No file may define or read a NEXT_PUBLIC_ variable holding a service-role or secret key
//     (Next.js inlines every NEXT_PUBLIC_* value into the browser bundle).
//  3. No client component ('use client'), nor anything it imports, directly or indirectly, may import
//     lib/supabaseServer.js or mention the key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'); // next-app/
const SRC = join(ROOT, 'src');
const KEY = 'SUPABASE_SERVICE_ROLE_KEY';
const ALLOWED = [join(SRC, 'lib', 'supabaseServer.js')];
const CODE = /\.(m?js|jsx|ts|tsx)$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === 'node_modules' || name === '.next') return [];
    return statSync(p).isDirectory() ? walk(p) : CODE.test(name) ? [p] : [];
  });
}

const files = [...walk(SRC), ...walk(join(ROOT, 'scripts')), join(ROOT, 'next.config.mjs')].filter(existsSync);
const text = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const rel = (f) => relative(ROOT, f).replace(/\\/g, '/');
const isTest = (f) => /\.test\.js$/.test(f);

const isClient = (src) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*\s*['"]use client['"]/.test(src);

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null; // packages are not our files
  const base = resolve(dirname(from), spec);
  for (const cand of [base, `${base}.js`, `${base}.jsx`, join(base, 'index.js')]) {
    if (text.has(cand)) return cand;
  }
  return null;
}

function importsOf(file) {
  const src = text.get(file);
  const specs = [...src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm)].map(
    (m) => m[1] ?? m[2] ?? m[3],
  );
  return specs.map((s) => resolveImport(file, s)).filter(Boolean);
}

test(`only lib/supabaseServer.js reads ${KEY}`, () => {
  const offenders = files.filter((f) => !isTest(f) && !ALLOWED.includes(f) && text.get(f).includes(KEY));
  assert.deepEqual(offenders.map(rel), []);
  assert.ok(text.get(ALLOWED[0]).includes(`process.env.${KEY}`));
  assert.equal(isClient(text.get(ALLOWED[0])), false, 'supabaseServer.js must not be a client module');
});

test('no NEXT_PUBLIC_ variable holds a service-role or secret key', () => {
  const pattern = /NEXT_PUBLIC_[A-Z0-9_]*(SERVICE|SECRET|ROLE|PASSWORD)/;
  const offenders = files.filter((f) => !isTest(f) && pattern.test(text.get(f)));
  assert.deepEqual(offenders.map(rel), []);
});

test('no client component can reach the service-role key through its imports', () => {
  const roots = files.filter((f) => !isTest(f) && isClient(text.get(f)));
  assert.ok(roots.length > 5, `expected client components, found ${roots.length}`);
  const leaks = [];
  for (const root of roots) {
    const seen = new Set([root]);
    const queue = [[root, [root]]];
    while (queue.length) {
      const [f, path] = queue.shift();
      if (ALLOWED.includes(f) || text.get(f).includes(KEY)) {
        leaks.push(path.map(rel).join(' → '));
        continue;
      }
      for (const dep of importsOf(f)) {
        if (!seen.has(dep)) {
          seen.add(dep);
          queue.push([dep, [...path, dep]]);
        }
      }
    }
  }
  assert.deepEqual(leaks, []);
});

test('the check itself works: it would catch a client file importing the server module', () => {
  const fake = join(SRC, '__fake_client__.jsx');
  text.set(fake, "'use client';\nimport { serviceClient } from './lib/supabaseServer.js';\n");
  try {
    assert.deepEqual(importsOf(fake), [ALLOWED[0]]);
    assert.equal(isClient(text.get(fake)), true);
  } finally {
    text.delete(fake);
  }
});
