-- ═══════════════════════════════════════════════════════════════════════════
-- 234 · עסק חדש שהמשרד פותח — בלי «תעודת עוסק», בלי ת.ז. כפולה, פייפרלס אחרי
--        פתיחת התיקים, «עובד מהבית?» לפני שאלת החדר, ו«פתח עכשיו» למשרד (12.10.2026)
--
-- המקרה: אמיר ויסמרק — עוסק זעיר שהמשרד מקים. הדף שלו ביקש «תעודת עוסק» (שעוד אין
-- לו — היא התוצאה של העבודה שלנו), «צילום תעודת זהות» גם בבקשת המסמכים וגם בייפוי
-- הכוח, ו«הרשמה לפייפרלס» לפני שיש תיק. הכרעות גיא (12.10.2026):
--   · מצב העסק נבחר במפורש בהצעה/בליד/בכרטיס: עסק חדש שאנחנו פותחים · עובר מרו"ח
--     אחר · עסק קיים בלי רו"ח קודם. ‼ «לא סומן» אינו «עסק חדש» — עד כאן «אין רו"ח
--     קודם» (ברירת המחדל של הליד) נקרא כעסק חדש ופתח פתיחת תיקים לעסק פתוח.
--   · עסק חדש: מבקשים אישור ניהול חשבון בנק. ת.ז. ורישיון נהיגה נאספים בטופס הייצוג
--     (רישיון — אלא אם סומן במפורש «אין לי רישיון נהיגה»).
--   · ת.ז. לא נכנסת לבקשת המסמכים כשבקשת הייצוג כבר אוספת אותה (מ"ה / מע"מ / ניכויים).
--     «אעלה מאוחר יותר» בטופס עדיין פותח פריט העלאה שם (191) — מקום אחד לכל כיוון.
--   · פייפרלס (וממילא החיבור והרשאת התשלום שאחריו) נפתח אחרי פתיחת התיקים. «פרטי העסק»
--     נשאר פתוח עכשיו — שם העסק נדרש לפתיחה עצמה.
--   · «פרטי העסק»: קודם «האם תעבוד גם מהבית?», ורק אם כן — שאלת החדר. התקרה נשארת 25%.
--   · למשרד: «פתח עכשיו» לבקשה שממתינה לבקשה אחרת.
--
-- ‼ שינויים בגופי פונקציות קיימות נעשים בעוגן יחיד (pg_get_functiondef + replace), עם
--   כשל קולני כשהעוגן לא נמצא בדיוק במספר הצפוי — כמו 130/131. ‼ להריץ את הקובץ דרך
--   execute_sql ולאמת (apply_migration בלע בעבר בלוקי DO בעברית בלי שגיאה).
-- ‼ שום דבר כאן לא שולח מייל ולא מפרסם לדף של לקוח. נתוני לקוחות קיימים לא משתנים;
--   העדכון של אמיר נעשה בנפרד (234-amir.sql), באישור גיא.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0 · כלי הטלאי (זמני — נמחק בסוף הקובץ) ──────────────────────────────────
create or replace function public._nb234_patch(p_fn regprocedure, p_old text, p_new text, p_expected int default 1)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_n int := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
begin
  -- כבר הוחל (הרצה חוזרת): הטקסט החדש כבר בגוף — גם כשהוא מכיל את הישן (2א).
  -- טלאי שמוחק (p_new ריק) — הוחל כשהעוגן כבר לא שם.
  if (p_new <> '' and position(p_new in v_def) > 0) or (p_new = '' and v_n = 0) then
    return;
  end if;
  if v_n <> p_expected then
    raise exception '234: anchor count % (expected %) in %: %', v_n, p_expected, p_fn, left(p_old, 120);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- ── 1 · עזרים ───────────────────────────────────────────────────────────────
/** האם בקשת הייצוג אוספת צילום תעודה — אותו כלל כמו identityRequirements (ב"ל לבדו לא). */
create or replace function public._rep_collects_identity(p_scope jsonb)
returns boolean language sql immutable set search_path to 'public' as $$
  select coalesce(bool_or(coalesce(p_scope->k->>'status', 'none') <> 'none'), false)
    from unnest(array['incomeTax', 'vat', 'withholding']) k
   where jsonb_typeof(p_scope) = 'object' and jsonb_typeof(p_scope->k) = 'object';
$$;

/**
 * עסק חדש שהמשרד פותח: סומן במפורש (כרטיס, ואם אין — הליד), או שכבר נפתחה לו
 * «פתיחת תיקים». ‼ היעדר רו"ח קודם אינו סימן.
 */
create or replace function public._client_is_new_business(p_client_id text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select coalesce(c.business_transfer,
                     (select l.business_transfer from public.leads l
                       where l.converted_client_id = c.id and l.business_transfer is not null
                       order by l.updated_at desc nulls last limit 1)) = false
       from public.clients c where c.id = p_client_id), false)
    or exists (select 1 from public.onboarding_steps s
                where s.client_id = p_client_id and s.step_type = 'file_opening' and s.status <> 'cancelled');
$$;
revoke all on function public._client_is_new_business(text) from public, anon, authenticated;

/** הרשמה לפייפרלס שואלת את שם העסק רק כשאין «פרטי העסק» שכבר שואלת אותו. */
create or replace function public._paperless_asks_business_name(p_client_id text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select not exists (
    select 1 from public.onboarding_steps b join public.clients c on c.id = b.client_id
     where b.client_id = p_client_id and b.step_type = 'business_details' and b.status <> 'cancelled'
       and nullif(trim(coalesce(c.business_name, '')), '') is not null);
$$;
revoke all on function public._paperless_asks_business_name(text) from public, anon, authenticated;

-- ── 2 · המחולל ──────────────────────────────────────────────────────────────
-- 2א · משתנים
select public._nb234_patch('public.generate_onboarding_steps(text,boolean)'::regprocedure,
$o$  v_new_business boolean := false;
$o$, $n$  v_new_business boolean := false;
  v_bt         boolean;  -- 234: מצב העסק המסומן (false = עסק חדש שהמשרד פותח)
  v_fo         public.onboarding_steps%rowtype;
$n$);

-- 2ב · «עסק חדש» רק כשסומן — ומה שסומן בליד עובר לכרטיס, כדי שמקור האמת יהיה אחד.
select public._nb234_patch('public.generate_onboarding_steps(text,boolean)'::regprocedure,
$o$  if v_fresh then
    v_new_business := (v_prev_known is false) or (v_client.business_transfer is false);
  else
    v_new_business := coalesce(v_client.business_transfer, not v_has_prev) = false and v_has_prev = false
                      and v_client.business_transfer is not null;
  end if;
$o$, $n$  -- ‼ 234: «עסק חדש» = סומן במפורש (עסק חדש שהמשרד פותח). «אין רו"ח קודם» — ברירת המחדל
  -- של כל ליד — אינו סימן: הוא פתח פתיחת תיקים לעסקים קיימים. «לא סומן» = לא עסק חדש.
  v_bt := v_client.business_transfer;
  if v_bt is null then
    select l.business_transfer into v_bt from public.leads l
     where l.converted_client_id = e.client_id and l.business_transfer is not null
     order by l.updated_at desc nulls last limit 1;
  end if;
  if v_bt is null and q.lead_id is not null then
    select l.business_transfer into v_bt from public.leads l where l.id = q.lead_id;
  end if;
  v_new_business := coalesce(v_bt = false, false);
  if not p_dry_run and v_client.business_transfer is null and v_bt is not null then
    update public.clients set business_transfer = v_bt where id = e.client_id;
  end if;
$n$);

-- 2ג · הרשימה המובנית לעסק חדש — בלי «תעודת עוסק» (היא תוצר הפתיחה).
select public._nb234_patch('public.generate_onboarding_steps(text,boolean)'::regprocedure,
$o$    elsif v_new_business then
      v_docs := jsonb_build_array(
        jsonb_build_object('key','vat_cert','label','תעודת עוסק','done',false),
        jsonb_build_object('key','id_card','label','צילום תעודת זהות','done',false),
$o$, $n$    elsif v_new_business then
      v_docs := jsonb_build_array(
        jsonb_build_object('key','id_card','label','צילום תעודת זהות','done',false),
$n$);

-- 2ד · ת.ז. לא נבקשת פעמיים: כשבקשת הייצוג אוספת אותה, היא לא נכנסת לבקשת המסמכים.
select public._nb234_patch('public.generate_onboarding_steps(text,boolean)'::regprocedure,
$o$    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'client_documents', 'tools', 'person', 'client',
$o$, $n$    -- ‼ 234: בקשת הייצוג אוספת את צילום התעודה (מ"ה/מע"מ/ניכויים) — ושם «אעלה מאוחר
    -- יותר» פותח פריט העלאה כאן (191). רשימה שנשארת ריקה — נשארת כמו שהמשרד הגדיר.
    if v_has_rep and public._rep_collects_identity(coalesce(
         (select r.scope from public.representation_requests r
           where r.id = coalesce(q.representation_request_id, v_client.representation_request_id)),
         v_client.authority_representations)) then
      v_docs := coalesce((select case when count(*) filter (where d->>'key' not in ('id_card', 'id_card_spouse')) > 0
                                      then jsonb_agg(d) filter (where d->>'key' not in ('id_card', 'id_card_spouse')) end
                            from jsonb_array_elements(v_docs) d), v_docs);
    end if;
    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'client_documents', 'tools', 'person', 'client',
$n$);

-- 2ה · פייפרלס של עסק חדש מחכה לפתיחת התיקים. «פרטי העסק» (טריגר 220) נשארת פתוחה.
select public._nb234_patch('public.generate_onboarding_steps(text,boolean)'::regprocedure,
$o$      v_planned := v_planned || jsonb_build_object('step_type','paperless_invite','track','tools','scope','person','status', v_r->>'status');
$o$, $n$      -- ‼ 234: אין קבלות בלי תיק. התלות נרשמת כקשת מחולל (origin ריק) — שרטוט המסלול לא
      -- מוחק אותה, ו«השלב נפתח» כשפתיחת התיקים מושלמת (unlock_dependent_steps).
      if v_new_business then
        select * into v_fo from public.onboarding_steps
         where client_id = e.client_id and step_type = 'file_opening' and status <> 'cancelled'
         order by (engagement_id is not distinct from e.id) desc, created_at desc limit 1;
        if (v_fo.id is not null and not public.step_satisfies_dependency(v_fo.status, v_fo.payload))
           or (v_fo.id is null and p_dry_run and v_planned @> '[{"step_type":"file_opening"}]'::jsonb) then
          if not p_dry_run and v_fo.id is not null and v_r->>'stepId' is not null then
            update public.onboarding_steps
               set status = 'locked', depends_on_step_id = v_fo.id, updated_at = now()
             where id = v_r->>'stepId' and status = 'pending';
          end if;
          v_r := v_r || jsonb_build_object('status', 'locked', 'dependsOn', 'file_opening');
        end if;
      end if;
      v_planned := v_planned || jsonb_build_object('step_type','paperless_invite','track','tools','scope','person','status', v_r->>'status');
$n$);

-- 2ה' · כותרת בקשת המסמכים ביחיד: «להעלות מסמך אחד» ולא «להעלות 1 מסמכים» (_documents_title, קיים).
select public._nb234_patch('public._onboarding_system_payload(text,jsonb)'::regprocedure,
$o$'clientTitle', 'להעלות ' || jsonb_array_length(v_docs) || ' מסמכים',$o$,
$n$'clientTitle', public._documents_title(jsonb_array_length(v_docs)),$n$);

-- 2ו · הזרע של ברירות המחדל (משרד חדש) — אותה רשימה בלי «תעודת עוסק».
select public._nb234_patch('public.default_journey_entries(text)'::regprocedure,
$o$        jsonb_build_object('key','vat_cert','label','תעודת עוסק'),
$o$, $n$$n$);

-- ── 3 · הדף האישי ───────────────────────────────────────────────────────────
-- 3א · הרשמה לפייפרלס לא שואלת שוב את שם העסק כש«פרטי העסק» כבר שואלת אותו.
select public._nb234_patch('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure,
$o$'needsBusinessName', true,$o$, $n$'needsBusinessName', public._paperless_asks_business_name(c.id),$n$, 2);

-- 3ב · התשובה האחרונה כוללת «עובד מהבית?».
select public._nb234_patch('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure,
$o$select jsonb_build_object('hasDedicatedRoom', a.has_dedicated_room,$o$,
$n$select jsonb_build_object('worksFromHome', a.works_from_home, 'hasDedicatedRoom', a.has_dedicated_room,$n$);

-- ── 4 · עבודה מהבית: «האם תעבוד גם מהבית?» לפני שאלת החדר ─────────────────────
-- ‼ null = תשובה מלפני 234 (השאלה לא נשאלה). false = לא עובד מהבית ⇒ אין חדר ואין אחוז.
alter table public.client_home_office_answers add column if not exists works_from_home boolean;
alter table public.client_home_office_answers drop constraint if exists ho_answers_works_from_home;
alter table public.client_home_office_answers add constraint ho_answers_works_from_home
  check (works_from_home is distinct from false or has_dedicated_room = false);

select public._nb234_patch('public._home_office_answers_error(jsonb)'::regprocedure,
$o$  if v_has is null or v_has not in ('true', 'false') then return 'missing_has_room'; end if;
$o$, $n$  if p_data ? 'worksFromHome' and coalesce(p_data->>'worksFromHome', '') not in ('true', 'false') then
    return 'missing_works_from_home';
  end if;
  if p_data->>'worksFromHome' = 'false' then return null; end if;
  if v_has is null or v_has not in ('true', 'false') then return 'missing_has_room'; end if;
$n$);

create or replace function public._home_office_insert_answers(
  p_client_id text, p_user_id uuid, p_step_id text, p_source text, p_data jsonb, p_by uuid
) returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_works boolean := case p_data->>'worksFromHome' when 'true' then true when 'false' then false end;
  v_has boolean := case when v_works is false then false else (p_data->>'hasDedicatedRoom')::boolean end;
  v_total numeric := case when v_has then (p_data->>'totalRooms')::numeric end;
  v_biz numeric := case when v_has then (p_data->>'businessRooms')::numeric end;
  v_id text;
begin
  insert into public.client_home_office_answers
    (user_id, client_id, step_id, source, works_from_home, has_dedicated_room, total_rooms, business_rooms,
     ratio_percent, note, submitted_by)
  values (p_user_id, p_client_id, p_step_id, p_source, v_works, v_has, v_total, v_biz,
          case when v_has then round(v_biz / v_total * 100, 1) end,
          nullif(left(trim(coalesce(p_data->>'note', '')), 1000), ''), p_by)
  returning id into v_id;
  return v_id;
end;
$$;

select public._nb234_patch('public.portal_submit_business_details(text,text,jsonb)'::regprocedure,
$o$  v_has := (p_data->'homeOffice'->>'hasDedicatedRoom')::boolean;
$o$, $n$  v_has := coalesce(p_data->'homeOffice'->>'worksFromHome', '') <> 'false'
             and coalesce((p_data->'homeOffice'->>'hasDedicatedRoom')::boolean, false);
$n$);
select public._nb234_patch('public.portal_submit_business_details(text,text,jsonb)'::regprocedure,
$o$         else 'הלקוח מסר פרטי עסק · אין חדר שמשמש רק לעסק' end);$o$,
$n$         when p_data->'homeOffice'->>'worksFromHome' = 'false' then 'הלקוח מסר פרטי עסק · לא עובד מהבית'
         else 'הלקוח מסר פרטי עסק · אין חדר שמשמש רק לעסק' end);$n$);

-- ── 5 · «פתח עכשיו» — המשרד פותח בקשה שממתינה לבקשה אחרת ─────────────────────
/**
 * ‼ «לכל דבר צריכה להיות אפשרות לגשת» (גיא): בקשה נעולה נפתחת ביד, עם שורה ביומן.
 * מוחקת את כל התלויות של הבקשה הזו (גם של המסלול) — אחרת שרטוט המסלול נועל אותה שוב.
 * הבקשות שאחריה (חיבור → הרשאת תשלום) ממשיכות לחכות לה כרגיל.
 * ‼ לא שולח מייל ולא מפרסם: פרסום לדף נשאר «עדכן את דף הלקוח», כמו כל שינוי.
 */
create or replace function public.office_open_locked_step(p_step_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  s public.onboarding_steps%rowtype;
  v_waits text;
begin
  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if auth.uid() is null or s.user_id <> auth.uid() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.status <> 'locked' then return jsonb_build_object('ok', true, 'noop', true, 'status', s.status); end if;
  if s.flow_run_id is not null and exists (select 1 from public.flow_runs r
                                            where r.id = s.flow_run_id and r.status in ('paused', 'cancelled')) then
    return jsonb_build_object('ok', false, 'error', 'run_paused');
  end if;

  select string_agg(public._client_step_title(p.step_type, p.payload), ' · ') into v_waits
    from public.onboarding_step_dependencies d join public.onboarding_steps p on p.id = d.depends_on_step_id
   where d.step_id = s.id and not public.step_satisfies_dependency(p.status, p.payload);

  delete from public.onboarding_step_dependencies where step_id = s.id;
  update public.onboarding_steps
     set status = 'pending', depends_on_step_id = null, updated_at = now()
   where id = s.id;
  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
    'המשרד פתח את הבקשה עכשיו' || coalesce(' - בלי לחכות ל' || v_waits, ''),
    jsonb_build_object('from', 'locked', 'to', 'pending', 'openedEarly', true));
  perform public.execute_automatic_step(s.id);
  if s.flow_run_id is not null then perform public._flow_progress_safe(s.flow_run_id); end if;
  return jsonb_build_object('ok', true, 'status', 'pending');
end;
$$;
revoke all on function public.office_open_locked_step(text) from public, anon;
grant execute on function public.office_open_locked_step(text) to authenticated;

-- ── 6 · טופס הייצוג: עסק חדש ⇒ ת.ז. + רישיון נהיגה (או «אין לי רישיון») ─────────
-- הטופס יודע מה לבקש מ-prefill (בלי לשנות את חתימת get_onboarding):
--   prefill.newBusiness      — _client_is_new_business (נגזר בשרת, לא מהדפדפן)
--   prefill.noDriverLicense  — מה שהלקוח סימן ({client: true})
create or replace function public.get_onboarding(p_token text)
 RETURNS TABLE(client_name text, firm_name text, branding jsonb, already_submitted boolean, status text, authorities text[], already_signed boolean, has_setup boolean, known_first_name text, known_last_name text, known_email text, known_family_status text, known_family_status_year integer, ni_included boolean, prefill jsonb, scope jsonb, identity_docs jsonb, draft jsonb, spouse_fill jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.client_name,
         coalesce(p.firm_name, '') as firm_name,
         coalesce(p.branding, '{}'::jsonb) as branding,
         (r.onboarding_status = 'submitted') as already_submitted,
         r.status,
         coalesce(r.authorities, '{}'::text[]) as authorities,
         (r.identification ? 'signatureDataUrl') as already_signed,
         (r.signature_setup is not null) as has_setup,
         nullif(c.first_name, '') as known_first_name,
         nullif(c.last_name, '')  as known_last_name,
         nullif(coalesce(c.email, r.client_email), '') as known_email,
         nullif(c.family_status, '') as known_family_status,
         case c.family_status
           when 'married'  then c.marriage_year
           when 'divorced' then c.divorce_year
           when 'widowed'  then c.widowhood_year
           else null
         end as known_family_status_year,
         (jsonb_array_length(public.ni_targets_of(c.authority_representations -> 'nationalInsurance')) > 0) as ni_included,
         -- ‼ 234: newBusiness נגזר בשרת; noDriverLicense = מה שהלקוח סימן בטופס.
         coalesce(r.prefill, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
           'newBusiness', case when c.id is not null and public._client_is_new_business(c.id) then true end,
           'noDriverLicense', r.identification->'noDriverLicense')) as prefill,
         coalesce(r.scope, c.authority_representations, '{}'::jsonb) as scope,
         coalesce(r.identity_docs, '{}'::jsonb) as identity_docs,
         -- הטיוטה חוזרת רק כל עוד יש מה להמשיך; אחרי ההגשה הטופס ממילא לא מוצג.
         case when r.onboarding_status = 'submitted' then '{}'::jsonb
              else coalesce(r.identification->'draft', '{}'::jsonb) end as draft,
         -- ‼ הטוקן של בן/בת הזוג חוזר למי שמחזיק את טוקן הלקוח: הוא זה שיצר
         --   אותו (request_spouse_onboarding מחזירה אותו לאותו מחזיק ממילא).
         jsonb_strip_nulls(jsonb_build_object(
           'requestedAt', r.identification->>'spouseFillRequestedAt',
           'submittedAt', r.identification->>'spouseFillSubmittedAt',
           'token', case when nullif(r.identification->>'spouseFillRequestedAt', '') is not null
                         then nullif(r.spouse_onboarding_token, '') end)) as spouse_fill
  from public.representation_requests r
  join public.profiles p on p.id = r.user_id
  left join public.clients c on c.id = r.linked_client_id
  where r.onboarding_token = p_token
  limit 1;
$function$;

/**
 * «אין לי רישיון נהיגה» — הלקוח מסמן בטופס הייצוג. נשמר על הבקשה (identification),
 * רק לפני ההגשה ורק עם טוקן הקליטה. ‼ זו הצהרה שהמשרד רואה, לא אימות.
 */
create or replace function public.onboarding_set_no_license(p_token text, p_person text, p_value boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r public.representation_requests%rowtype;
begin
  if p_person not in ('client', 'spouse') then return jsonb_build_object('ok', false, 'error', 'bad_person'); end if;
  select * into r from public.representation_requests where onboarding_token = p_token limit 1 for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if r.onboarding_status = 'submitted' then return jsonb_build_object('ok', false, 'error', 'already_submitted'); end if;
  update public.representation_requests
     set identification = coalesce(identification, '{}'::jsonb)
           || jsonb_build_object('noDriverLicense',
                coalesce(identification->'noDriverLicense', '{}'::jsonb)
                || jsonb_build_object(p_person, coalesce(p_value, false))),
         updated_at = now()
   where id = r.id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.onboarding_set_no_license(text, text, boolean) from public;
grant execute on function public.onboarding_set_no_license(text, text, boolean) to anon, authenticated;

select public._nb234_patch('public.assert_domain_function_invariants()'::regprocedure,
$o$    'portal_submit_business_details'
  ];$o$, $n$    'portal_submit_business_details',
    -- 234: «אין לי רישיון נהיגה» בטופס הייצוג — טוקן הקליטה בלבד
    'onboarding_set_no_license'
  ];$n$);

-- ── 7 · ברירות המחדל של המשרדים: «עסק חדש» בלי «תעודת עוסק» ───────────────────
-- ‼ רק הפריט שהזרע הכניס (מפתח vat_cert, התווית המקורית). מה שמשרד הוסיף בעצמו נשאר.
create or replace function public._nb234_strip_vat_cert(p_entry jsonb)
returns jsonb language sql immutable as $$
  select case when p_entry->>'stepType' = 'client_documents' and jsonb_typeof(p_entry->'variants') = 'array'
    then jsonb_set(p_entry, '{variants}', (
      select coalesce(jsonb_agg(case when v->>'key' = 'new_business' and jsonb_typeof(v->'items') = 'array'
        then jsonb_set(v, '{items}', coalesce((select jsonb_agg(i order by o) from jsonb_array_elements(v->'items') with ordinality x(i, o)
                                                where not (i->>'key' = 'vat_cert' and i->>'label' = 'תעודת עוסק')), '[]'::jsonb))
        else v end order by vo), '[]'::jsonb)
      from jsonb_array_elements(p_entry->'variants') with ordinality y(v, vo)))
    else p_entry end;
$$;

update public.office_journey_defaults o
   set entries = (select jsonb_agg(public._nb234_strip_vat_cert(e) order by n)
                    from jsonb_array_elements(o.entries) with ordinality t(e, n)),
       updated_at = now()
 where jsonb_typeof(o.entries) = 'array' and o.entries::text like '%"vat_cert"%';

-- המסלול «קליטת לקוח חדש» בספרייה: גרסה חדשה (לא עריכה של גרסה שכבר רצה על לקוחות).
do $flows$
declare
  f record;
  v_def jsonb;
  v_new jsonb;
begin
  for f in
    select of.id, of.current_version, v.definition
      from public.office_flows of
      join public.office_flow_versions v on v.flow_id = of.id and v.version = of.current_version
     where of.seed_key = 'onboarding' and v.definition::text like '%"vat_cert"%'
  loop
    v_def := f.definition;
    select jsonb_set(v_def, '{stages}', coalesce(jsonb_agg(
             jsonb_set(st, '{items}', coalesce((
               select jsonb_agg(case when it->'ref'->>'stepType' = 'client_documents'
                                       then jsonb_set(it, '{system}',
                                              public._nb234_strip_vat_cert(jsonb_build_object('stepType', 'client_documents')
                                                || coalesce(it->'system', '{}'::jsonb)) - 'stepType')
                                       else it end order by io)
                 from jsonb_array_elements(st->'items') with ordinality z(it, io)), '[]'::jsonb))
             order by so), '[]'::jsonb))
      into v_new
      from jsonb_array_elements(v_def->'stages') with ordinality w(st, so);
    if v_new is distinct from v_def then
      insert into public.office_flow_versions (flow_id, version, definition, note, created_by)
      values (f.id, f.current_version + 1, v_new,
              'עסק חדש שהמשרד פותח: בלי «תעודת עוסק» - היא תוצר הפתיחה (12.10.2026)', null);
      update public.office_flows set current_version = f.current_version + 1, updated_at = now() where id = f.id;
    end if;
  end loop;
end;
$flows$;

drop function public._nb234_strip_vat_cert(jsonb);
drop function public._nb234_patch(regprocedure, text, text, int);

-- ‼ אחרי ההחלה: select public.assert_domain_function_invariants(); — בנפרד (ב-staging יש
--   פונקציות anon של ענף ידע המס שאינן ברשימה, והבדיקה נכשלת שם בלי קשר ל-234).
