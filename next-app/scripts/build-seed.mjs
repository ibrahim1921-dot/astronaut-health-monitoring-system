// Regenerates supabase/seed.sql and supabase/reset_demo.sql from the bundled data files.
// Usage (from next-app/): npm run seed:build
import { readFileSync, writeFileSync } from 'node:fs';
import { buildResetSql, buildSeedSql } from '../src/lib/seedSql.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const crew = read('../src/data/crew.json');
const stand = read('../src/data/standtests.json');

writeFileSync(new URL('../supabase/seed.sql', import.meta.url), buildSeedSql(crew, stand));
writeFileSync(new URL('../supabase/reset_demo.sql', import.meta.url), buildResetSql(crew, stand));
console.log('Wrote supabase/seed.sql and supabase/reset_demo.sql');
