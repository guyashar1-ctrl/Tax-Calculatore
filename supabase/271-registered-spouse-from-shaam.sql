-- ═══════════════════════════════════════════════════════════════════════════
-- 271 · בן/בת הזוג הרשום/ה נלמד משע״ם, והחתימות לפיו (21.10.2026)
--
-- המקרה: ליאת ואוריה ברנשטיין. ההזנה בשע״ם רצה על ת.ז. של ליאת (מ"ה + מע"מ) לפני שהוכרע
-- מי הרשום (269). שע״ם העבירה את מס הכנסה לתיק של אוריה וכתבה בהודעת היצירה: «במס הכנסה
-- הוחלף מספר התיק למספרו של בעל התיק». מקומות החתימה (218) הניחו שמי שהוזן הוא הרשום —
-- ושיבצו את ליאת ב«חתימת בן זוג רשום». הכרעת גיא: ללמוד את הרשום משע״ם, ולחתום לפיו.
--
-- ‼ הראיה: המשפט «הוחלף מספר התיק» בהודעת היצירה (execution.shaam.<key>.creationNotice), אצל
--   נשוי/אה ובהגשה שנושאת מס הכנסה. נצפה חי אצל ליאת; לא מופיע אצל רווק/ה או גרוש/ה (נבדק בייצור).
--   בלי המשפט ⇒ לא מסיקים כלום מהודעה; ההכרעה המאומתת שבכרטיס (registered_spouse_verified) גוברת
--   על «מי שהוזן».
-- ‼ הלמידה כותבת לכרטיס בדיוק מה שכפתור «מי רשום» כותב (handleConfirmRegisteredSpouse): בעלים של
--   תיק מ"ה + מספרו (רק כשריק או ת.ז. של אחד מבני הזוג) + registered_spouse_verified. אחרי זה הבקשה
--   שנפתחה נשארת אחת — החלוקה ננעלת בדפדפן (submissionItOwner), לא נפתחת בקשה שנייה.
-- ‼ שום דבר כאן לא שולח מייל, לא מפרסם לדף ולא פונה לרשות.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._r271_patch(p_fn regprocedure, p_old text, p_new text, p_expected int default 1)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_n int := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
begin
  if (p_new <> '' and position(p_new in v_def) > 0) or (p_new = '' and v_n = 0) then return; end if;
  if v_n <> p_expected then
    raise exception '271: anchor count % (expected %) in %: %', v_n, p_expected, p_fn, left(p_old, 120);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

/** הרשום/ה לפי הודעת היצירה של שע״ם — או null כשאין ראיה. */
create or replace function public._rep_shaam_registered_from_notice(p_request_id text, p_key text)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  r        public.representation_requests%rowtype;
  c        public.clients%rowtype;
  v_track  jsonb;
  v_person text := substring(p_key from '^person:(client|spouse)$');
begin
  if v_person is null then return null; end if;
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null then return null; end if;
  select * into c from public.clients where id = r.linked_client_id;
  if c.id is null or coalesce(c.family_status, '') <> 'married' then return null; end if;
  v_track := r.execution #> array['shaam', p_key];
  if jsonb_typeof(v_track -> 'requestedSystems') <> 'array' or not (v_track -> 'requestedSystems') ? 'מס הכנסה' then
    return null;
  end if;
  if position('הוחלף מספר התיק' in coalesce(v_track #>> '{creationNotice,text}', '')) = 0 then return null; end if;
  return case v_person when 'client' then 'spouse' else 'client' end;
end;
$$;
revoke all on function public._rep_shaam_registered_from_notice(text, text) from public, anon, authenticated;

/** מי חותם/ת ב«חתימת בן זוג רשום» בטופס של ההגשה: ראיה משע״ם > הכרעה מאומתת בכרטיס > מי שהוזן. */
create or replace function public._rep_registered_signer(p_request_id text, p_key text)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_person  text := substring(p_key from '^person:(client|spouse)$');
  v_learned text := public._rep_shaam_registered_from_notice(p_request_id, p_key);
  v_owner   text;
begin
  if v_learned is not null then return v_learned; end if;
  select f ->> 'owner' into v_owner
    from public.representation_requests r
    join public.clients c on c.id = r.linked_client_id,
         jsonb_array_elements(case when jsonb_typeof(c.tax_files) = 'array' then c.tax_files else '[]'::jsonb end) f
   where r.id = p_request_id and c.registered_spouse_verified is true
     and f ->> 'authority' = 'income_tax' and f ->> 'owner' in ('client', 'spouse')
   limit 1;
  return coalesce(v_owner, v_person);
end;
$$;
revoke all on function public._rep_registered_signer(text, text) from public, anon, authenticated;

/** הראיה משע״ם נכתבת לכרטיס — כמו לחיצה על השם (handleConfirmRegisteredSpouse). מחזיר את מי שנלמד. */
create or replace function public._rep_learn_registered_spouse(p_request_id text, p_key text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_learned text := public._rep_shaam_registered_from_notice(p_request_id, p_key);
  c         public.clients%rowtype;
  v_files   jsonb;
  v_id      text;
begin
  if v_learned is null then return null; end if;
  select c2.* into c from public.clients c2
    join public.representation_requests r on r.linked_client_id = c2.id
   where r.id = p_request_id for update of c2;
  if c.id is null then return null; end if;
  v_id := nullif(trim(case v_learned when 'spouse' then c.spouse_id_number else c.id_number end), '');
  v_files := case when jsonb_typeof(c.tax_files) = 'array' then c.tax_files else '[]'::jsonb end;
  if exists (select 1 from jsonb_array_elements(v_files) f where f ->> 'authority' = 'income_tax') then
    select jsonb_agg(case when f ->> 'authority' = 'income_tax'
                          then f || jsonb_build_object('owner', v_learned)
                               || case when v_id is not null and (coalesce(f ->> 'fileNumber', '') = ''
                                         or f ->> 'fileNumber' in (coalesce(c.id_number, ''), coalesce(c.spouse_id_number, '')))
                                       then jsonb_build_object('fileNumber', v_id) else '{}'::jsonb end
                          else f end order by o)
      into v_files
      from jsonb_array_elements(v_files) with ordinality t(f, o);
  else
    v_files := v_files || jsonb_build_array(jsonb_build_object(
      'id', 'tf-auto-incomeTax', 'authority', 'income_tax', 'owner', v_learned,
      'fileNumber', coalesce(v_id, ''), 'repStatus', 'pending', 'notes', 'נלמד משע״ם בפתיחת הייצוג'));
  end if;
  update public.clients
     set tax_files = v_files, registered_spouse_verified = true, updated_at = now()
   where id = c.id
     and (tax_files is distinct from v_files or registered_spouse_verified is not true);
  return v_learned;
end;
$$;
revoke all on function public._rep_learn_registered_spouse(text, text) from public, anon, authenticated;

-- ── החתימות לפי הרשום/ה ──────────────────────────────────────────────────────
select public._r271_patch('public._rep_prepare_signature_document(text,text)'::regprocedure,
$o$    'fields', public._rep_build_2279_fields(v_person, v_married and v_it),$o$,
$n$    -- ‼ 271: ב«בן זוג רשום» חותם/ת הרשום/ה — לא בהכרח מי שהוזן (שע״ם מעבירה את מ"ה לרשום/ה).
    'fields', public._rep_build_2279_fields(
                case when v_married and v_it then public._rep_registered_signer(r.id, p_key) else v_person end,
                v_married and v_it),$n$);

-- ── הלמידה רצה כשהטופס הגיע, לפני הכנת המקומות ──────────────────────────────
select public._r271_patch('public.sync_shaam_signature_places_from_job()'::regprocedure,
$o$  perform public._rep_prepare_signature_document(v_req_id, v_key);$o$,
$n$  -- ‼ 271: «הוחלף מספר התיק» ⇒ הרשום/ה הוא/היא בן/בת הזוג השני/ה — לכרטיס, ואז המקומות.
  perform public._rep_learn_registered_spouse(v_req_id, v_key);
  perform public._rep_prepare_signature_document(v_req_id, v_key);$n$);

do $$
begin
  if position('_rep_registered_signer' in pg_get_functiondef('public._rep_prepare_signature_document(text,text)'::regprocedure)) = 0
     or position('_rep_learn_registered_spouse' in pg_get_functiondef('public.sync_shaam_signature_places_from_job()'::regprocedure)) = 0 then
    raise exception '271: patch missing';
  end if;
end;
$$;

drop function public._r271_patch(regprocedure, text, text, int);
