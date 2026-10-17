// בונה את supabase/253-intake-closed-lists.sql ואת scripts/sql/253/rollback-253.sql מהקטלוג בקוד — מקור אחד.
//   node scripts/sql/253/build-items.mjs            (מריץ esbuild על items.ts בעצמו)
// ‼ לא לערוך את שני הקבצים ביד: שינוי בקטלוג (intakeCatalog.ts / catalog.ts) או ברשימות (src/data/institutions.ts)
//   ⇒ להריץ שוב. הרשימה של 249 (לחזרה) נקראת מהקובץ של 249.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const tmp = mkdtempSync(join(tmpdir(), 'pivo-253-'));
execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['esbuild', 'scripts/sql/253/items.ts', '--bundle', '--platform=node', '--alias:@src=./src', `--outfile=${join(tmp, 'items253.cjs')}`, '--log-level=error'], { cwd: WT, stdio: 'inherit', shell: process.platform === 'win32' });
const { items, institutions } = JSON.parse(execFileSync(process.execPath, [join(tmp, 'items253.cjs')], { cwd: WT }).toString());

const lit4 = (obj) => {
  const entries = Object.entries(obj).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  const lines = []; for (let i = 0; i < entries.length; i += 4) lines.push('    ' + entries.slice(i, i + 4).join(','));
  return `{\n${lines.join(',\n')}}`.replace(/'/g, "''");
};
const instLit = Object.entries(institutions).map(([list, m]) => `    ${JSON.stringify(list)}:${JSON.stringify(m)}`).join(',\n');
const s249 = readFileSync(WT + 'supabase/249-publish-page-publishes-tax-questions.sql', 'utf8').replace(/\r\n/g, '\n');
const items249 = (() => { const at = s249.indexOf('function public._tax_year_items()'); const a = s249.indexOf("select '", at) + "select '".length; const b = s249.indexOf("'::jsonb", a); return s249.slice(a, b); })();

// ── ההזרקות (מחרוזות זהות בקובץ ובחזרה) ──
const A_KINDS = `'record' /* 241 · רשומה */)`;
const N_KINDS = `'record' /* 241 · רשומה */,'multi','entity' /* 253 · רשת ושל מי */)`;
const A_DECL = `  v_ins  jsonb;\n`;
const N_DECL = `  v_ins  jsonb;
  -- 253 · רשת ושל מי: הצהרות
  v_items jsonb := public._tax_year_items();
  v_sel  jsonb; v_o jsonb; v_yes boolean; v_per2 jsonb; v_n int; v_opened int := 0;
  v_out  jsonb; v_it jsonb; v_f jsonb; v_val text; v_list jsonb; v_clean jsonb;
`;
const A_BLOCK = `  -- 241 · רשומה מובנית (ילדים, בנק, כתובת, מעסיקים, תחולה…) — עובדה ממתינה, לא כתיבה לכרטיס\n`;
const N_BLOCK = `  -- 253 · מסך הרשת «סמנו מה יש לכם»: עובדה כן/לא לכל אריח (בתפקיד שלו), ושאלות ההמשך של מה שסומן נפתחות מיד (מפורסמות)
  if v_kind = 'multi' then
    if coalesce(a.prompt->'input'->>'kind', '') <> 'multi' or jsonb_typeof(p_answer->'selected') is distinct from 'array' then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
    v_sel := p_answer->'selected';
    if exists (select 1 from jsonb_array_elements(v_sel) z where jsonb_typeof(z) <> 'string'
                  or not exists (select 1 from jsonb_array_elements(a.prompt->'input'->'options') o where o->>'key' = z #>> '{}')) then
      return jsonb_build_object('ok', false, 'error', 'bad_option');
    end if;
    for v_o in select value from jsonb_array_elements(a.prompt->'input'->'options') loop
      if not (v_items ? (v_o->>'key')) or coalesce(v_o->>'role', '') not in ('client','spouse','couple') then return jsonb_build_object('ok', false, 'error', 'bad_option'); end if;
      v_yes := v_sel ? (v_o->>'key');
      v_per2 := case when v_ins->>'purpose' in ('wealth', 'intake')
        then jsonb_build_object('periodKind', 'as_of', 'from', null, 'to', (v_ins->>'asOfDate')::date, 'basis', 'actual')
        else public._tax_answer_period(v_ins->>'purpose', (v_ins->>'cutoffMonth')::int, a.tax_year, v_o->>'key', v_items->>(v_o->>'key')) end;
      insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, period_kind, period_from, period_to, answer, value, basis, source, request_id, ask_id, status)
      values (a.user_id, c.id, a.tax_year, v_o->>'key', v_o->>'role', v_per2->>'periodKind', (v_per2->>'from')::date, (v_per2->>'to')::date,
              case when v_yes then 'value' else 'no' end, case when v_yes then 'true'::jsonb end, v_per2->>'basis', 'portal', a.parent_step_id, a.id, 'pending');
      -- שאלת ההמשך היא צילום שנשמר בשאלה בזמן הכנתה במשרד — לא נוסח מהדפדפן; פעם אחת לזהות (האינדקס של 229)
      if v_yes and (v_o ? 'followUp') and (v_items ? (v_o->'followUp'->>'itemKey')) then
        insert into public.tax_info_asks (user_id, client_id, tax_year, step_id, parent_step_id, item_key, item_kind, subject_role, entity_kind, entity_ref, prompt, state)
        values (a.user_id, c.id, a.tax_year, a.step_id, a.parent_step_id, v_o->'followUp'->>'itemKey', v_items->>(v_o->'followUp'->>'itemKey'),
                v_o->'followUp'->>'subjectRole', nullif(v_o->'followUp'->>'entityKind', ''), nullif(v_o->'followUp'->>'entityRef', ''), v_o->'followUp'->'prompt', 'published')
        on conflict do nothing;
        get diagnostics v_n = row_count;
        v_opened := v_opened + v_n;
      end if;
    end loop;
    update public.tax_info_asks set state = 'answered', answered_at = now(), saved_draft = null where id = a.id;
    if not exists (select 1 from public.tax_info_asks where step_id = a.step_id and state = 'published') then
      update public.onboarding_steps set status = 'in_progress', ball = 'me', updated_at = now() where id = a.step_id;
    end if;
    return jsonb_build_object('ok', true, 'state', 'answered', 'opened', v_opened);
  end if;
  -- 253 · «של מי / איפה»: שדות סגורים — «איפה» רק מתוך הרשימה (_tax_institutions), «של מי» client/spouse/both, בחירה מהאפשרויות; שם — עד 120 תווים
  if v_kind = 'entity' then
    if coalesce(a.prompt->'input'->>'kind', '') <> 'entity' or jsonb_typeof(p_answer->'items') is distinct from 'array'
       or jsonb_array_length(p_answer->'items') not between 1 and 20 then return jsonb_build_object('ok', false, 'error', 'bad_entity'); end if;
    v_out := '[]'::jsonb;
    for v_it in select value from jsonb_array_elements(p_answer->'items') loop
      if jsonb_typeof(v_it) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_entity'); end if;
      v_clean := '{}'::jsonb;
      for v_f in select value from jsonb_array_elements(coalesce(a.prompt->'input'->'spec'->'fields', '[]'::jsonb)) loop
        v_val := nullif(btrim(coalesce(v_it->>(v_f->>'key'), '')), '');
        if v_val is null then
          if coalesce((v_f->>'required')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'bad_entity', 'field', v_f->>'key'); end if;
          continue;
        end if;
        if v_f->>'type' = 'who' then
          if v_val not in ('client', 'spouse', 'both') then return jsonb_build_object('ok', false, 'error', 'bad_entity', 'field', v_f->>'key'); end if;
        elsif v_f->>'type' = 'list' then
          v_list := public._tax_institutions()->(v_f->>'list');
          if v_list is null or not (v_list ? v_val) then return jsonb_build_object('ok', false, 'error', 'not_in_list', 'field', v_f->>'key'); end if;
          v_clean := v_clean || jsonb_build_object((v_f->>'key') || 'Label', v_list->>v_val);
        elsif v_f->>'type' = 'choice' then
          if not exists (select 1 from jsonb_array_elements(coalesce(v_f->'options', '[]'::jsonb)) o where o->>'value' = v_val) then return jsonb_build_object('ok', false, 'error', 'bad_entity', 'field', v_f->>'key'); end if;
        elsif v_f->>'type' = 'name' then
          if length(v_val) > 120 then return jsonb_build_object('ok', false, 'error', 'bad_entity', 'field', v_f->>'key'); end if;
        else
          return jsonb_build_object('ok', false, 'error', 'bad_entity', 'field', v_f->>'key');
        end if;
        v_clean := v_clean || jsonb_build_object(v_f->>'key', v_val);
      end loop;
      v_out := v_out || jsonb_build_array(v_clean);
    end loop;
    insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, entity_kind, entity_ref, period_kind, period_from, period_to, answer, value, basis, source, request_id, ask_id, status)
    values (a.user_id, c.id, a.tax_year, a.item_key, a.subject_role, a.entity_kind, a.entity_ref, v_per->>'periodKind', (v_per->>'from')::date, (v_per->>'to')::date,
            'value', jsonb_build_object('items', v_out), v_per->>'basis', 'portal', a.parent_step_id, a.id, 'pending');
    update public.tax_info_asks set state = 'answered', answered_at = now(), saved_draft = null where id = a.id;
    if not exists (select 1 from public.tax_info_asks where step_id = a.step_id and state = 'published') then
      update public.onboarding_steps set status = 'in_progress', ball = 'me', updated_at = now() where id = a.step_id;
    end if;
    return jsonb_build_object('ok', true, 'state', 'answered');
  end if;

`;

const sqlStr = (s) => `$blk$${s}$blk$`;
const head = `-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 253 · «בקשה אחת לתיק המס» שלב 2 — השאלון מהתיק: רשימות סגורות, מסך הרשת, «של מי / איפה» (16.10.2026)
-- ‼ נוצר ב-scripts/sql/253/build-items.mjs מהקטלוג בקוד (catalog.ts, intakeCatalog.ts, src/data/institutions.ts). לא לערוך ביד.
-- ‼ חזרה: scripts/sql/253/rollback-253.sql (נוצר באותו סקריפט). בדיקה בבידוד: scripts/sql/253/test-253.pglite.mjs.
-- ‼ תלויות: 229, 230, 236, 241 (ההזרקות מזוהות לפי הסימון «241 · רשומה»). עצמאי מ-252 (שלב 1 — פתיחת היכרות ופרסום).
--
-- מה כאן:
--   1. _tax_year_items — הרשימה המלאה מהקטלוג (חדשים: intake.whatYouHave, intake.cryptoDetails, intake.allowanceDetails, intake.insuranceDetails).
--      ‼ אף מפתח לא הוסר: פריטי המסמך של ההיכרות נשארים (זהות ראיות שנשמרו) — הם רק לא נשאלים יותר (purposes בקוד).
--   2. _tax_institutions — הרשימות הסגורות (מזהה ← שם) שהשרת מאמת מולן את «איפה».
--   3. add_tax_info_asks — סוגי קלט חדשים 'multi' (מסך הרשת) ו-'entity' («של מי / איפה»).
--   4. portal_submit_tax_info — תשובת 'multi': עובדה כן/לא לכל אריח בתפקיד שלו + פתיחת שאלות ההמשך (צילום שנשמר בשאלה);
--      תשובת 'entity': אימות כל שדה (איפה — מהרשימה; של מי; בחירה; שם עד 120) ושמירת {items} עם שם הגוף לצד המזהה.
-- ‼ הזרקות לגוף החי — כל עוגן שורה אחת, פעם אחת בדיוק; החלה חוזרת מדלגת לפי הסימון «253 ·».
-- ════════════════════════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if not exists (select 1 from pg_proc where proname = 'portal_submit_tax_info' and prosrc like '%241 · רשומה%')
     or not exists (select 1 from pg_proc where proname = 'add_tax_info_asks' and prosrc like '%241 · רשומה%') then
    raise exception '253: 241 לא הוחלה — להחיל 229, 230, 236, 241 לפני 253';
  end if;
end
$guard$;

-- ── 1. רשימת הפריטים — מהקטלוג בקוד ──
create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '${lit4(items)}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;

-- ── 2. הרשימות הסגורות (src/data/institutions.ts) — מזהה ← שם, לכל רשימה ──
create or replace function public._tax_institutions()
returns jsonb language sql immutable set search_path = public as $$
  select '{
${instLit.replace(/'/g, "''")}}'::jsonb
$$;
revoke all on function public._tax_institutions() from public, anon, authenticated;

-- ── 3. add_tax_info_asks — סוגי קלט ──
do $p1$
declare v_def text;
begin
  select pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) into v_def;
  if position('253 · רשת ושל מי' in v_def) > 0 then raise notice '253: add_tax_info_asks — כבר הוחל'; return; end if;
  if (length(v_def) - length(replace(v_def, ${sqlStr(A_KINDS)}, ''))) / length(${sqlStr(A_KINDS)}) <> 1 then raise exception '253: עוגן סוגי הקלט ב-add_tax_info_asks לא נמצא פעם אחת'; end if;
  execute replace(v_def, ${sqlStr(A_KINDS)}, ${sqlStr(N_KINDS)});
end
$p1$;

-- ── 4. portal_submit_tax_info — multi ו-entity ──
do $p2$
declare
  v_def text; v_nl text;
  a1 text := ${sqlStr(A_DECL)};
  n1 text := ${sqlStr(N_DECL)};
  a2 text := ${sqlStr(A_BLOCK)};
  n2 text := ${sqlStr(N_BLOCK)};
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  if position('253 · מסך הרשת' in v_def) > 0 then raise notice '253: portal_submit_tax_info — כבר הוחל'; return; end if;
  v_nl := case when position(E'\\r\\n' in v_def) > 0 then E'\\r\\n' else E'\\n' end;
  a1 := replace(a1, E'\\n', v_nl); n1 := replace(n1, E'\\n', v_nl); a2 := replace(a2, E'\\n', v_nl); n2 := replace(n2, E'\\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '253: עוגן ההצהרות (v_ins) לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then raise exception '253: עוגן הבלוק של 241 לא נמצא פעם אחת'; end if;
  execute replace(replace(v_def, a1, n1), a2, n2 || a2);
end
$p2$;

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select proname, prosrc like '%253 ·%' from pg_proc where proname in ('add_tax_info_asks','portal_submit_tax_info');
--   select count(*) from jsonb_object_keys(public._tax_year_items());  -- = ${Object.keys(items).length}
`;

const rollback = `-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- התאוששות מ-253 — נוצר ב-scripts/sql/253/build-items.mjs (לא לערוך ביד)
-- ‼ הופך את שתי ההזרקות על הגוף החי (אותן מחרוזות), מוחק את _tax_institutions ומחזיר את רשימת הפריטים של 249.
-- ‼ נתונים: שום תשובה לא נמחקת. עובדות של מסך הרשת (כן/לא לכל אריח) ושל «של מי / איפה» ({items}) נשארות — המשרד
--   רואה אותן כטקסט; שאלות מסוג multi/entity שעוד לא נענו — מבוטלות (הדף הישן לא יודע להציג אותן).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
begin;
update public.tax_info_asks set state = 'cancelled' where state in ('draft', 'published') and prompt->'input'->>'kind' in ('multi', 'entity');

do $r2$
declare
  v_def text; v_nl text;
  a1 text := ${sqlStr(A_DECL)};
  n1 text := ${sqlStr(N_DECL)};
  a2 text := ${sqlStr(A_BLOCK)};
  n2 text := ${sqlStr(N_BLOCK)};
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  if position('253 · מסך הרשת' in v_def) = 0 then raise notice '253↩: portal_submit_tax_info — אין מה להחזיר'; return; end if;
  v_nl := case when position(E'\\r\\n' in v_def) > 0 then E'\\r\\n' else E'\\n' end;
  a1 := replace(a1, E'\\n', v_nl); n1 := replace(n1, E'\\n', v_nl); a2 := replace(a2, E'\\n', v_nl); n2 := replace(n2, E'\\n', v_nl);
  if (length(v_def) - length(replace(v_def, n1, ''))) / length(n1) <> 1 then raise exception '253↩: ההצהרות של 253 לא נמצאו פעם אחת (הגוף השתנה אחרי 253?)'; end if;
  if (length(v_def) - length(replace(v_def, n2 || a2, ''))) / length(n2 || a2) <> 1 then raise exception '253↩: הבלוק של 253 לא נמצא פעם אחת (הגוף השתנה אחרי 253?)'; end if;
  execute replace(replace(v_def, n2 || a2, a2), n1, a1);
end
$r2$;

do $r1$
declare v_def text;
begin
  select pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) into v_def;
  if position('253 · רשת ושל מי' in v_def) = 0 then raise notice '253↩: add_tax_info_asks — אין מה להחזיר'; return; end if;
  execute replace(v_def, ${sqlStr(N_KINDS)}, ${sqlStr(A_KINDS)});
end
$r1$;

drop function if exists public._tax_institutions();

-- רשימת הפריטים של 249 (מהקובץ של 249, מילה במילה)
create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '${items249}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;
commit;
`;
writeFileSync(WT + 'supabase/253-intake-closed-lists.sql', head);
writeFileSync(WT + 'scripts/sql/253/rollback-253.sql', rollback);
writeFileSync(join(tmp, 'items253.json'), JSON.stringify({ items, institutions }));
console.log(`253: ${Object.keys(items).length} פריטים · ${Object.keys(institutions).length} רשימות (${Object.values(institutions).reduce((n, m) => n + Object.keys(m).length, 0)} ערכים) · items253.json: ${join(tmp, 'items253.json')}`);
