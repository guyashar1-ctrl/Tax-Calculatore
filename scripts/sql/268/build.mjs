// בונה את supabase/268-household-address-item.sql ואת scripts/sql/268/rollback-268.sql — רשימת הפריטים מהקטלוג בקוד (מקור אחד).
//   node scripts/sql/268/build.mjs
// ‼ לא לערוך ביד. החזרה מחזירה את רשימת 267.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const tmp = mkdtempSync(join(tmpdir(), 'pivo-268-'));
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['esbuild', 'scripts/sql/253/items.ts', '--bundle', '--platform=node', '--alias:@src=./src', `--outfile=${join(tmp, 'items268.cjs')}`, '--log-level=error'], { cwd: WT, stdio: 'inherit', shell: process.platform === 'win32' });
const { items } = JSON.parse(execFileSync(process.execPath, [join(tmp, 'items268.cjs')], { cwd: WT }).toString());
const lit4 = (obj) => {
  const entries = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  const lines = []; for (let i = 0; i < entries.length; i += 4) lines.push('    ' + entries.slice(i, i + 4).join(','));
  return `{\n${lines.join(',\n')}}`.replace(/'/g, "''");
};
const prev = readFileSync(WT + 'supabase/267-annual-questionnaire-v2.sql', 'utf8').replace(/\r\n/g, '\n');
const prevItems = (() => { const at = prev.indexOf('function public._tax_year_items()'); const a = prev.indexOf("select '", at) + "select '".length; const b = prev.indexOf("'::jsonb", a); return prev.slice(a, b); })();
const nPrev = (prevItems.match(/":"/g) ?? []).length;
const added = Object.keys(items).filter(k => !prevItems.includes(`"${k}":`));
const removed = [...prevItems.matchAll(/"([^"]+)":"/g)].map(m => m[1]).filter(k => !(k in items));
if (removed.length) throw new Error(`268: פריטים שירדו מהקטלוג (אסור): ${removed.join(', ')}`);
const fn = (body) => `create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '${body}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;`;
writeFileSync(WT + 'supabase/268-household-address-item.sql', `-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 268 · כתובת המגורים בהערכת המס ובדוח — בלי «קליטה» נפרדת (21.10.2026)
-- ‼ נוצר ב-scripts/sql/268/build.mjs. לא לערוך ביד. חזרה: scripts/sql/268/rollback-268.sql.
-- ‼ גיא: לקוח חדש ⇒ «הערכת מס», ועל הדרך כתובת וילדים. השרת מכיר רק פריטים שברשימה — לכן היא מתעדכנת. בלי שינוי בגופים ובלי נתונים.
--   _tax_year_items: ${Object.keys(items).length} פריטים (${nPrev} ב-267; חדשים: ${added.length}): ${added.join(', ')}.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
${fn(lit4(items))}
-- אימות: select public._tax_year_items() ? 'household.address';
`);
mkdirSync(WT + 'scripts/sql/268', { recursive: true });
writeFileSync(WT + 'scripts/sql/268/rollback-268.sql', `-- חזרה מ-268: רשימת הפריטים של 267. נוצר ב-scripts/sql/268/build.mjs.\n${fn(prevItems)}\n`);
console.log(`268: ${Object.keys(items).length} items (+${added.length}: ${added.join(', ')})`);
