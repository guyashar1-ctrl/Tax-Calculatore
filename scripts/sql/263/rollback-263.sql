-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- התאוששות מ-263 — «לקוח אחד = שאלון אחד פתוח»
-- ‼ מסיר את ההזרקות מהגוף החי (אותן מחרוזות כמו ב-supabase/263-one-open-questionnaire.sql) ומוחק את שתי הפונקציות.
-- ‼ נתונים: לא נגעו. שאלונים שסורבו נשארו טיוטה — אחרי החזרה «פרסם בדף» יפרסם אותם כמו לפני 263.
-- ‼ יחד עם החזרת האתר (הדפדפן קורא ל-open_questionnaire_of; בלעדיה הבדיקה המקדימה לא חוסמת — השרת הוא השער).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
begin;

do $r1$
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
  if position('263 · שאלון אחד פתוח' in v_def) = 0 then raise notice 'rollback 263: publish_tax_info — לא הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  n2 := replace(n2, E'\n', v_nl);
  if position(a2 || n2 in v_def) = 0 then raise exception 'rollback 263: ההזרקה ב-publish_tax_info שונתה מאז — לא מחזירים בעיוורון'; end if;
  execute replace(replace(v_def, a2 || n2, a2), n1, a1);
end
$r1$;

do $r2$
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
  if position('263 · שאלון שני שלא נחשף' in v_def) = 0 then raise notice 'rollback 263: publish_case_changes — לא הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  n1 := replace(n1, E'\n', v_nl); n2 := replace(n2, E'\n', v_nl); n3 := replace(n3, E'\n', v_nl);
  if position(a1 || n1 in v_def) = 0 or position(a2 || n2 in v_def) = 0 or position(n3 in v_def) = 0 then
    raise exception 'rollback 263: ההזרקה ב-publish_case_changes שונתה מאז — לא מחזירים בעיוורון';
  end if;
  execute replace(replace(replace(v_def, n3, a3), a2 || n2, a2), a1 || n1, a1);
end
$r2$;

drop function if exists public.open_questionnaire_of(text, text);
drop function if exists public._open_questionnaire_of(text, text);
commit;

-- אימות: select prosrc like '%263 ·%' from pg_proc where proname in ('publish_tax_info','publish_case_changes'); -- false, false
