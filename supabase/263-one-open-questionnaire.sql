-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 263 · לקוח אחד = שאלון אחד פתוח (20.10.2026)
-- ‼ ההכרעה: גיא 20.10 («כן אני מסכים», docs/plans/2026-10-20-simplicity-roadmap.md §3–§4). סרב, לא למזג.
-- ‼ תלויות: 229 (publish_tax_info), 249 (publish_case_changes §5א), 254 (ensure_tax_file_intake עם שאלות).
-- חזרה: scripts/sql/263/rollback-263.sql.
--
-- מה כאן:
--   1. _open_questionnaire_of(client, except) — השאלון שפתוח ללקוח עכשיו (null כשאין): «השלמת מידע» (info_collection)
--      שלא נסגרה ושיש בה שאלה אחת לפחות שמחכה ללקוח (tax_info_asks.state = 'published'), או שאלון קליטה ישן
--      (intake_questionnaire) שפורסם ולא נסגר. פנימית — חסומה ל-anon/authenticated.
--   2. open_questionnaire_of(client, except) — אותה תשובה למשרד (בעלות כמו כל פעולות שנת המס: _tax_year_client),
--      כדי שהמסך יבדוק לפני שהוא יוצר בקשה — ולא תישאר בקשה ריקה.
--   3. publish_tax_info — שאלון שעוד לא נחשף ללקוח (אין בו שאלה מפורסמת) ויש ללקוח שאלון אחר פתוח ⇒
--      {ok:false, error:'questionnaire_open', openStepId, openTitle} לפני כל שינוי. הוספת שאלות לאותו שאלון — מותרת.
--      נעילה לפי לקוח: שני פרסומים במקביל לא עוקפים זה את זה.
--   4. publish_case_changes §5א — שאלון שסורב נשאר טיוטה, וכל השאר בדף מתפרסם; התשובה מוסיפה questionnaireOpen.
--   ‼ ensure_tax_file_intake(text,jsonb) (254) כבר זורק חריגה על כל כשל פרסום ⇒ הכול מתגלגל אחורה (אין קליטה ריקה),
--     והקוד 'questionnaire_open' מגיע לדפדפן כהודעת השגיאה. לא שונתה.
-- ‼ הזרקה לגוף החי — כל עוגן שורה אחת, פעם אחת בדיוק; החלה חוזרת מדלגת לפי הסימון «263 ·».
-- ‼ בלי סכמה, בלי שינוי בנתונים, בלי מיילים. שני שאלונים שכבר פתוחים היום (נתונים ישנים) — נשארים; רק חדש נחסם.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if not exists (select 1 from pg_proc where proname = 'publish_case_changes' and prosrc like '%5א. 249 ·%') then
    raise exception '263: 249 לא הוחלה — להחיל 249 לפני 263';
  end if;
  if to_regprocedure('public.ensure_tax_file_intake(text, jsonb)') is null then
    raise exception '263: 254 לא הוחלה — להחיל 254 לפני 263';
  end if;
end
$guard$;

-- ── 1. השאלון הפתוח של הלקוח ──
-- p_except_info: מזהה «השלמת מידע» שמפרסמים עכשיו, או מזהה הבקשה שהיא שייכת לה (הדוח/הקליטה) — שניהם לא נספרים.
create or replace function public._open_questionnaire_of(p_client_id text, p_except_info text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_strip_nulls(jsonb_build_object(
              'infoStepId', i.id, 'parentStepId', par.id, 'stepId', coalesce(par.id, i.id),
              'stepType', coalesce(par.step_type, i.step_type),
              'taxYear', coalesce(par.payload->'taxYear', i.payload->'taxYear'),
              'asOfDate', coalesce(par.payload->>'asOfDate', i.payload->>'asOfDate'),
              'title', coalesce(nullif(par.payload->>'title', ''), nullif(i.payload->>'title', ''), 'שאלון')))
       from public.onboarding_steps i
       left join public.onboarding_steps par on par.id = i.payload->>'parentStepId'
      where i.client_id = p_client_id and i.step_type = 'info_collection'
        and i.status <> all (array['completed','verified','skipped','cancelled','failed'])
        and (p_except_info is null or (i.id <> p_except_info and coalesce(i.payload->>'parentStepId', '') <> p_except_info))
        and exists (select 1 from public.tax_info_asks a where a.step_id = i.id and a.state = 'published')
      order by i.published_at nulls last, i.created_at
      limit 1),
    (select jsonb_build_object('stepId', q.id, 'stepType', q.step_type,
              'title', coalesce(nullif(q.payload->>'clientTitle', ''), nullif(q.payload->>'title', ''), 'עדכון סטטוס מס'))
       from public.onboarding_steps q
      where q.client_id = p_client_id and q.step_type = 'intake_questionnaire' and q.published_at is not null
        and q.status <> all (array['completed','verified','skipped','cancelled','failed'])
        and (p_except_info is null or q.id <> p_except_info)
      order by q.created_at
      limit 1));
$$;
revoke all on function public._open_questionnaire_of(text, text) from public, anon, authenticated;

-- ── 2. אותה תשובה למשרד — בדיקה מקדימה במסך ──
create or replace function public.open_questionnaire_of(p_client_id text, p_except_step text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._tax_year_client(p_client_id);
  return public._open_questionnaire_of(p_client_id, p_except_step);
end $$;
revoke all on function public.open_questionnaire_of(text, text) from public, anon;
grant execute on function public.open_questionnaire_of(text, text) to authenticated;

-- ── 3. publish_tax_info — שאלון שני לא נחשף ──
do $p1$
declare
  v_def text; v_nl text;
  a1 text := $blk$declare s public.onboarding_steps%rowtype; v_n int;$blk$;
  n1 text := $blk$declare s public.onboarding_steps%rowtype; v_n int; v_open jsonb; /* 263 · שאלון אחד פתוח */$blk$;
  a2 text := $blk$  perform public._tax_year_client(s.client_id);$blk$;
  n2 text := $blk$
  -- ‼ 263 · לקוח אחד = שאלון אחד פתוח: חשיפה ראשונה של שאלון (יש טיוטה, אין עדיין שאלה מפורסמת) כשיש ללקוח שאלון
  --   אחר שמחכה לו ⇒ סירוב לפני כל שינוי. שאלות נוספות לשאלון שכבר בדף — מותרות. הנעילה: שני פרסומים במקביל לא
  --   רואים זה את זה בלעדיה.
  if exists (select 1 from public.tax_info_asks where step_id = s.id and state = 'draft')
     and not exists (select 1 from public.tax_info_asks where step_id = s.id and state = 'published') then
    perform pg_advisory_xact_lock(hashtext('one_questionnaire:' || s.client_id));
    v_open := public._open_questionnaire_of(s.client_id, s.id);
    if v_open is not null then
      return jsonb_build_object('ok', false, 'error', 'questionnaire_open',
        'openStepId', v_open->>'stepId', 'openTitle', v_open->>'title', 'openInfoStepId', v_open->>'infoStepId');
    end if;
  end if;$blk$;
begin
  select pg_get_functiondef('public.publish_tax_info(text)'::regprocedure) into v_def;
  if position('263 · שאלון אחד פתוח' in v_def) > 0 then raise notice '263: publish_tax_info — כבר הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  n2 := replace(n2, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '263: עוגן ההצהרות ב-publish_tax_info לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then raise exception '263: עוגן בדיקת הבעלות ב-publish_tax_info לא נמצא פעם אחת'; end if;
  execute replace(replace(v_def, a1, n1), a2, a2 || n2);
end
$p1$;

-- ── 4. publish_case_changes §5א — שאלון שסורב נשאר טיוטה; כל השאר מתפרסם ──
do $p2$
declare
  v_def text; v_nl text;
  a1 text := $blk$  v_asks    int := 0;$blk$;
  n1 text := $blk$
  v_qopen   jsonb := '[]'::jsonb; -- 263 · שאלון שני שלא נחשף$blk$;
  a2 text := $blk$    r := public.publish_tax_info(s.id);$blk$;
  n2 text := $blk$
    -- 263 · יש ללקוח שאלון אחר פתוח ⇒ השאלון הזה נשאר טיוטה (לא נחשף), ושאר הדף מתפרסם כרגיל
    if coalesce(r->>'error', '') = 'questionnaire_open' then
      v_qopen := v_qopen || jsonb_build_array(jsonb_build_object('infoStepId', s.id, 'openStepId', r->>'openStepId', 'openTitle', r->>'openTitle'));
    end if;$blk$;
  a3 text := $blk$    'removed', v_removed, 'draftsExposed', v_exposed, 'autoQueued', v_auto, 'taxQuestionsPublished', v_asks);$blk$;
  n3 text := $blk$    'removed', v_removed, 'draftsExposed', v_exposed, 'autoQueued', v_auto, 'taxQuestionsPublished', v_asks)
    || case when jsonb_array_length(v_qopen) > 0 then jsonb_build_object('questionnaireOpen', v_qopen) else '{}'::jsonb end; -- 263 ·$blk$;
begin
  select pg_get_functiondef('public.publish_case_changes(text)'::regprocedure) into v_def;
  if position('263 · שאלון שני שלא נחשף' in v_def) > 0 then raise notice '263: publish_case_changes — כבר הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  n1 := replace(n1, E'\n', v_nl); n2 := replace(n2, E'\n', v_nl); n3 := replace(n3, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '263: עוגן v_asks ב-publish_case_changes לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then raise exception '263: עוגן הקריאה ל-publish_tax_info ב-§5א לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a3, ''))) / length(a3) <> 1 then raise exception '263: עוגן התשובה של publish_case_changes לא נמצא פעם אחת'; end if;
  execute replace(replace(replace(v_def, a1, a1 || n1), a2, a2 || n2), a3, n3);
end
$p2$;

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select prosrc like '%263 · שאלון אחד פתוח%' from pg_proc where proname = 'publish_tax_info';        -- true
--   select prosrc like '%263 · שאלון שני שלא נחשף%' from pg_proc where proname = 'publish_case_changes'; -- true
--   select has_function_privilege('anon', 'public.open_questionnaire_of(text,text)', 'execute');         -- false
--   select has_function_privilege('authenticated', 'public._open_questionnaire_of(text,text)', 'execute'); -- false
