// בונה את supabase/286-annual-questionnaire-round2.sql ואת scripts/sql/286/rollback-286.sql — רשימת הפריטים מהקטלוג בקוד (מקור אחד).
//   node scripts/sql/286/build.mjs
// ‼ לא לערוך את שני הקבצים ביד: שינוי בקטלוג ⇒ להריץ שוב. החזרה מחזירה את רשימת 268 ומסירה את ההזרקה.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const tmp = mkdtempSync(join(tmpdir(), 'pivo-286-'));
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['esbuild', 'scripts/sql/253/items.ts', '--bundle', '--platform=node', '--alias:@src=./src', `--outfile=${join(tmp, 'items286.cjs')}`, '--log-level=error'], { cwd: WT, stdio: 'inherit', shell: process.platform === 'win32' });
const { items } = JSON.parse(execFileSync(process.execPath, [join(tmp, 'items286.cjs')], { cwd: WT }).toString());

const lit4 = (obj) => {
  const entries = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  const lines = []; for (let i = 0; i < entries.length; i += 4) lines.push('    ' + entries.slice(i, i + 4).join(','));
  return `{\n${lines.join(',\n')}}`.replace(/'/g, "''");
};
const s268 = readFileSync(WT + 'supabase/268-household-address-item.sql', 'utf8').replace(/\r\n/g, '\n');
const items268 = (() => { const at = s268.indexOf('function public._tax_year_items()'); const a = s268.indexOf("select '", at) + "select '".length; const b = s268.indexOf("'::jsonb", a); return s268.slice(a, b); })();
const n268 = (items268.match(/":"/g) ?? []).length;
const added = Object.keys(items).filter(k => !items268.includes(`"${k}":`));
const removed = [...items268.matchAll(/"([^"]+)":"/g)].map(m => m[1]).filter(k => !(k in items));
if (removed.length) throw new Error(`286: פריטים שירדו מהקטלוג (אסור — שאלות קיימות מצביעות עליהם): ${removed.join(', ')}`);
const changedKind = [...items268.matchAll(/"([^"]+)":"([^"]+)"/g)].filter(m => items[m[1]] !== m[2]).map(m => m[1]);
if (changedKind.length) throw new Error(`286: סוג פריט השתנה (${changedKind.join(', ')}) — לא בסבב הזה`);

const fn = (body) => `create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '${body}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;`;

// ── ההזרקה לגוף portal_submit_tax_info: לפני ההערה של 264 (שורה אחת שמופיעה פעם אחת) ──
const A1 = `  -- 264 · «סבב אחד»: תשובה חיובית פותחת מיד את ההמשך שהוכן בתוך השאלה (prompt.onYes). קודם פותחים, ואז בודקים אם נשאר משהו פתוח.`;
const N1 = `  -- 286 · סבב 2: «השתנה» בשורת «זה עדיין נכון?» פותח את prompt.onChanged; ערך ברשומה («לימודים וצבא») פותח את prompt.onValue
  --   (תואר ⇒ אישור זכאות, שחרור ⇒ תעודת שחרור, התמחות ⇒ אישור). צילומים כמו onYes (264) — לא נוסח מהדפדפן; פריט לא מוכר מדולג;
  --   פעם אחת לזהות (האינדקס של 229). אותו כלל בדפדפן: asks.ts › onChangedFor / onValueFor.
  declare
    v_r286 jsonb; v_x286 jsonb; v_l286 jsonb := '[]'::jsonb;
  begin
    if jsonb_typeof(a.prompt->'onChanged') = 'array'
       and (v_kind = 'changed' or (v_kind = 'record' and coalesce(p_answer->>'assertion', '') = 'changed')) then
      v_l286 := a.prompt->'onChanged';
    end if;
    if jsonb_typeof(a.prompt->'onValue') = 'array' and v_kind = 'record' and jsonb_typeof(p_answer->'value'->'items') = 'array' then
      for v_r286 in select value from jsonb_array_elements(a.prompt->'onValue') loop
        if jsonb_typeof(v_r286) = 'object' and jsonb_typeof(v_r286->'in') = 'array' and nullif(v_r286->>'field', '') is not null
           and exists (select 1 from jsonb_array_elements(p_answer->'value'->'items') x
                        where jsonb_typeof(x) = 'object' and (v_r286->'in') ? coalesce(x->>(v_r286->>'field'), '')) then
          v_l286 := v_l286 || jsonb_build_array(v_r286->'ask');
        end if;
      end loop;
    end if;
    for v_x286 in select value from jsonb_array_elements(v_l286) loop
      if jsonb_typeof(v_x286) = 'object' and (v_items ? (v_x286->>'itemKey')) and coalesce(v_x286->>'subjectRole', '') in ('client', 'spouse', 'couple')
         and jsonb_typeof(v_x286->'prompt') = 'object' and nullif(v_x286->'prompt'->>'title', '') is not null then
        insert into public.tax_info_asks (user_id, client_id, tax_year, step_id, parent_step_id, item_key, item_kind, subject_role, entity_kind, entity_ref, prompt, state)
        values (a.user_id, c.id, a.tax_year, a.step_id, a.parent_step_id, v_x286->>'itemKey', v_items->>(v_x286->>'itemKey'),
                v_x286->>'subjectRole', nullif(v_x286->>'entityKind', ''), nullif(v_x286->>'entityRef', ''), v_x286->'prompt', 'published')
        on conflict do nothing;
      end if;
    end loop;
  end;
${A1}`;

const doBlock = (from1, to1, marker, check) => `do $p1$
declare
  v_def text; v_nl text;
  a1 text := $blk$${from1}
$blk$;
  n1 text := $blk$${to1}
$blk$;
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
${check}
  v_nl := case when position(E'\\r\\n' in v_def) > 0 then E'\\r\\n' else E'\\n' end;
  a1 := replace(a1, E'\\n', v_nl); n1 := replace(n1, E'\\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '${marker}: העוגן לא נמצא פעם אחת'; end if;
  execute replace(v_def, a1, n1);
end
$p1$;`;

const up = doBlock(A1, N1, '286', `  if position('286 · סבב 2' in v_def) > 0 then raise notice '286: portal_submit_tax_info — כבר הוחל'; return; end if;
  if position('267 · «טופס 106 מהמדינה»' in v_def) = 0 then raise exception '286: 267 לא הוחלה — להחיל 267 לפני 286'; end if;`);
const down = doBlock(N1, A1, 'rollback 286', `  if position('286 · סבב 2' in v_def) = 0 then raise notice 'rollback 286: לא הוחל'; return; end if;`);

writeFileSync(WT + 'supabase/286-annual-questionnaire-round2.sql', `-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 286 · שאלון הדוח השנתי — סבב 2 (21.10.2026; ההמחשה המאושרת: docs/proposals/2026-10-21-annual-questionnaire-fixes.html)
-- ‼ נוצר ב-scripts/sql/286/build.mjs. לא לערוך ביד. חזרה: scripts/sql/286/rollback-286.sql.
-- ‼ מה כאן (רק השרת; השאר — בקוד האתר):
--   1. _tax_year_items: ${Object.keys(items).length} פריטים (${n268} ב-268; חדשים: ${added.length}): ${added.join(', ')}.
--      לכל אדם מסך «מאיפה נכנס לך כסף» (annual.whatHappened) ומסך «מה יכול להוריד לך מס» (annual.lessTax); ריבועים חדשים;
--      «לימודים וצבא» לכל אדם; מה שנפתח מתוך שורות «זה עדיין נכון?» (ילדים, כתובת).
--   2. portal_submit_tax_info: «השתנה» פותח את prompt.onChanged; ערך ברשומה פותח את prompt.onValue. החלפת גוף בעוגן אחד,
--      בלי סכמה ובלי נתונים. שאלות קיימות לא משתנות (אין בהן onChanged/onValue).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
${fn(lit4(items))}

${up}

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select prosrc like '%286 · סבב 2%' from pg_proc where proname = 'portal_submit_tax_info';
--   select public._tax_year_items() ? 'annual.lessTax', public._tax_year_items() ? 'household.studies';
`);
mkdirSync(WT + 'scripts/sql/286', { recursive: true });
writeFileSync(WT + 'scripts/sql/286/rollback-286.sql', `-- חזרה מ-286: רשימת הפריטים של 268, והסרת ההזרקה מ-portal_submit_tax_info. נוצר ב-scripts/sql/286/build.mjs.
-- ‼ שאלות שכבר נוצרו עם המפתחות החדשים נשארות; תשובה אליהן תיכשל ב-bad_option אחרי החזרה — להחזיר רק כשאין כאלה פתוחות.
${fn(items268)}

${down}
`);
console.log(`286: ${Object.keys(items).length} items (+${added.length}: ${added.join(', ')})`);
