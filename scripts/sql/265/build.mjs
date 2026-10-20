// בונה את supabase/265-annual-gaps-items.sql ואת scripts/sql/265/rollback-265.sql מהקטלוג בקוד — מקור אחד.
//   node scripts/sql/265/build.mjs
// ‼ לא לערוך את שני הקבצים ביד: שינוי בקטלוג ⇒ להריץ שוב. החזרה מחזירה את רשימת הפריטים של 262 (נקראת מהקובץ של 262).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const tmp = mkdtempSync(join(tmpdir(), 'pivo-265-'));
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['esbuild', 'scripts/sql/253/items.ts', '--bundle', '--platform=node', '--alias:@src=./src', `--outfile=${join(tmp, 'items265.cjs')}`, '--log-level=error'], { cwd: WT, stdio: 'inherit', shell: process.platform === 'win32' });
const { items } = JSON.parse(execFileSync(process.execPath, [join(tmp, 'items265.cjs')], { cwd: WT }).toString());

const lit4 = (obj) => {
  const entries = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  const lines = []; for (let i = 0; i < entries.length; i += 4) lines.push('    ' + entries.slice(i, i + 4).join(','));
  return `{\n${lines.join(',\n')}}`.replace(/'/g, "''");
};
const s262 = readFileSync(WT + 'supabase/262-annual-simple-questionnaire.sql', 'utf8').replace(/\r\n/g, '\n');
const items262 = (() => { const at = s262.indexOf('function public._tax_year_items()'); const a = s262.indexOf("select '", at) + "select '".length; const b = s262.indexOf("'::jsonb", a); return s262.slice(a, b); })();
const n262 = (items262.match(/":"/g) ?? []).length;
const added = Object.keys(items).filter(k => !items262.includes(`"${k}":`));
const removed = [...items262.matchAll(/"([^"]+)":"/g)].map(m => m[1]).filter(k => !(k in items));
if (removed.length) throw new Error(`265: פריטים שירדו מהקטלוג (אסור — שאלות קיימות מצביעות עליהם): ${removed.join(', ')}`);

const fn = (body) => `create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '${body}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;`;

writeFileSync(WT + 'supabase/265-annual-gaps-items.sql', `-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 265 · פערי יריב בשאלון הדוח השנתי — פריטים חדשים בקטלוג (20.10.2026)
-- ‼ נוצר ב-scripts/sql/265/build.mjs מהקטלוג בקוד. לא לערוך ביד. חזרה: scripts/sql/265/rollback-265.sql.
-- ‼ למה: בדיקת השלמות (docs/plans/2026-10-20-simplicity-roadmap.md §5) — חסרו פדיון ימי מחלה, היוון + 161ד, מתי שולמה
--   קצבת השאירים ואישור לכל משלם, ומניות/אופציות מהעבודה. השרת מכיר רק פריטים שברשימה (portal_submit_tax_info,
--   add_tax_info_asks) — לכן הרשימה מתעדכנת. בלי שינוי בגופי פונקציות אחרות ובלי נתונים.
--   _tax_year_items: ${Object.keys(items).length} פריטים (${n262} ב-262; חדשים: ${added.length}): ${added.join(', ')}.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
${fn(lit4(items))}

-- אימות: select count(*) from jsonb_object_keys(public._tax_year_items());  -- = ${Object.keys(items).length}
`);
writeFileSync(WT + 'scripts/sql/265/rollback-265.sql', `-- התאוששות מ-265: רשימת הפריטים חוזרת לזו של 262 (${n262}). שאלות פתוחות של הפריטים החדשים — מבוטלות (התשובות נשארות).
begin;
update public.tax_info_asks set state = 'cancelled' where state in ('draft', 'published')
  and item_key in (${added.map(k => `'${k}'`).join(', ')});
${fn(items262)}
commit;
-- אימות: select count(*) from jsonb_object_keys(public._tax_year_items());  -- = ${n262}
`);
console.log(`265: ${Object.keys(items).length} פריטים (262: ${n262}); חדשים: ${added.join(', ')}`);
