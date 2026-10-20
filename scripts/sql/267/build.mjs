// בונה את supabase/267-annual-questionnaire-v2.sql ואת scripts/sql/267/rollback-267.sql — רשימת הפריטים מהקטלוג בקוד (מקור אחד).
//   node scripts/sql/267/build.mjs
// ‼ לא לערוך את שני הקבצים ביד: שינוי בקטלוג ⇒ להריץ שוב. החזרה מחזירה את רשימת 265 ומסירה את שתי ההזרקות.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const tmp = mkdtempSync(join(tmpdir(), 'pivo-267-'));
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['esbuild', 'scripts/sql/253/items.ts', '--bundle', '--platform=node', '--alias:@src=./src', `--outfile=${join(tmp, 'items267.cjs')}`, '--log-level=error'], { cwd: WT, stdio: 'inherit', shell: process.platform === 'win32' });
const { items } = JSON.parse(execFileSync(process.execPath, [join(tmp, 'items267.cjs')], { cwd: WT }).toString());

const lit4 = (obj) => {
  const entries = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  const lines = []; for (let i = 0; i < entries.length; i += 4) lines.push('    ' + entries.slice(i, i + 4).join(','));
  return `{\n${lines.join(',\n')}}`.replace(/'/g, "''");
};
const s265 = readFileSync(WT + 'supabase/265-annual-gaps-items.sql', 'utf8').replace(/\r\n/g, '\n');
const items265 = (() => { const at = s265.indexOf('function public._tax_year_items()'); const a = s265.indexOf("select '", at) + "select '".length; const b = s265.indexOf("'::jsonb", a); return s265.slice(a, b); })();
const n265 = (items265.match(/":"/g) ?? []).length;
const added = Object.keys(items).filter(k => !items265.includes(`"${k}":`));
const removed = [...items265.matchAll(/"([^"]+)":"/g)].map(m => m[1]).filter(k => !(k in items));
if (removed.length) throw new Error(`267: פריטים שירדו מהקטלוג (אסור — שאלות קיימות מצביעות עליהם): ${removed.join(', ')}`);

const fn = (body) => `create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '${body}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;`;

// ── ההזרקות לגוף portal_submit_tax_info (עוגן = שורה אחת שמופיעה פעם אחת) ──
const A1 = `    return jsonb_build_object('ok', true, 'state', 'answered', 'opened', v_opened);`;
const N1 = `    -- 267 · «משהו לא נכון?» במסך «מה כבר ידוע לנו» — הערה למשרד על התשובה לריבועים, בלי לשנות את הכרטיס
    if nullif(btrim(coalesce(p_answer->>'note', '')), '') is not null then
      update public.tax_info_asks set office_note = left(btrim(p_answer->>'note'), 2000) where id = a.id;
    end if;
${A1}`;
const A2 = `  -- 264 · «סבב אחד»: תשובה חיובית פותחת מיד את ההמשך שהוכן בתוך השאלה (prompt.onYes). קודם פותחים, ואז בודקים אם נשאר משהו פתוח.`;
const N2 = `  -- 267 · «טופס 106 מהמדינה»: כשהלקוח כתב את שם המעסיק החדש — המסמך שלו באותו שאלון נקרא בשמו (גיא, 20.10.2026).
  --   רק שאלה שעוד פתוחה; אותו אדם; אותה ישות (או מעסיק חדש בלי מזהה קבוע). השם — מה שהלקוח עצמו כתב.
  if a.item_key = 'salary.employerDetails' and v_kind = 'record' and jsonb_typeof(p_answer->'value'->'items') = 'array' then
    select string_agg(left(btrim(x->>'name'), 80), ' ומ') into v_txt from jsonb_array_elements(p_answer->'value'->'items') x
     where jsonb_typeof(x) = 'object' and nullif(btrim(coalesce(x->>'name', '')), '') is not null;
    if v_txt is not null then
      update public.tax_info_asks set prompt = jsonb_set(prompt, '{title}', to_jsonb('טופס 106 מ' || v_txt))
       where step_id = a.step_id and item_key = 'salary.form106' and state in ('published', 'unavailable')
         and (entity_ref is not distinct from a.entity_ref or (subject_role = a.subject_role and coalesce(entity_ref, '') ~ '-new-'));
    end if;
    v_txt := null;
  end if;
${A2}`;
const dq = (s) => s; // נכנס בין $blk$…$blk$ — בלי בריחה

const doBlock = (from1, to1, from2, to2, marker, check) => `do $p1$
declare
  v_def text; v_nl text;
  a1 text := $blk$${dq(from1)}
$blk$;
  n1 text := $blk$${dq(to1)}
$blk$;
  a2 text := $blk$${dq(from2)}
$blk$;
  n2 text := $blk$${dq(to2)}
$blk$;
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
${check}
  v_nl := case when position(E'\\r\\n' in v_def) > 0 then E'\\r\\n' else E'\\n' end;
  a1 := replace(a1, E'\\n', v_nl); n1 := replace(n1, E'\\n', v_nl); a2 := replace(a2, E'\\n', v_nl); n2 := replace(n2, E'\\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '${marker}: עוגן 1 לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then raise exception '${marker}: עוגן 2 לא נמצא פעם אחת'; end if;
  execute replace(replace(v_def, a1, n1), a2, n2);
end
$p1$;`;

const up = doBlock(A1, N1, A2, N2, '267', `  if position('267 · «טופס 106 מהמדינה»' in v_def) > 0 then raise notice '267: portal_submit_tax_info — כבר הוחל'; return; end if;
  if position('264 · «סבב אחד»' in v_def) = 0 then raise exception '267: 264 לא הוחלה — להחיל 264 לפני 267'; end if;`);
const down = doBlock(N1, A1, N2, A2, 'rollback 267', `  if position('267 · «טופס 106 מהמדינה»' in v_def) = 0 then raise notice 'rollback 267: לא הוחל'; return; end if;`);

writeFileSync(WT + 'supabase/267-annual-questionnaire-v2.sql', `-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 267 · שאלון הדוח השנתי — מחדש (20.10.2026; ההמחשה המאושרת: docs/proposals/2026-10-20-annual-questionnaire-v2.html)
-- ‼ נוצר ב-scripts/sql/267/build.mjs. לא לערוך ביד. חזרה: scripts/sql/267/rollback-267.sql.
-- ‼ מה כאן (רק השרת; השאר — בקוד האתר):
--   1. _tax_year_items: ${Object.keys(items).length} פריטים (${n265} ב-265; חדשים: ${added.length}): ${added.join(', ')}.
--      «מה שולם מביטוח לאומי?» — בחירה לכל אדם במקום «האם מתוך זה קיבל/ה דמי לידה?» (גיא: אלמן נשאל «דמי לידה»).
--   2. portal_submit_tax_info: (א) הערה «משהו לא נכון?» עם התשובה לריבועים ⇒ office_note; (ב) אחרי שם מעסיק חדש — המסמך
--      נקרא «טופס 106 מ{השם}» (גיא: «שהשמות יהיו יותר ברורים — 106 מ-X»). החלפת גוף בשני עוגנים, בלי סכמה ובלי נתונים.
-- ‼ «הכול נשמר כטיוטה עד שליחה» — בדף עצמו (TaxInfoFlow); השרת לא משתנה בזה: התשובות נשלחות בלחיצה «שליחה למשרד».
-- ════════════════════════════════════════════════════════════════════════════════════════════════
${fn(lit4(items))}

${up}

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select prosrc like '%267 · «טופס 106 מהמדינה»%' and prosrc like '%267 · «משהו לא נכון?»%' from pg_proc where proname = 'portal_submit_tax_info';
--   select public._tax_year_items() ? 'niBenefits.kinds';
`);
mkdirSync(WT + 'scripts/sql/267', { recursive: true });
writeFileSync(WT + 'scripts/sql/267/rollback-267.sql', `-- חזרה מ-267: רשימת הפריטים של 265, והסרת שתי ההזרקות מ-portal_submit_tax_info. נוצר ב-scripts/sql/267/build.mjs.
-- ‼ שאלות שכבר נוצרו עם המפתחות החדשים נשארות; תשובה אליהן תיכשל ב-bad_option אחרי החזרה — להחזיר רק כשאין כאלה פתוחות.
${fn(items265)}

${down}
`);
console.log(`267: ${Object.keys(items).length} items (+${added.length}: ${added.join(', ')})`);
