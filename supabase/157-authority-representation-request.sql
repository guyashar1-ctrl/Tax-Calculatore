-- ─── 157: ייצוג ברשות לאדם נוסף הופך לבקשה במשטח «בקשות» ───────────────────
-- מקור: docs/PRODUCT-REQUESTS-WORKFLOW-FOUNDATION.md +
-- docs/PLAN-BTL-SPOUSE-REPRESENTATION-REQUEST.md. עד היום "בקש ייצוג" בכרטיס
-- ב"ל כתב מצב בלבד (targets, taxFiles, execution) בלי לייצר שום בקשה גלויה —
-- העבודה של בן/בת הזוג חיה במסך אחר בלי שורה במשטח "בקשות". זה מהלך היסוד:
-- "בקשות" הוא המדד התפעולי העמיד, ותיק המס רק מתאר מצב.
--
-- ‼ בעלים ≠ נושא: הבקשה שייכת לכרטיס של הלקוח (בעלים); payload.subjectRole
-- מזהה את מי שהעבודה עוסקת בו/ה — תפקיד (PersonRole), לא שם ולא מגדר.
-- ‼ ההורה (בקשת הייצוג) לעולם אינו נכתב מחדש: אין נגיעה ב-status/scope/
-- signers/tokens שלו. הבן הוא שורת onboarding_steps עצמאית שנגזרת ממנו.
-- ‼ המצב של הבן נגזר בטריגר מהראיה בפועל (execution + tax_files) — אף פעם
-- לא נכתב ביד מהדפדפן. advance_onboarding_step חוסם complete/reopen עליו.
-- ‼ אין שום טריגר על family_status — גירושין מחוץ לתחולה, במפורש.
--
-- ‼ הטכניקה: onboarding_track_for נכתבת מחדש (פונקציה קצרה, טקסט מלא ידוע
-- ומדויק). advance_onboarding_step ו-build_client_portal (פונקציות גדולות
-- וחיות) מתוקנות בהזרקה מעוגנת עם ציטוט דולר ואימות דו-כיווני של האורך —
-- אותה טכניקה בדיוק כמו 146/151/154 — כדי לא לסכן השמטה שקטה בהעתקה ידנית.

-- ── 0 · אילוץ הסוגים המותרים ─────────────────────────────────────────────
alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;
alter table public.onboarding_steps add constraint onboarding_steps_step_type_check
  check (step_type = any (array[
    'representation','file_opening','representation_upgrade','release_letter',
    'rep_client_approval','materials_received','paperless_invite','paperless_connection',
    'paperless_tax_authority','data_import','data_verification','retainer_authorization',
    'internal_setup','kyc_identification','first_month_review','intake_questionnaire',
    'client_documents','prev_accountant_details','custom_request',
    'institution_alignment_btl','institution_alignment_vat','institution_alignment_income',
    'opening_call','authority_representation']));

-- ── 1 · onboarding_track_for — סוג חדש ─────────────────────────────────────
create or replace function public.onboarding_track_for(p_step_type text)
 returns text
 language sql
 immutable
as $function$
  select case p_step_type
    when 'representation' then 'authorities'
    when 'representation_upgrade' then 'authorities'
    when 'rep_client_approval' then 'authorities'
    when 'authority_representation' then 'authorities'
    when 'file_opening' then 'authorities'
    when 'institution_alignment_btl' then 'authorities'
    when 'institution_alignment_vat' then 'authorities'
    when 'institution_alignment_income' then 'authorities'
    when 'release_letter' then 'prev_accountant'
    when 'materials_received' then 'prev_accountant'
    when 'prev_accountant_details' then 'prev_accountant'
    when 'paperless_invite' then 'tools'
    when 'paperless_connection' then 'tools'
    when 'paperless_tax_authority' then 'tools'
    when 'data_import' then 'tools'
    when 'data_verification' then 'tools'
    when 'client_documents' then 'tools'
    when 'retainer_authorization' then 'payment'
    when 'internal_setup' then 'internal'
    when 'kyc_identification' then 'internal'
    when 'intake_questionnaire' then 'internal'
    when 'first_month_review' then 'review'
    when 'opening_call' then 'review'
    when 'custom_request' then 'custom'
    else 'custom' end;
$function$;

-- ── 2 · ייחודיות: שני האינדקסים הקיימים מוחרגים, ואחד חדש על הפתוחים ───────
-- ‼ create_onboarding_request כבר דוחה את הסוג הזה (לא ברשימת ההיתר שלה) —
-- היצירה עוברת רק דרך request_authority_representation (§4). לכן ההחרגה כאן
-- היא רק כדי שיצירות מרובות של הסוג הזה (לגיא ולדין, לרשויות שונות בעתיד)
-- לא יתנגשו על "שלב אחד מכל סוג ללקוח" — בדיוק כמו custom_request.
drop index if exists public.onboarding_steps_person_type_idx;
create unique index onboarding_steps_person_type_idx
  on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status <> 'cancelled'
    and step_type not in ('custom_request', 'authority_representation');

drop index if exists public.onboarding_steps_engagement_type_idx;
create unique index onboarding_steps_engagement_type_idx
  on public.onboarding_steps (engagement_id, step_type)
  where engagement_id is not null
    and step_type not in ('custom_request', 'authority_representation');

-- זהות העבודה בעולם: בעלים (client_id) + רשות + נושא — פתוח אחד בלבד.
-- שתי לחיצות, שני חלונות, שתי נקודות כניסה — מתכנסות לאותה שורה.
create unique index if not exists onboarding_steps_authority_subject_open_idx
  on public.onboarding_steps (client_id, (payload->>'authority'), (payload->>'subjectRole'))
  where step_type = 'authority_representation'
    and status not in ('completed','verified','skipped','cancelled');

-- ── 3 · המצב נגזר, לא נכתב — הפונקציה שמחשבת status/ball/payload ──────────
create or replace function public.sync_authority_representation_steps(p_client_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s            record;
  v_track      text;
  v_t          jsonb;
  v_tf         jsonb;
  v_file       jsonb;
  v_new_status text;
  v_new_ball   text;
  v_note       text;
begin
  for s in
    select * from public.onboarding_steps
    where client_id = p_client_id and step_type = 'authority_representation'
      and status <> 'cancelled'
  loop
    v_track := case when s.payload->>'subjectRole' = 'spouse'
                     then 'nationalInsuranceSpouse' else 'nationalInsurance' end;

    select execution -> v_track into v_t from public.representation_requests
      where id = s.payload->>'representationRequestId';
    v_t := coalesce(v_t, '{}'::jsonb);

    select tax_files into v_tf from public.clients where id = p_client_id;
    select f into v_file from jsonb_array_elements(coalesce(v_tf, '[]'::jsonb)) f
      where f->>'authority' = s.payload->>'authority' and f->>'owner' = s.payload->>'subjectRole'
      limit 1;

    if (v_t->>'confirmedAt') is not null or (v_file->>'repStatus') = 'active' then
      v_new_status := 'completed'; v_new_ball := s.ball; v_note := 'ייצוג פעיל';
    elsif nullif(v_t->>'deadline','') is not null and (v_t->>'deadline')::date < current_date then
      v_new_status := 'blocked'; v_new_ball := 'me'; v_note := 'האסמכתא פגה — נדרשת הזנה מחדש';
    elsif (v_t->>'instructionsSentAt') is not null then
      v_new_status := 'waiting_client'; v_new_ball := 'client'; v_note := 'הוראות האישור נשלחו';
    elsif nullif(v_t->>'referenceNumber','') is not null then
      v_new_status := 'in_progress'; v_new_ball := 'me'; v_note := 'האסמכתא התקבלה';
    elsif (v_t->>'enteredAt') is not null then
      v_new_status := 'in_progress'; v_new_ball := 'me'; v_note := 'הייצוג הוזן בביטוח לאומי';
    else
      v_new_status := 'pending'; v_new_ball := 'me'; v_note := null;
    end if;

    if v_new_status is distinct from s.status then
      update public.onboarding_steps
         set status = v_new_status,
             ball = case when v_new_status = 'completed' then ball else v_new_ball end,
             payload = case when v_new_status = 'completed'
                            then payload || jsonb_strip_nulls(jsonb_build_object(
                                   'referenceNumber', nullif(v_t->>'referenceNumber',''),
                                   'deadline', nullif(v_t->>'deadline',''),
                                   'instructionsSentAt', nullif(v_t->>'instructionsSentAt',''),
                                   'instructionsSentWith', nullif(v_t->>'instructionsSentWith',''),
                                   'confirmedAt', nullif(v_t->>'confirmedAt','')))
                            else payload end,
             completion_method = case when v_new_status = 'completed' then 'auto' else completion_method end,
             completed_at = case when v_new_status = 'completed'
                                  then coalesce(completed_at, nullif(v_t->>'confirmedAt','')::timestamptz, now())
                                  else completed_at end,
             needs_attention = case when v_new_status = 'blocked' then true
                                     when v_new_status = 'completed' then false
                                     else needs_attention end,
             updated_at = now()
       where id = s.id;

      perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
        v_note, jsonb_build_object('from', s.status, 'to', v_new_status));

      if v_new_status = 'completed' then
        perform public.unlock_dependent_steps(s.id);
      end if;
    end if;
  end loop;
end;
$function$;

revoke all on function public.sync_authority_representation_steps(text) from public, anon, authenticated;

create or replace function public.tg_sync_authority_rep_from_execution()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.linked_client_id is not null then
    perform public.sync_authority_representation_steps(new.linked_client_id);
  end if;
  return new;
end;
$$;

drop trigger if exists authority_rep_sync_from_execution on public.representation_requests;
create trigger authority_rep_sync_from_execution
  after update of execution on public.representation_requests
  for each row execute function public.tg_sync_authority_rep_from_execution();

create or replace function public.tg_sync_authority_rep_from_client()
returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.sync_authority_representation_steps(new.id);
  return new;
end;
$$;

drop trigger if exists authority_rep_sync_from_client on public.clients;
create trigger authority_rep_sync_from_client
  after update of authority_representations, tax_files on public.clients
  for each row execute function public.tg_sync_authority_rep_from_client();

-- ── 4 · נקודת ההתכנסות — RPC אחד לתיק המס ול-"+ בקשה חדשה" ─────────────────
-- ‼ טרנזקציה אחת, שלוש כתיבות בלבד (targets, taxFiles, execution stub) +
-- יצירת השלב — מחליפה את שלוש הכתיבות הנפרדות שהדפדפן ביצע עד כה
-- (handleAddNiTarget). "select ... for update" על הכרטיס מסדרר קריאות
-- מקבילות על אותו לקוח — זו ההגנה האמיתית מפני כפילות, לא רק בדיקה מקדימה.
create or replace function public.request_authority_representation(
  p_client_id text, p_authority text, p_subject_role text, p_source text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c           public.clients%rowtype;
  req         public.representation_requests%rowtype;
  v_uid       uuid := auth.uid();
  v_track     text;
  v_targets   jsonb;
  v_rec       jsonb;
  v_name      text;
  v_tax_files jsonb;
  v_file      jsonb;
  v_new_files jsonb;
  v_res       jsonb;
  v_eng       text;
  v_sort      int;
  v_step_id   text;
  v_existing  text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;

  select * into c from public.clients where id = p_client_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'reason', 'client_not_found'); end if;
  if c.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;

  if p_authority <> 'national_insurance' then
    return jsonb_build_object('ok', false, 'reason', 'bad_authority');
  end if;
  if p_subject_role not in ('client','spouse') then
    return jsonb_build_object('ok', false, 'reason', 'bad_subject_role');
  end if;
  if c.representation_request_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_representation');
  end if;
  select * into req from public.representation_requests where id = c.representation_request_id;
  if req.id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_representation');
  end if;

  if p_subject_role = 'spouse' then
    if coalesce(c.family_status, '') <> 'married' then
      return jsonb_build_object('ok', false, 'reason', 'not_married');
    end if;
    if c.spouse_client_id is not null then
      return jsonb_build_object('ok', false, 'reason', 'linked_subject');
    end if;
    if coalesce(c.spouse_represented_elsewhere, false) then
      return jsonb_build_object('ok', false, 'reason', 'represented_elsewhere');
    end if;
    v_name  := coalesce(
      nullif(trim(coalesce(c.spouse_first_name,'') || ' ' || coalesce(c.spouse_last_name,'')), ''),
      nullif(trim(coalesce(c.spouse_name,'')), ''),
      'בן/בת הזוג');
    v_track := 'nationalInsuranceSpouse';
  else
    v_name  := nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '');
    v_track := 'nationalInsurance';
  end if;

  -- כבר פעיל — שום כתיבה
  v_tax_files := coalesce(c.tax_files, '[]'::jsonb);
  select f into v_file from jsonb_array_elements(v_tax_files) f
    where f->>'authority' = p_authority and f->>'owner' = p_subject_role limit 1;
  if (v_file->>'repStatus') = 'active' or (req.execution -> v_track ->> 'confirmedAt') is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_active');
  end if;

  -- אידמפוטנטיות: שלב פתוח כבר קיים לזהות הזאת בדיוק
  select id into v_existing from public.onboarding_steps
    where client_id = c.id and step_type = 'authority_representation'
      and payload->>'authority' = p_authority and payload->>'subjectRole' = p_subject_role
      and status not in ('completed','verified','skipped','cancelled')
    limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'stepId', v_existing, 'created', false);
  end if;

  -- targets מנורמל — אותו כלל בדיוק כמו targetsOf() ב-utils/repScope.ts
  v_rec := c.authority_representations -> 'nationalInsurance';
  if v_rec is null or not (jsonb_typeof(v_rec->'targets') = 'array' and jsonb_array_length(v_rec->'targets') > 0) then
    if coalesce((v_rec->>'coversSpouse')::boolean, false) then
      v_targets := '["client","spouse"]'::jsonb;
    else
      v_targets := '["client"]'::jsonb;
    end if;
  else
    v_targets := v_rec->'targets';
  end if;
  if not coalesce((select bool_or(x = p_subject_role) from jsonb_array_elements_text(v_targets) x), false) then
    v_targets := v_targets || to_jsonb(array[p_subject_role]);
  end if;

  update public.clients
     set authority_representations = jsonb_set(
           coalesce(authority_representations, '{}'::jsonb), '{nationalInsurance}',
           jsonb_build_object('status', coalesce(v_rec->>'status', 'in_process'), 'targets', v_targets)),
         updated_at = now()
   where id = c.id;

  -- שורת תיק — נוצרת, או מקודמת מ-'none', דרך מסלול העובדות המנוהלות
  if v_file is null then
    v_new_files := v_tax_files || jsonb_build_array(jsonb_build_object(
      'id', 'tf-' || (extract(epoch from clock_timestamp()) * 1000)::bigint || '-' || substr(md5(random()::text),1,4),
      'authority', p_authority, 'owner', p_subject_role, 'repStatus', 'pending'));
  elsif (v_file->>'repStatus') = 'none' then
    select jsonb_agg(case when f->>'authority' = p_authority and f->>'owner' = p_subject_role
                           then f || jsonb_build_object('repStatus','pending') else f end)
      into v_new_files
      from jsonb_array_elements(v_tax_files) f;
  else
    v_new_files := v_tax_files;
  end if;

  if v_new_files is distinct from v_tax_files then
    v_res := public.record_manual_fact_change(
      c.id, 'taxFiles', 'ייצוג בביטוח לאומי — ' || coalesce(v_name,''),
      jsonb_build_object('display', 'אין ייצוג'),
      jsonb_build_object('display', 'בתהליך', 'patch', jsonb_build_object('taxFiles', v_new_files)),
      null);
    if not coalesce((v_res->>'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'reason', 'tax_file_write_failed', 'detail', v_res->>'error');
    end if;
  end if;

  select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.onboarding_steps where client_id = c.id and status <> 'cancelled';

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
     sort_order, published_at, required_for_close, payload)
  values
    (c.user_id, v_eng, c.id, 'authority_representation', 'authorities', 'person', 'pending', 'me',
     v_sort, now(), false,
     jsonb_build_object('authority', p_authority, 'subjectRole', p_subject_role, 'subjectName', coalesce(v_name,''),
                         'representationRequestId', req.id,
                         'title', 'ייצוג בביטוח לאומי — ' || coalesce(v_name,'')))
  returning id into v_step_id;

  -- ‼ כתיבה תמיד מתבצעת (גם אם ערך המפתח לא משתנה), כדי שהטריגר על
  -- representation_requests יפעיל את sync_authority_representation_steps
  -- אחרי שהשלב כבר קיים — ומיד יחשב את המצב הנכון שלו מהראיה בפועל.
  update public.representation_requests
     set execution = coalesce(execution, '{}'::jsonb)
                      || jsonb_build_object(v_track, coalesce(execution -> v_track, '{}'::jsonb)),
         updated_at = now()
   where id = req.id;

  perform public.log_onboarding_event(c.user_id, v_step_id, v_eng, 'created', 'accountant',
    'נפתחה בקשת ייצוג בביטוח לאומי עבור ' || coalesce(v_name,''),
    jsonb_build_object('authority', p_authority, 'subjectRole', p_subject_role, 'source', p_source));

  perform public.sync_authority_representation_steps(c.id);

  return jsonb_build_object('ok', true, 'stepId', v_step_id, 'created', true);
end;
$function$;

-- ‼ ללא revoke מפורש, PUBLIC (וממנו anon) מקבל EXECUTE כברירת מחדל על
-- פונקציה חדשה — נחשף כ-RPC אנונימי גם אם auth.uid() חוסם בפועל. אותו כלל
-- כמו שאר ה-RPCs הרגישים בפרויקט (ראה security_allowlist).
revoke all on function public.request_authority_representation(text, text, text, text) from public, anon;
grant execute on function public.request_authority_representation(text, text, text, text) to authenticated;

-- ‼ פונקציות טריגר בלבד — לא נועדו להיקרא כ-RPC. Postgres חוסם קריאה ישירה
-- אליהן ברמת ה-runtime (return type 'trigger'), אבל revoke מפורש סוגר גם
-- את חשיפת ה-endpoint עצמו ב-PostgREST (ראה revoke_trigger_functions_from_public).
revoke all on function public.tg_sync_authority_rep_from_execution() from public, anon, authenticated;
revoke all on function public.tg_sync_authority_rep_from_client() from public, anon, authenticated;

-- ── 5 · advance_onboarding_step — complete/reopen חסומים, המצב נגזר ────────
do $do$
declare
  v_def text;
  v_new text;
  v_anchor constant text := $anchor$  case p_action
    when 'start'        then v_new := 'in_progress';
$anchor$;
  v_branch constant text := $branch$  if s.step_type = 'authority_representation' and p_action not in ('cancel','note','set_due') then
    return jsonb_build_object('ok', false, 'error', 'derived_step',
      'message', 'המצב של הפריט הזה נגזר אוטומטית מהביצוע בפועל, ואינו ניתן לסימון ידני.');
  end if;

$branch$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'advance_onboarding_step';

  if v_def is null then
    raise exception '157: advance_onboarding_step לא נמצאה';
  end if;

  if position('derived_step' in v_def) > 0 then
    raise notice '157: advance_onboarding_step כבר מתוקנת, מדלג';
  else
    if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
      raise exception '157: העוגן ב-advance_onboarding_step אינו יחיד — התיקון נעצר';
    end if;

    v_new := replace(v_def, v_anchor, v_branch || v_anchor);

    if length(v_new) <> length(v_def) + length(v_branch) then
      raise exception '157: אורך לא תואם אחרי ההזרקה ל-advance_onboarding_step';
    end if;

    execute v_new;
    raise notice '157: advance_onboarding_step תוקנה';
  end if;
end
$do$;

grant execute on function public.advance_onboarding_step(text, text, jsonb) to authenticated;

-- ── 6 · build_client_portal — ענף חדש, בלי action/declare ───────────────────
-- ‼ גיא רואה; הנושא בכותרת תמיד; אין פקד שסוגר במקום דין — ההשלמה נגזרת
-- מראיה בלבד. אחרי שהאסמכתא נשלחת — הודעה עם קישור לאתר הביטוח הלאומי,
-- אותו קישור שבמייל (הרחבה קטנה על linkUrl/linkLabel בפריט kind='message',
-- ראה src/components/PublicPortalPage.tsx).
do $do$
declare
  v_def text;
  v_new text;
  v_anchor constant text := $anchor$    else
      continue;
    end case;
$anchor$;
  v_branch constant text := $branch$    when 'authority_representation' then
      v_label := coalesce(nullif(s.payload->>'title',''), 'ייצוג ברשות');
      -- ‼ המצב הפעיל נקרא מ-req.execution (המקור החי), לא מ-s.payload —
      -- payload נושא את הראיה רק בסגירה (צילום), ולפני כן הוא ריק.
      if s.status in ('pending','in_progress') then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,
          'label', v_label,
          'sub', case when nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'referenceNumber', '') is not null
                      then 'האסמכתא התקבלה — נשלח הוראות אישור בקרוב'
                      else 'בטיפול המשרד — הזנת הייצוג בביטוח לאומי' end);
      elsif s.status = 'waiting_client' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','office','key','authrep_'||s.id, 'kind','message',
          'label', v_label,
          'note', 'האסמכתא: ' || coalesce(nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'referenceNumber', ''), '') ||
            case when nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'deadline', '') is not null
                 then chr(10) || 'יש לאשר עד ' || to_char((req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'deadline')::date, 'DD.MM.YYYY')
                 else '' end ||
            chr(10) || 'ניתן לאשר באתר הביטוח הלאומי או בטלפון 02-5393740. אם ההודעה לא הגיעה - אפשר להעביר את ההוראות.',
          'linkUrl', 'https://b2b.btl.gov.il/BTL.ILG.PAYMENTS/IshurIpuyKoachInfo.aspx',
          'linkLabel', 'לאתר הביטוח הלאומי'));
      elsif s.status = 'blocked' then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,
          'label', v_label, 'sub', 'האסמכתא פגה - נזין מחדש');
      elsif s.status in ('completed','verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','authrep_'||s.id,
          'label', v_label || ' · אושר');
      end if;

$branch$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'build_client_portal';

  if v_def is null then
    raise exception '157: build_client_portal לא נמצאה';
  end if;

  if position('authrep_' in v_def) > 0 then
    raise notice '157: build_client_portal כבר מתוקנת, מדלג';
  else
    if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
      raise exception '157: העוגן ב-build_client_portal אינו יחיד — התיקון נעצר';
    end if;

    v_new := replace(v_def, v_anchor, v_branch || v_anchor);

    if length(v_new) <> length(v_def) + length(v_branch) then
      raise exception '157: אורך לא תואם אחרי ההזרקה ל-build_client_portal';
    end if;

    execute v_new;
    raise notice '157: build_client_portal תוקנה';
  end if;
end
$do$;

grant execute on function public.build_client_portal(text, text) to authenticated;

-- ── 7 · מילוי-לאחור — קדימה בלבד, אידמפוטנטי ────────────────────────────────
-- ‼ בלי לגעת בכרטיס או ב-execution: רק יוצר את השלב שחסר, לפי המצב שכבר
-- קיים היום. לגיא/דין — targets כבר כולל 'spouse' (מהלחיצה הקודמת), ולכן
-- זו יוצרת שלב 'pending' עבורה מיד; ה-trigger שרץ מיד אחרי מחשב את מצבה
-- האמיתי מ-execution/tax_files (שגם הם כבר קיימים) בלי לבדות שום ראיה.
do $backfill$
declare
  r         record;
  v_role    text;
  v_targets text[];
  v_rec     jsonb;
  v_name    text;
  v_step_id text;
  v_eng     text;
  v_sort    int;
begin
  for r in
    select c.id as client_id, c.user_id, c.first_name, c.last_name,
           c.spouse_first_name, c.spouse_last_name, c.spouse_name,
           c.authority_representations, req.id as req_id
    from public.clients c
    join public.representation_requests req on req.id = c.representation_request_id
  loop
    v_rec := r.authority_representations -> 'nationalInsurance';
    if v_rec is null then
      v_targets := '{}';
    elsif jsonb_typeof(v_rec->'targets') = 'array' and jsonb_array_length(v_rec->'targets') > 0 then
      select array_agg(x) into v_targets from jsonb_array_elements_text(v_rec->'targets') x;
    elsif coalesce((v_rec->>'coversSpouse')::boolean, false) then
      v_targets := array['client','spouse'];
    else
      v_targets := array['client'];
    end if;

    foreach v_role in array coalesce(v_targets, '{}') loop
      if v_role not in ('client','spouse') then continue; end if;
      if exists (select 1 from public.onboarding_steps
                  where client_id = r.client_id and step_type = 'authority_representation'
                    and payload->>'authority' = 'national_insurance' and payload->>'subjectRole' = v_role) then
        continue;
      end if;

      if v_role = 'spouse' then
        v_name := coalesce(
          nullif(trim(coalesce(r.spouse_first_name,'') || ' ' || coalesce(r.spouse_last_name,'')), ''),
          nullif(trim(coalesce(r.spouse_name,'')), ''),
          'בן/בת הזוג');
      else
        v_name := nullif(trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), '');
      end if;

      select id into v_eng from public.engagements where client_id = r.client_id order by created_at desc limit 1;
      select coalesce(max(sort_order),0)+1 into v_sort
        from public.onboarding_steps where client_id = r.client_id and status <> 'cancelled';

      insert into public.onboarding_steps
        (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
         sort_order, published_at, required_for_close, payload)
      values
        (r.user_id, v_eng, r.client_id, 'authority_representation', 'authorities', 'person', 'pending', 'me',
         v_sort, now(), false,
         jsonb_build_object('authority','national_insurance','subjectRole',v_role,'subjectName',coalesce(v_name,''),
                             'representationRequestId', r.req_id,
                             'title', 'ייצוג בביטוח לאומי — ' || coalesce(v_name,'')))
      returning id into v_step_id;

      perform public.log_onboarding_event(r.user_id, v_step_id, v_eng, 'created', 'system',
        'שלב נוצר במילוי-לאחור (157) עבור מסלול ביטוח לאומי קיים',
        jsonb_build_object('authority','national_insurance','subjectRole',v_role));
    end loop;

    perform public.sync_authority_representation_steps(r.client_id);
  end loop;
end
$backfill$;
