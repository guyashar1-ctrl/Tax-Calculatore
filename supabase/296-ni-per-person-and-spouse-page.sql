-- 296 · ביטוח לאומי לכל אדם גם בקליטה ראשונה, ובן/בת זוג בלי מייל — דרך הדף.
-- (ליאת ואוריה, 25.10.2026; ההמחשה: docs/proposals/2026-10-25-rep-stamp-and-ni-per-person.html)
--
-- עד היום:
--   · בקשת ייצוג שנפתחה מהצעת מחיר (קליטה ראשונה) לא יצרה שלב «ייצוג ברשות» לב"ל.
--     המסלול חי רק ב-execution של הבקשה, ולכן ב«בקשות» הוא הופיע כשורת קריאה בלבד,
--     ובדף הלקוח — בכלל לא (פריט ni_approval נולד רק משלב).
--   · הוראות האישור לבן/בת הזוג יצאו רק במייל ייעודי לכתובת שלו/ה. בלי כתובת — כלום.
-- מעכשיו:
--   1. ברגע שיש אסמכתא בביצוע (ידנית או מהעובד) — נפתח שלב לאותו אדם, אם אין לו כבר
--      שלב פתוח (זהות: כרטיס + סוג + רשות + נושא). זה ה«שלב הבא» שרשום ביסודות
--      (PRODUCT-REQUESTS-WORKFLOW-FOUNDATION, «קליטה ראשונה»). אדם שכבר אישר — לא נפתח.
--   2. בן/בת זוג בלי מייל משלו, עם אסמכתא שההוראות שלה טרם יצאו — האישור מופיע בדף
--      של בעל הכרטיס («מה צריך מ{שם}»), נכלל ב«שלח בקשות» של הדף, ולא כקבוצה נפרדת
--      שדורשת כתובת. (הכרעת גיא 25.10: מייל הדף לבעלים נחשב שליחת הוראות לבן/בת הזוג.)
--   3. «ההוראות נשלחו» נרשם לבן/בת הזוג רק כשמייל דף שנשלח בפועל נשא את פריט האישור
--      שלו/ה ואת מספר האסמכתא שלו/ה (כמו 239 לחתימה). פרסום בדף אינו «נשלח».
-- ‼ אין כאן שליחה, ואין שינוי במה שרואה מי שיש לו מייל משלו.
-- ‼ הוחל כהזרקה לגופים החיים (_r296_patch) — כמו 239, ומאותה סיבה.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._r296_patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_n int;
begin
  -- ‼ הקובץ עשוי להגיע עם CRLF (git ב-Windows), והגופים החיים הם LF — העוגנים בלי \r.
  p_old := replace(p_old, E'\r', '');
  p_new := replace(p_new, E'\r', '');
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if position(p_new in v_def) > 0 then return; end if;   -- כבר הוחל
  if v_n <> 1 then
    raise exception '296: anchor count % (expected 1) in %: %', v_n, p_fn, left(p_old, 120);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- ── 1 · בן/בת זוג שהאישור שלו/ה עובר דרך הדף ─────────────────────────────────
-- ‼ פונקציה טהורה של השורות (גם לצפייה בספרייה, שבה השלב אינו במסד).
create or replace function public._ni_spouse_page_ready(s public.onboarding_steps, c public.clients,
                                                        req public.representation_requests)
returns boolean language sql stable set search_path to 'public' as $function$
  select coalesce(
    s.step_type = 'authority_representation'
    and s.payload->>'authority' = 'national_insurance'
    and s.payload->>'subjectRole' = 'spouse'
    and s.status in ('pending', 'in_progress')
    and nullif(trim(coalesce(c.spouse_email, '')), '') is null
    and req.id is not null
    and req.id = s.payload->>'representationRequestId'
    and nullif(req.execution->'nationalInsuranceSpouse'->>'referenceNumber', '') is not null
    and nullif(req.execution->'nationalInsuranceSpouse'->>'instructionsSentAt', '') is null
    and nullif(req.execution->'nationalInsuranceSpouse'->>'confirmedAt', '') is null
    and (nullif(req.execution->'nationalInsuranceSpouse'->>'deadline', '') is null
         or (req.execution->'nationalInsuranceSpouse'->>'deadline')::date >= current_date),
    false);
$function$;

create or replace function public._ni_spouse_page_ready(p_step_id text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
declare
  s   public.onboarding_steps;
  c   public.clients;
  req public.representation_requests;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null or s.step_type <> 'authority_representation' then return false; end if;
  select * into c from public.clients where id = s.client_id;
  select * into req from public.representation_requests where id = s.payload->>'representationRequestId';
  return public._ni_spouse_page_ready(s, c, req);
end;
$function$;

revoke execute on function public._ni_spouse_page_ready(public.onboarding_steps, public.clients, public.representation_requests) from public, anon, authenticated;
revoke execute on function public._ni_spouse_page_ready(text) from public, anon, authenticated;

-- ── 2 · שלב לכל אדם שיש לו אסמכתא (קליטה ראשונה) ─────────────────────────────
create or replace function public._ensure_ni_steps_from_execution(p_request_id text)
returns int language plpgsql security definer set search_path to 'public' as $function$
declare
  r       public.representation_requests;
  c       public.clients;
  v_role  text;
  v_track jsonb;
  v_name  text;
  v_eng   text;
  v_sort  int;
  v_id    text;
  v_made  int := 0;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null or r.linked_client_id is null then return 0; end if;
  select * into c from public.clients where id = r.linked_client_id;
  -- ‼ רק הבקשה הנוכחית של הכרטיס — בקשה ישנה אינה פותחת עבודה חדשה.
  if c.id is null or c.representation_request_id is distinct from r.id then return 0; end if;

  foreach v_role in array array['client', 'spouse'] loop
    v_track := r.execution -> (case when v_role = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end);
    continue when jsonb_typeof(v_track) is distinct from 'object';
    continue when nullif(v_track->>'referenceNumber', '') is null;
    continue when nullif(v_track->>'confirmedAt', '') is not null;   -- אישר — אין עבודה פתוחה
    -- ‼ רק מי שברשימת ב"ל (אותו כלל כמו ni_targets_of). אדם שבוטל אינו ברשימה.
    continue when not coalesce((select bool_or(x = v_role)
                                  from jsonb_array_elements_text(
                                         public.ni_targets_of(c.authority_representations -> 'nationalInsurance')) x), false);
    if v_role = 'spouse' then
      continue when coalesce(c.family_status, '') <> 'married' or c.spouse_client_id is not null
                    or coalesce(c.spouse_represented_elsewhere, false);
    end if;
    -- זהות העבודה: שלב פתוח לאותו נושא (כל בקשה), או כל שלב שאינו מבוטל של הבקשה הזאת.
    continue when exists (
      select 1 from public.onboarding_steps o
       where o.client_id = c.id and o.step_type = 'authority_representation'
         and o.payload->>'authority' = 'national_insurance'
         and coalesce(o.payload->>'subjectRole', 'client') = v_role
         and (o.status not in ('completed', 'verified', 'skipped', 'cancelled')
              or (o.status <> 'cancelled' and o.payload->>'representationRequestId' = r.id)));

    v_name := case when v_role = 'spouse'
      then coalesce(nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), ''),
                    nullif(trim(coalesce(c.spouse_name, '')), ''), 'בן/בת הזוג')
      else nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') end;
    select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
    select coalesce(max(sort_order), 0) + 1 into v_sort
      from public.onboarding_steps where client_id = c.id and status <> 'cancelled';

    -- אותה צורה כמו request_authority_representation (157).
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
       sort_order, published_at, required_for_close, payload)
    values
      (c.user_id, v_eng, c.id, 'authority_representation', 'authorities', 'person', 'pending', 'me',
       v_sort, now(), false,
       jsonb_build_object('authority', 'national_insurance', 'subjectRole', v_role, 'subjectName', coalesce(v_name, ''),
                          'representationRequestId', r.id,
                          'title', 'ייצוג בביטוח לאומי — ' || coalesce(v_name, '')))
    returning id into v_id;

    perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'system',
      'נפתחה בקשת ייצוג בביטוח לאומי עבור ' || coalesce(v_name, '') || ' (האסמכתא התקבלה)',
      jsonb_build_object('authority', 'national_insurance', 'subjectRole', v_role, 'source', 'execution'));
    v_made := v_made + 1;
  end loop;
  return v_made;
end;
$function$;

revoke execute on function public._ensure_ni_steps_from_execution(text) from public, anon, authenticated;

create or replace function public.tg_sync_authority_rep_from_execution()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.linked_client_id is not null then
    -- 296 · קליטה ראשונה: האסמכתא פותחת שלב לאדם (לפני הסנכרון, כדי שיקבל מצב מיד).
    perform public._ensure_ni_steps_from_execution(new.id);
    perform public.sync_authority_representation_steps(new.linked_client_id);
  end if;
  return new;
end;
$function$;

-- ── 3 · הדף: בן/בת זוג בלי מייל — פריט האישור כבר עכשיו (ni_approval, forPerson) ──
select public._r296_patch('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure,
  $o$      if s.status in ('pending','in_progress') then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,$o$,
  $n$      -- 296 · בן/בת זוג בלי מייל: הדף הוא הערוץ — הפריט הוא פעולה, לא «בטיפול המשרד».
      if s.status in ('pending','in_progress') and not public._ni_spouse_page_ready(s, c, req) then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,$n$);

select public._r296_patch('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure,
  $o$      elsif s.status = 'waiting_client' then
        -- ‼ 224$o$,
  $n$      elsif s.status = 'waiting_client' or public._ni_spouse_page_ready(s, c, req) then
        -- ‼ 224$n$);

-- ── 4 · מייל הדף: הפריט נכלל ב«מה חדש» ─────────────────────────────────────────
select public._r296_patch('public._client_announceable_steps(text)'::regprocedure,
  $o$                         'tax_estimate')$o$,
  $n$                         'tax_estimate',
                         -- 296 · אישור ב"ל של בן/בת זוג בלי מייל — דרך הדף
                         'authority_representation')$n$);

select public._r296_patch('public._client_announceable_steps(text)'::regprocedure,
  $o$     and (s.step_type <> 'representation' or public._rep_signing_open(s.client_id))$o$,
  $n$     and (s.step_type <> 'representation' or public._rep_signing_open(s.client_id))
     and (s.step_type <> 'authority_representation' or public._ni_spouse_page_ready(s.id))$n$);

create or replace function public._client_step_portal_key(p_step_id text, p_step_type text)
returns text language sql immutable set search_path to 'public' as $function$
  select case p_step_type
           when 'client_documents' then 'docs'
           when 'custom_request' then 'custom_' || p_step_id
           when 'prev_accountant_details' then 'prev_details'
           when 'paperless_invite' then 'paperless_signup'
           when 'paperless_tax_authority' then 'paperless_tax'
           when 'business_details' then 'business_details'
           when 'tax_estimate' then 'taxest_' || p_step_id
           when 'info_collection' then 'taxinfo_' || p_step_id
           when 'rep_client_approval' then 'rep_approval'
           -- 239 · החתימה על ייפוי הכוח — אותו מפתח שהדף נותן לפריט (_portal_rep_item)
           when 'representation' then 'rep_sign'
           -- 296 · אישור ב"ל לאדם — אותו מפתח כמו פריט הדף (_portal_step_items)
           when 'authority_representation' then 'authrep_' || p_step_id
         end;
$function$;

select public._r296_patch('public._client_step_title(text,jsonb)'::regprocedure,
  $o$             when 'representation' then 'חתימה על ייפוי הכוח'$o$,
  $n$             when 'representation' then 'חתימה על ייפוי הכוח'
             -- 296 · כמו הכותרת בדף («מה צריך מ{שם}»)
             when 'authority_representation' then
               case when p_payload->>'subjectRole' = 'spouse'
                    then coalesce(nullif(split_part(trim(coalesce(p_payload->>'subjectName', '')), ' ', 1), '') || ' — ', '')
                         || 'אישור ייפוי הכוח בביטוח הלאומי'
                    else coalesce(nullif(p_payload->>'title', ''), 'בקשה מהמשרד') end$n$);

-- «שלח בקשות»: הפריט אצל בעל הכרטיס (בכותרת הדף), ולא קבוצה נפרדת שדורשת כתובת.
select public._r296_patch('public.client_ready_to_send(text)'::regprocedure,
  $o$      'title', case when s.step_type = 'representation' then x->>'title'$o$,
  $n$      'title', case when s.step_type in ('representation', 'authority_representation') then x->>'title'$n$);

select public._r296_patch('public.client_ready_to_send(text)'::regprocedure,
  $o$    continue when nullif(v_track->>'deadline', '') is not null and (v_track->>'deadline')::date < current_date;
$o$,
  $n$    continue when nullif(v_track->>'deadline', '') is not null and (v_track->>'deadline')::date < current_date;
    -- 296 · בן/בת זוג בלי מייל — נכלל במייל הדף של בעל הכרטיס.
    continue when public._ni_spouse_page_ready(s.id);
$n$);

-- ── 5 · «ההוראות נשלחו» — רק ממייל דף שנשא את הפריט ואת האסמכתא ───────────────
create or replace function public._ni_mark_page_delivered(p_notice_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  n       public.client_notices%rowtype;
  r       public.representation_requests;
  v_html  text;
  v_ni    jsonb;
  v_now   text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select * into n from public.client_notices where id = p_notice_id;
  if n.id is null or n.status <> 'sent' then return; end if;
  if not exists (select 1 from public.client_notice_items i
                   join public.onboarding_steps s on s.id = i.step_id
                  where i.notice_id = n.id and s.step_type = 'authority_representation'
                    and s.payload->>'subjectRole' = 'spouse'
                    and public._ni_spouse_page_ready(s.id)) then
    return;
  end if;
  r := public.representation_request_for_client(n.client_id);
  if r.id is null then return; end if;
  v_html := coalesce(n.request_body->>'html', '');
  v_ni := r.execution->'nationalInsuranceSpouse';
  if jsonb_typeof(v_ni) = 'object' and nullif(v_ni->>'referenceNumber', '') is not null
     and nullif(v_ni->>'instructionsSentAt', '') is null
     and position((v_ni->>'referenceNumber') in v_html) > 0 then
    update public.representation_requests
       set execution = jsonb_set(execution, '{nationalInsuranceSpouse}',
             v_ni || jsonb_build_object('instructionsSentAt', v_now, 'instructionsSentWith', 'page'))
     where id = r.id;
  end if;
end;
$function$;

revoke execute on function public._ni_mark_page_delivered(uuid) from public, anon, authenticated;

select public._r296_patch('public.complete_client_notice(uuid,uuid,text,text,text)'::regprocedure,
  $o$    raise warning '239: _rep_mark_signing_delivered(%) failed: %', n.id, sqlerrm;
  end;
$o$,
  $n$    raise warning '239: _rep_mark_signing_delivered(%) failed: %', n.id, sqlerrm;
  end;

  -- 296 · מייל דף שנשא את אישור ב"ל של בן/בת זוג בלי מייל ⇒ «ההוראות נשלחו» אצלו/ה.
  begin
    perform public._ni_mark_page_delivered(n.id);
  exception when others then
    raise warning '296: _ni_mark_page_delivered(%) failed: %', n.id, sqlerrm;
  end;
$n$);

drop function public._r296_patch(regprocedure, text, text);

-- ── 6 · השלמה חד־פעמית: בקשות פתוחות שיש בהן אסמכתא בלי שלב ─────────────────────
do $$
declare
  r record;
  v_made int := 0;
begin
  for r in
    select rr.id, rr.linked_client_id
      from public.representation_requests rr
      join public.clients c on c.representation_request_id = rr.id
     where rr.linked_client_id is not null
       and (rr.execution ? 'nationalInsurance' or rr.execution ? 'nationalInsuranceSpouse')
  loop
    if public._ensure_ni_steps_from_execution(r.id) > 0 then
      v_made := v_made + 1;
      perform public.sync_authority_representation_steps(r.linked_client_id);
    end if;
  end loop;
  raise notice '296: backfilled NI steps for % request(s)', v_made;
end $$;
