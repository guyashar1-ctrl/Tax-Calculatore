#!/usr/bin/env node
/**
 * generate-eligible-localities-seed.mjs — בונה את supabase/285-eligible-localities-seed.sql
 * מתוך המקור היחיד: src/data/eligibleSettlements.ts (הרשימות לכל שנה) +
 * src/data/eligibleSettlementCodes.ts (סמל היישוב הרשמי).
 *
 *   שימוש:  node scripts/generate-eligible-localities-seed.mjs          (כותב)
 *           node scripts/generate-eligible-localities-seed.mjs --check  (נכשל אם הקובץ לא עדכני)
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { ROOT } from './staging-lib.mjs';

const OUT = resolve(ROOT, 'supabase/285-eligible-localities-seed.sql');
const YEARS = [2025, 2026];

const dir = mkdtempSync(join(tmpdir(), 'elig-'));
try {
  const entry = join(dir, 'entry.ts');
  writeFileSync(entry, `
    export { getEligibleSettlements } from ${JSON.stringify(resolve(ROOT, 'src/data/eligibleSettlements.ts'))};
    export { SETTLEMENT_LOCALITY_CODES, SETTLEMENTS_WITHOUT_LOCALITY_CODE } from ${JSON.stringify(resolve(ROOT, 'src/data/eligibleSettlementCodes.ts'))};
  `);
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'out.mjs'), logLevel: 'silent' });
  const m = await import(pathToFileURL(join(dir, 'out.mjs')).href);

  const rows = [];
  const missing = [];
  for (const year of YEARS) {
    for (const s of m.getEligibleSettlements(year)) {
      const code = m.SETTLEMENT_LOCALITY_CODES[s.name];
      if (code) rows.push([year, code, s.name]);
      else if (!m.SETTLEMENTS_WITHOUT_LOCALITY_CODE[s.name]) missing.push(`${year}: ${s.name}`);
    }
  }
  if (missing.length) { console.error('✗ יישוב מזכה בלי סמל (להוסיף ל-eligibleSettlementCodes.ts):\n' + missing.join('\n')); process.exit(1); }

  // שני שמות לאותו סמל באותה שנה — סתירה בקובץ הסמלים
  const seen = new Map();
  for (const [y, c, n] of rows) {
    const k = `${y}:${c}`;
    if (seen.has(k) && seen.get(k) !== n) { console.error(`✗ סמל ${c} ב-${y}: «${seen.get(k)}» וגם «${n}»`); process.exit(1); }
    seen.set(k, n);
  }
  const uniq = [...new Map(rows.map(r => [`${r[0]}:${r[1]}`, r])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lit = s => `'${s.replace(/'/g, "''")}'`;
  const sql = `-- ‼ נוצר אוטומטית — לא לערוך ביד. scripts/generate-eligible-localities-seed.mjs
-- המקור: src/data/eligibleSettlements.ts + src/data/eligibleSettlementCodes.ts
-- ${uniq.length} שורות · שנים ${YEARS.join(', ')}
begin;
delete from public.tax_eligible_localities where tax_year in (${YEARS.join(', ')});
insert into public.tax_eligible_localities (tax_year, locality_code, settlement_name) values
${uniq.map(([y, c, n]) => `  (${y}, ${c}, ${lit(n)})`).join(',\n')};
commit;
`;
  if (process.argv.includes('--check')) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (cur !== sql) { console.error('✗ 285-eligible-localities-seed.sql לא תואם את המקור — להריץ את המחולל'); process.exit(1); }
    console.log('✓ הקובץ עדכני');
  } else {
    writeFileSync(OUT, sql);
    console.log(`✓ ${uniq.length} שורות ⇒ ${OUT}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
