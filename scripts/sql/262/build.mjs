// בונה את supabase/262-annual-simple-questionnaire.sql ואת scripts/sql/262/rollback-262.sql מהקטלוג בקוד — מקור אחד.
//   node scripts/sql/262/build.mjs
// ‼ לא לערוך את שני הקבצים ביד: שינוי בקטלוג (catalog.ts / intakeCatalog.ts / wealthCatalog.ts) ⇒ להריץ שוב.
// ‼ החזרה מחזירה את רשימת הפריטים של 253 (נקראת מהקובץ של 253) ומסירה את ההזרקה.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const tmp = mkdtempSync(join(tmpdir(), 'pivo-262-'));
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['esbuild', 'scripts/sql/253/items.ts', '--bundle', '--platform=node', '--alias:@src=./src', `--outfile=${join(tmp, 'items262.cjs')}`, '--log-level=error'], { cwd: WT, stdio: 'inherit', shell: process.platform === 'win32' });
const { items } = JSON.parse(execFileSync(process.execPath, [join(tmp, 'items262.cjs')], { cwd: WT }).toString());

const lit4 = (obj) => {
  const entries = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  const lines = []; for (let i = 0; i < entries.length; i += 4) lines.push('    ' + entries.slice(i, i + 4).join(','));
  return `{\n${lines.join(',\n')}}`.replace(/'/g, "''");
};
const s253 = readFileSync(WT + 'supabase/253-intake-closed-lists.sql', 'utf8').replace(/\r\n/g, '\n');
const items253 = (() => { const at = s253.indexOf('function public._tax_year_items()'); const a = s253.indexOf("select '", at) + "select '".length; const b = s253.indexOf("'::jsonb", a); return s253.slice(a, b); })();
const n253 = (items253.match(/":"/g) ?? []).length;
const added = Object.keys(items).filter(k => !items253.includes(`"${k}":`));

// ── ההזרקה ל-portal_submit_tax_info (עוגנים של שורה אחת, פעם אחת בדיוק — נבדק מול הייצור וה-staging ב-19.10) ──
const A_DECL = `  v_out  jsonb; v_it jsonb; v_f jsonb; v_val text; v_list jsonb; v_clean jsonb;\n`;
const N_DECL = `  v_out  jsonb; v_it jsonb; v_f jsonb; v_val text; v_list jsonb; v_clean jsonb;\n  v_fu   jsonb; -- 262 · כמה שאלות המשך לאריח\n`;
const A_FU = `      -- שאלת ההמשך היא צילום שנשמר בשאלה בזמן הכנתה במשרד — לא נוסח מהדפדפן; פעם אחת לזהות (האינדקס של 229)\n`;
const N_FU = `      -- 262 · כמה שאלות המשך לאריח (followUps): כל אחת צילום כמו followUp; פריט שהשרת לא מכיר — מדולג (לא נכשל)
      if v_yes and jsonb_typeof(v_o->'followUps') = 'array' then
        for v_fu in select value from jsonb_array_elements(v_o->'followUps') loop
          if jsonb_typeof(v_fu) = 'object' and (v_items ? (v_fu->>'itemKey')) and coalesce(v_fu->>'subjectRole', '') in ('client','spouse','couple')
             and jsonb_typeof(v_fu->'prompt') = 'object' and nullif(v_fu->'prompt'->>'title', '') is not null then
            insert into public.tax_info_asks (user_id, client_id, tax_year, step_id, parent_step_id, item_key, item_kind, subject_role, entity_kind, entity_ref, prompt, state)
            values (a.user_id, c.id, a.tax_year, a.step_id, a.parent_step_id, v_fu->>'itemKey', v_items->>(v_fu->>'itemKey'),
                    v_fu->>'subjectRole', nullif(v_fu->>'entityKind', ''), nullif(v_fu->>'entityRef', ''), v_fu->'prompt', 'published')
            on conflict do nothing;
            get diagnostics v_n = row_count;
            v_opened := v_opened + v_n;
          end if;
        end loop;
      end if;
`;
// ── הכותרת שהלקוח רואה לבקשת־הבת של דוח שנתי: «הדוח השנתי 2025» (לא «השלמת מידע לשנת 2025») — רק לחדשות ──
const A_TITLE = `else 'השלמת מידע לשנת ' || v_year end))`;
const N_TITLE = `when par.step_type = 'annual_return' then 'הדוח השנתי ' || v_year /* 262 · כותרת */ else 'השלמת מידע לשנת ' || v_year end))`;
const sqlStr = (s) => `$blk$${s}$blk$`;

const head = `-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 262 · השאלון הפשוט לדוח השנתי — מסך רשת, ענף משפחתי, קצבאות ונכות (19.10.2026)
-- ‼ נוצר ב-scripts/sql/262/build.mjs מהקטלוג בקוד. לא לערוך ביד. חזרה: scripts/sql/262/rollback-262.sql.
-- ‼ ההכרעה: גיא 19.10 (docs/proposals/2026-10-19-simple-annual-questionnaire.html). תלויות: 229, 241, 253.
--
-- מה כאן:
--   1. _tax_year_items — הרשימה המלאה מהקטלוג: ${Object.keys(items).length} פריטים (${n253} ב-253; חדשים: ${added.length}).
--      חדשים: ${added.join(', ')}.
--   2. portal_submit_tax_info — אריח במסך הרשת יכול לפתוח כמה שאלות המשך יחד (followUps), לא רק אחת (followUp).
--      כל שאלה היא צילום שנשמר בשאלה בזמן הכנתה; פריט שהשרת לא מכיר — מדולג; פעם אחת לזהות (האינדקס של 229).
--   3. add_tax_info_asks — בקשת־הבת של דוח שנתי נקראת אצל הלקוח «הדוח השנתי {שנה}» (חדשות בלבד; קיימות לא משתנות).
-- ‼ הזרקה לגוף החי — כל עוגן שורה אחת, פעם אחת בדיוק; החלה חוזרת מדלגת לפי הסימון «262 ·».
-- ════════════════════════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if not exists (select 1 from pg_proc where proname = 'portal_submit_tax_info' and prosrc like '%253 · מסך הרשת%') then
    raise exception '262: 253 לא הוחלה — להחיל 253 לפני 262';
  end if;
end
$guard$;

-- ── 1. רשימת הפריטים — מהקטלוג בקוד ──
create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '${lit4(items)}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;

-- ── 2. portal_submit_tax_info — כמה שאלות המשך לאריח ──
do $p1$
declare
  v_def text; v_nl text;
  a1 text := ${sqlStr(A_DECL)};
  n1 text := ${sqlStr(N_DECL)};
  a2 text := ${sqlStr(A_FU)};
  n2 text := ${sqlStr(N_FU)};
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  if position('262 · כמה שאלות המשך' in v_def) > 0 then raise notice '262: portal_submit_tax_info — כבר הוחל'; return; end if;
  v_nl := case when position(E'\\r\\n' in v_def) > 0 then E'\\r\\n' else E'\\n' end;
  a1 := replace(a1, E'\\n', v_nl); n1 := replace(n1, E'\\n', v_nl); a2 := replace(a2, E'\\n', v_nl); n2 := replace(n2, E'\\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '262: עוגן ההצהרות (v_out) לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then raise exception '262: עוגן שאלת ההמשך של 253 לא נמצא פעם אחת'; end if;
  execute replace(replace(v_def, a1, n1), a2, n2 || a2);
end
$p1$;

-- ── 3. add_tax_info_asks — הכותרת של בקשת־הבת בדוח שנתי ──
do $p2$
declare v_def text; a1 text := ${sqlStr(A_TITLE)}; n1 text := ${sqlStr(N_TITLE)};
begin
  select pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) into v_def;
  if position('262 · כותרת' in v_def) > 0 then raise notice '262: add_tax_info_asks — כבר הוחל'; return; end if;
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '262: עוגן הכותרת ב-add_tax_info_asks לא נמצא פעם אחת'; end if;
  execute replace(v_def, a1, n1);
end
$p2$;

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select prosrc like '%262 · כמה שאלות המשך%' from pg_proc where proname = 'portal_submit_tax_info';
--   select prosrc like '%262 · כותרת%' from pg_proc where proname = 'add_tax_info_asks';
--   select count(*) from jsonb_object_keys(public._tax_year_items());  -- = ${Object.keys(items).length}
`;

const rollback = `-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- התאוששות מ-262 — נוצר ב-scripts/sql/262/build.mjs (לא לערוך ביד)
-- ‼ מחזיר את רשימת הפריטים של 253 ומסיר את ההזרקה מהגוף החי (אותן מחרוזות).
-- ‼ נתונים: שום תשובה לא נמחקת. שאלות של הפריטים החדשים שעוד לא נענו — מבוטלות (השרת הישן לא מכיר אותם).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
begin;
update public.tax_info_asks set state = 'cancelled' where state in ('draft', 'published')
  and item_key in (${added.map(k => `'${k}'`).join(', ')});

do $r1$
declare
  v_def text; v_nl text;
  a1 text := ${sqlStr(A_DECL)};
  n1 text := ${sqlStr(N_DECL)};
  a2 text := ${sqlStr(A_FU)};
  n2 text := ${sqlStr(N_FU)};
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  if position('262 · כמה שאלות המשך' in v_def) = 0 then raise notice 'rollback 262: לא הוחל — אין מה להחזיר'; return; end if;
  v_nl := case when position(E'\\r\\n' in v_def) > 0 then E'\\r\\n' else E'\\n' end;
  a1 := replace(a1, E'\\n', v_nl); n1 := replace(n1, E'\\n', v_nl); a2 := replace(a2, E'\\n', v_nl); n2 := replace(n2, E'\\n', v_nl);
  execute replace(replace(v_def, n1, a1), n2 || a2, a2);
end
$r1$;

do $r2$
declare v_def text; a1 text := ${sqlStr(A_TITLE)}; n1 text := ${sqlStr(N_TITLE)};
begin
  select pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) into v_def;
  if position('262 · כותרת' in v_def) = 0 then return; end if;
  execute replace(v_def, n1, a1);
end
$r2$;

create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '${items253}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;
commit;
`;

writeFileSync(WT + 'supabase/262-annual-simple-questionnaire.sql', head);
writeFileSync(WT + 'scripts/sql/262/rollback-262.sql', rollback);
console.log(`262: ${Object.keys(items).length} פריטים (253: ${n253}); חדשים: ${added.length}`);
