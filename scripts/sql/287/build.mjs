// בונה את supabase/287-annual-questionnaire-round2-1.sql ואת scripts/sql/287/rollback-287.sql — רשימת הפריטים מהקטלוג בקוד (מקור אחד).
//   node scripts/sql/287/build.mjs
// ‼ לא לערוך את שני הקבצים ביד: שינוי בקטלוג ⇒ להריץ שוב. החזרה מחזירה את רשימת 286 ואת שורת «N שאלות».
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const tmp = mkdtempSync(join(tmpdir(), 'pivo-287-'));
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['esbuild', 'scripts/sql/253/items.ts', '--bundle', '--platform=node', '--alias:@src=./src', `--outfile=${join(tmp, 'items287.cjs')}`, '--log-level=error'], { cwd: WT, stdio: 'inherit', shell: process.platform === 'win32' });
const { items } = JSON.parse(execFileSync(process.execPath, [join(tmp, 'items287.cjs')], { cwd: WT }).toString());

const lit4 = (obj) => {
  const entries = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  const lines = []; for (let i = 0; i < entries.length; i += 4) lines.push('    ' + entries.slice(i, i + 4).join(','));
  return `{\n${lines.join(',\n')}}`.replace(/'/g, "''");
};
const s286 = readFileSync(WT + 'supabase/286-annual-questionnaire-round2.sql', 'utf8').replace(/\r\n/g, '\n');
const items286 = (() => { const at = s286.indexOf('function public._tax_year_items()'); const a = s286.indexOf("select '", at) + "select '".length; const b = s286.indexOf("'::jsonb", a); return s286.slice(a, b); })();
const n286 = (items286.match(/":"/g) ?? []).length;
const added = Object.keys(items).filter(k => !items286.includes(`"${k}":`));
const removed = [...items286.matchAll(/"([^"]+)":"/g)].map(m => m[1]).filter(k => !(k in items));
if (removed.length) throw new Error(`287: פריטים שירדו מהקטלוג (אסור — שאלות קיימות מצביעות עליהם): ${removed.join(', ')}`);
const changedKind = [...items286.matchAll(/"([^"]+)":"([^"]+)"/g)].filter(m => items[m[1]] !== m[2]).map(m => m[1]);
if (changedKind.length) throw new Error(`287: סוג פריט השתנה (${changedKind.join(', ')}) — לא בסבב הזה`);

const fn = (body) => `create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '${body}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;`;

// ── _portal_step_items (222/229/241): שורת המשנה של שאלון הדוח השנתי — «N שאלות» סופר שאלות שמוצגות כמסך אחד ──
const A1 = `'sub', case when v_ck_total = 1 then 'שאלה אחת' else v_ck_total || ' שאלות' end || ' · אפשר לעצור ולהמשיך',`;
const N1 = `'sub', case when s.payload->>'purpose' = 'annual' then 'רק מה שהשתנה' /* 287 · הדוח השנתי */ when v_ck_total = 1 then 'שאלה אחת' else v_ck_total || ' שאלות' end || ' · אפשר לעצור ולהמשיך',`;
const SIG = `public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)`;

const doBlock = (from1, to1, marker, check) => `do $p1$
declare
  v_def text;
  a1 text := $blk$${from1}$blk$;
  n1 text := $blk$${to1}$blk$;
begin
  select pg_get_functiondef('${SIG}'::regprocedure) into v_def;
${check}
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '${marker}: העוגן לא נמצא פעם אחת'; end if;
  execute replace(v_def, a1, n1);
end
$p1$;`;

const up = doBlock(A1, N1, '287', `  if position('287 · הדוח השנתי' in v_def) > 0 then raise notice '287: _portal_step_items — כבר הוחל'; return; end if;`);
const down = doBlock(N1, A1, 'rollback 287', `  if position('287 · הדוח השנתי' in v_def) = 0 then raise notice 'rollback 287: לא הוחל'; return; end if;`);

writeFileSync(WT + 'supabase/287-annual-questionnaire-round2-1.sql', `-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 287 · שאלון הדוח השנתי — סבב 2.1 (22.10.2026; בלי טקסט חופשי, «הדבר הבא» בלי כפילות)
-- ‼ נוצר ב-scripts/sql/287/build.mjs. לא לערוך ביד. חזרה: scripts/sql/287/rollback-287.sql.
-- ‼ מה כאן (רק השרת; השאר — בקוד האתר):
--   1. _tax_year_items: ${Object.keys(items).length} פריטים (${n286} ב-286; חדשים: ${added.length}): ${added.join(', ')}.
--      ריבוע «הכנסה אחרת» (זכייה, תמלוגים, משהו אחר ⇐ המשרד מתקשר) — במקום «משהו אחר?» בטקסט חופשי.
--   2. _portal_step_items: בדף האישי, שאלון הדוח השנתי — «רק מה שהשתנה · אפשר לעצור ולהמשיך» במקום «N שאלות»
--      (המספר סופר שאלות שמוצגות יחד במסך אחד). החלפת ביטוי אחד בעוגן אחד, בלי סכמה ובלי נתונים.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
${fn(lit4(items))}

${up}

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select prosrc like '%287 · הדוח השנתי%' from pg_proc where proname = '_portal_step_items';
--   select public._tax_year_items() ? 'income.other', public._tax_year_items() ? 'income.unlisted';
`);
mkdirSync(WT + 'scripts/sql/287', { recursive: true });
writeFileSync(WT + 'scripts/sql/287/rollback-287.sql', `-- חזרה מ-287: רשימת הפריטים של 286, ושורת «N שאלות» בדף. נוצר ב-scripts/sql/287/build.mjs.
-- ‼ שאלות שכבר נוצרו עם המפתחות החדשים נשארות; תשובה אליהן תיכשל ב-bad_option אחרי החזרה — להחזיר רק כשאין כאלה פתוחות.
${fn(items286)}

${down}
`);
console.log(`287: ${Object.keys(items).length} items (+${added.length}: ${added.join(', ')})`);
