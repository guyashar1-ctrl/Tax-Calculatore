// בונה את supabase/290-questionnaire-closes-credits.sql ואת scripts/sql/290/rollback-290.sql — רשימת הפריטים מהקטלוג בקוד (מקור אחד).
//   node scripts/sql/290/build.mjs
// ‼ לא לערוך את שני הקבצים ביד: שינוי בקטלוג ⇒ להריץ שוב. החזרה מחזירה את רשימת 287 ומסירה את שני הענפים (העמודה נשארת — בלי אובדן נתונים).
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const tmp = mkdtempSync(join(tmpdir(), 'pivo-290-'));
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['esbuild', 'scripts/sql/253/items.ts', '--bundle', '--platform=node', '--alias:@src=./src', `--outfile=${join(tmp, 'items290.cjs')}`, '--log-level=error'], { cwd: WT, stdio: 'inherit', shell: process.platform === 'win32' });
const { items } = JSON.parse(execFileSync(process.execPath, [join(tmp, 'items290.cjs')], { cwd: WT }).toString());

const lit4 = (obj) => {
  const entries = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  const lines = []; for (let i = 0; i < entries.length; i += 4) lines.push('    ' + entries.slice(i, i + 4).join(','));
  return `{\n${lines.join(',\n')}}`.replace(/'/g, "''");
};
const s287 = readFileSync(WT + 'supabase/287-annual-questionnaire-round2-1.sql', 'utf8').replace(/\r\n/g, '\n');
const items287 = (() => { const at = s287.indexOf('function public._tax_year_items()'); const a = s287.indexOf("select '", at) + "select '".length; const b = s287.indexOf("'::jsonb", a); return s287.slice(a, b); })();
const n287 = (items287.match(/":"/g) ?? []).length;
const added = Object.keys(items).filter(k => !items287.includes(`"${k}":`));
const removed = [...items287.matchAll(/"([^"]+)":"/g)].map(m => m[1]).filter(k => !(k in items));
if (removed.length) throw new Error(`290: פריטים שירדו מהקטלוג (אסור — שאלות קיימות מצביעות עליהם): ${removed.join(', ')}`);
const changedKind = [...items287.matchAll(/"([^"]+)":"([^"]+)"/g)].filter(m => items[m[1]] !== m[2]).map(m => m[1]);
if (changedKind.length) throw new Error(`290: סוג פריט השתנה (${changedKind.join(', ')}) — לא בסבב הזה`);
const EXPECTED = ['household.spouseBasics', 'household.noIncomeSpouse', 'household.aliyahDetails', 'special.disabilityDetails', 'household.reserveDuty', 'household.reserveDays', 'household.reserveDocs', 'household.disabledChildDetails', 'family.childSupport'];
if (EXPECTED.some(k => !added.includes(k)) || added.length !== EXPECTED.length) throw new Error(`290: הפריטים החדשים אינם בדיוק ${EXPECTED.join(', ')} (חדשים: ${added.join(', ')})`);

const fn = (body) => `create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '${body}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;`;

// ── _tax_fact_field_op: חודש העלייה (עמודה חדשה) ושנת החזרה (העמודה קיימת; עד עכשיו בלי ענף) — אותה תבנית כמו 288 ──
const MARK = '290 · עלייה';
const BRANCHES = `    -- ${MARK}: חודש העלייה ושנת החזרה לארץ — מהשאלון השנתי, באישור המשרד
    when 'aliyahMonth' then
      select to_jsonb(aliyah_month) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set aliyah_month = nullif(p_value #>> '{}', '')::smallint, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'returningYear' then
      select to_jsonb(returning_year) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set returning_year = nullif(p_value #>> '{}', '')::integer, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
`;
const q = (t) => t.replace(/'/g, "''");
const SIG = `public._tax_fact_field_op(text,text,boolean,jsonb,text)`;
const opBlock = (up) => `do $p289$
declare
  v_def text;
  v_nl text;
  a1 text := E'    when ''taxFiles'' then\\n';
  n1 text := E'${q(BRANCHES).replace(/\n/g, '\\n')}';
begin
  select pg_get_functiondef('${SIG}'::regprocedure) into v_def;
  v_nl := case when position(E'\\r\\n' in v_def) > 0 then E'\\r\\n' else E'\\n' end;
  a1 := replace(a1, E'\\n', v_nl); n1 := replace(n1, E'\\n', v_nl);
${up ? `  if position('${MARK}' in v_def) > 0 then raise notice '290: _tax_fact_field_op — כבר הוחל'; return; end if;
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '290: עוגן taxFiles ב-_tax_fact_field_op לא נמצא פעם אחת'; end if;
  if v_def ~ E'when ''(aliyahMonth|returningYear)'' then' then raise exception '290: ענף aliyahMonth/returningYear כבר קיים בגרסה לא מוכרת'; end if;
  execute replace(v_def, a1, n1 || a1);`
  : `  if position('${MARK}' in v_def) = 0 then raise notice 'rollback 290: _tax_fact_field_op — לא הוחל'; return; end if;
  if (length(v_def) - length(replace(v_def, n1, ''))) / length(n1) <> 1 then raise exception 'rollback 290: הענפים לא נמצאו פעם אחת'; end if;
  execute replace(v_def, n1, '');`}
end
$p289$;
revoke all on function ${SIG.replace('(text,text,boolean,jsonb,text)', '(text, text, boolean, jsonb, text)')} from public, anon, authenticated;`;

writeFileSync(WT + 'supabase/290-questionnaire-closes-credits.sql', `-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 290 · השאלון השנתי סוגר את קלטי נקודות הזיכוי (23.10.2026, גיא אישר)
-- ‼ נוצר ב-scripts/sql/290/build.mjs. לא לערוך ביד. חזרה: scripts/sql/290/rollback-290.sql.
-- ‼ מה כאן (רק השרת; השאר — בקוד האתר: catalog / records / recordToCard):
--   1. clients.aliyah_month — חודש העלייה (1–12). סעיף 35 סופר חודשי ותק; בלעדיו החישוב הניח ינואר.
--   2. _tax_fact_field_op: ענפים aliyahMonth (חדש) ו-returningYear (העמודה קיימת, עד עכשיו בלי ענף) — כדי ש«אשר ועדכן בתיק»
--      (apply_tax_facts) יכתוב אותם עם הערך הקודם. ‼ ענף = העמודה מנוהלת (_governed_client_columns) ⇒ שתיהן ב-GOVERNED_FACT_KEYS.
--   3. _tax_year_items: ${Object.keys(items).length} פריטים (${n287} ב-287; חדשים: ${added.length}): ${added.join(', ')}.
--      שאלות ההמשך (עלייה, נכות, מילואים אחרי «כן» בריבוע; ילד עם מוגבלות בשורת הילדים; מזונות ילדים מ«אני משלם/ת» בגירושין — onValue)
--      הן צילומים בתוך השאלה (followUps 262 / onValue 286) — השרת פותח אותן רק אם הוא מכיר את המפתח; לכן הם כאן.
--      מזונות לגרוש/ה (household.alimonyPaid) כבר מוכר — רק נעשה ריבוע בקוד. מין ותאריך הלידה של בן/בת הזוג, וסעיף 37 — שאלות לזוג.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.clients
  add column if not exists aliyah_month smallint check (aliyah_month between 1 and 12);

${opBlock(true)}

${fn(lit4(items))}

do $$
begin
  if position('${MARK}' in pg_get_functiondef('${SIG}'::regprocedure)) = 0 then raise exception '290: _tax_fact_field_op לא עודכן'; end if;
  if not ('aliyah_month' = any(public._governed_client_columns()) and 'returning_year' = any(public._governed_client_columns())) then
    raise exception '290: העמודות לא מנוהלות';
  end if;
  if not (public._tax_year_items() ?& array[${EXPECTED.map(k => `'${k}'`).join(', ')}]) then raise exception '290: הפריטים החדשים חסרים'; end if;
end;
$$;

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select position('${MARK}' in pg_get_functiondef('${SIG}'::regprocedure)) > 0;
--   select public._tax_year_items() ?& array[${EXPECTED.map(k => `'${k}'`).join(', ')}];
`);
mkdirSync(WT + 'scripts/sql/290', { recursive: true });
writeFileSync(WT + 'scripts/sql/290/rollback-290.sql', `-- חזרה מ-290: רשימת הפריטים של 287, ובלי ענפי aliyahMonth / returningYear. נוצר ב-scripts/sql/290/build.mjs.
-- ‼ העמודה clients.aliyah_month נשארת (בלי אובדן נתונים). לחזור רק יחד עם קוד האתר הקודם — אחרת «אשר ועדכן בתיק» לעלייה נכשל.
-- ‼ שאלות שכבר נוצרו עם המפתחות החדשים נשארות; תשובה אליהן תדלג על הפריט (262) — להחזיר רק כשאין כאלה פתוחות.
${fn(items287)}

${opBlock(false)}
`);
console.log(`290: ${Object.keys(items).length} items (+${added.length}: ${added.join(', ')})`);
