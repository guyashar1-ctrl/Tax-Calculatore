-- ═══════════════════════════════════════════════════════════════════════════
-- 237 · ייצוג לבן/בת זוג קיים רק אצל לקוח נשוי (12.10.2026)
--
-- אמיר ויסמרק: ההצעה נבנתה בלי מצב משפחתי, וברירת המחדל שלה היא «ב"ל לשני בני
-- הזוג, אם נשוי» (defaultQuotationRepresentation). בקישור הוא הצהיר «גרוש/ה» —
-- הכרטיס התעדכן, אבל targets נשאר ['client','spouse'], ומסך הביצוע הציע להזין
-- ייפוי כוח לבת זוג שאין לה זהות.
--
-- הכלל, פעם אחת בשרת ולא בכל מסך: כשהכרטיס אומר «לא נשוי» (מצב משפחתי ידוע
-- ושונה מ-married), 'spouse' יוצא מ-targets בכל רשות — בכל נתיב כתיבה (קישור
-- הלקוח, עריכה במשרד, אישור הצעה שמעתיק ברירת מחדל ללקוח קיים).
--
-- ‼ רק כשלא נעשה עבורו/ה כלום. אם כבר הוזן ייפוי כוח / נשמרה אסמכתא / הוזן
--   בשע"ם / התיק פעיל — לא נוגעים. זו עבודה אמיתית שאדם צריך להכריע בה, ומסך
--   הביצוע ממשיך להציג אותה.
-- ‼ מצב משפחתי ריק (לא ידוע) אינו «לא נשוי» — ברירת המחדל נשארת עד שהלקוח מכריע.
-- ‼ לא מסמנים 'cancelled' (212): זה סמן של ביטול מפורש במשרד. כאן האדם פשוט
--   לא קיים, ואם הלקוח יחזור ל«נשוי» — request_authority_representation מוסיף שוב.
-- ‼ שום דבר כאן לא שולח מייל ולא מפרסם.
-- ═══════════════════════════════════════════════════════════════════════════

-- האם כבר נעשה משהו עבור בן/בת הזוג ברשות הזו. מחמיר בכוונה: כל סימן = כן.
create or replace function public._spouse_rep_started(p_client public.clients, p_authority text)
returns boolean language plpgsql stable set search_path to 'public' as $function$
declare
  v_exec   jsonb;
  v_tf     text := case p_authority when 'nationalInsurance' then 'national_insurance'
                                    when 'incomeTax' then 'income_tax' else p_authority end;
  v_track  jsonb;
begin
  -- תיק פעיל של בן/בת הזוג ברשות הזו.
  if exists (select 1 from jsonb_array_elements(coalesce(p_client.tax_files, '[]'::jsonb)) f
              where f->>'authority' = v_tf and f->>'owner' = 'spouse'
                and f->>'repStatus' = 'active') then
    return true;
  end if;

  -- שלב «בקשות» של בן/בת הזוג שהתקדם מעבר לפתיחה.
  if p_authority = 'nationalInsurance' and exists (
       select 1 from public.onboarding_steps s
        where s.client_id = p_client.id and s.step_type = 'authority_representation'
          and s.payload->>'authority' = 'national_insurance' and s.payload->>'subjectRole' = 'spouse'
          and s.status not in ('pending', 'locked', 'cancelled')) then
    return true;
  end if;

  -- פעולה אוטומטית שכבר רצה (או רצה עכשיו) מול ב"ל עבור בן/בת הזוג — גם
  -- ניסיון שנכשל עלול היה להשאיר משהו בצד השני. רק «בתור» נחשב «לא התחיל».
  if p_authority = 'nationalInsurance' and exists (
       select 1 from public.automation_jobs j
        where j.client_id = p_client.id
          and j.action_type in ('btl.create_representation', 'btl.check_representation')
          and j.input ->> 'role' = 'spouse'
          and j.status not in ('queued', 'cancelled')) then
    return true;
  end if;

  if p_client.representation_request_id is null then return false; end if;
  select execution into v_exec from public.representation_requests where id = p_client.representation_request_id;
  if v_exec is null then return false; end if;

  if p_authority = 'nationalInsurance' then
    v_track := v_exec -> 'nationalInsuranceSpouse';
    return jsonb_typeof(v_track) = 'object'
       and (nullif(v_track->>'referenceNumber', '') is not null
            or v_track->>'enteredAt' is not null
            or v_track->>'confirmedAt' is not null);
  end if;

  -- מע"מ / ניכויים: הזנה בשע"ם לבן/בת הזוג.
  v_track := v_exec -> 'shaamEntries' -> (p_authority || ':spouse');
  return v_track is not null and v_track <> 'null'::jsonb and v_track <> '{}'::jsonb;
end;
$function$;

create or replace function public.tg_spouse_scope_follows_family_status()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_reps    jsonb := new.authority_representations;
  v_new     jsonb := new.authority_representations;
  v_key     text;
  v_rec     jsonb;
  v_targets jsonb;
  v_kept    jsonb;
  v_step    public.onboarding_steps%rowtype;
begin
  -- לא ידוע ≠ לא נשוי.
  if new.family_status is null or new.family_status = '' or new.family_status = 'married' then
    return null;
  end if;
  if v_reps is null or jsonb_typeof(v_reps) <> 'object' then return null; end if;

  for v_key, v_rec in select key, value from jsonb_each(v_reps) loop
    -- מ"ה הוא משק בית, בלי targets — מטופל בנפרד (registeredSpouse), לא כאן.
    continue when v_key = 'incomeTax' or jsonb_typeof(v_rec) <> 'object';
    continue when coalesce(v_rec->>'status', 'none') = 'none';

    v_targets := case when v_key = 'nationalInsurance' then public.ni_targets_of(v_rec)
                      when jsonb_typeof(v_rec->'targets') = 'array' then v_rec->'targets'
                      else '["client"]'::jsonb end;
    continue when not (v_targets ? 'spouse');
    continue when public._spouse_rep_started(new, v_key);

    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_kept
      from jsonb_array_elements_text(v_targets) x where x <> 'spouse';
    -- ייצוג שהתבקש רק לבן/בת הזוג — הרשימה הייתה מתרוקנת, ו-[] נקרא כ«הלקוח».
    -- זו לא הכרעה שהשרת לוקח לבד; נשאר כפי שהוא.
    continue when jsonb_array_length(v_kept) = 0;

    v_new := jsonb_set(v_new, array[v_key], (v_rec - 'coversSpouse') || jsonb_build_object('targets', v_kept));

    if v_key = 'nationalInsurance' then
      -- שורת «בקשות» פתוחה של בן/בת הזוג נסגרת עם סיבה גלויה (הסנכרון הקיים
      -- לא סוגר שלב שיצא מ-targets), ופעולה שממתינה בתור לא תרוץ.
      update public.automation_jobs j
         set status = 'cancelled', finished_at = now(), error_code = 'subject_not_married',
             error_detail = 'בכרטיס הלקוח מצב משפחתי «לא נשוי» - אין בן/בת זוג לייצג.'
       where j.client_id = new.id
         and j.action_type in ('btl.create_representation', 'btl.check_representation')
         and j.input ->> 'role' = 'spouse' and j.status = 'queued';

      for v_step in
        select s.* from public.onboarding_steps s
         where s.client_id = new.id and s.step_type = 'authority_representation'
           and s.payload->>'authority' = 'national_insurance' and s.payload->>'subjectRole' = 'spouse'
           and s.status in ('pending', 'locked')
      loop
        update public.onboarding_steps
           set status = 'cancelled', needs_attention = false, updated_at = now(),
               payload = payload || jsonb_build_object('cancelled', jsonb_build_object(
                 'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                 'reason', 'not_married'))
         where id = v_step.id;
        perform public.log_onboarding_event(v_step.user_id, v_step.id, v_step.engagement_id, 'status_changed', 'system',
          'בוטל: בכרטיס הלקוח מצב משפחתי «לא נשוי»',
          jsonb_build_object('from', v_step.status, 'to', 'cancelled', 'reason', 'not_married', 'subjectRole', 'spouse'));
      end loop;
    end if;
  end loop;

  if v_new is distinct from v_reps then
    -- עדכון אמיתי של העמודה, כדי שכל השרשרת הקיימת תרוץ: שומר 212 וסנכרון
    -- שלבי «בקשות» (שלב פתוח של בן/בת הזוג נסגר שם). לא נוגע ב-family_status,
    -- ולכן לא חוזר לכאן דרך העמודה הזו; ובסיבוב השני אין מה להסיר.
    update public.clients set authority_representations = v_new where id = new.id;
  end if;
  return null;
end;
$function$;

drop trigger if exists z_spouse_scope_follows_family_status on public.clients;
create trigger z_spouse_scope_follows_family_status
  after insert or update of family_status, authority_representations on public.clients
  for each row execute function public.tg_spouse_scope_follows_family_status();

revoke execute on function public._spouse_rep_started(public.clients, text) from public, anon, authenticated;
revoke execute on function public.tg_spouse_scope_follows_family_status() from public, anon, authenticated;

-- ── תיקון חד-פעמי של מה שכבר נשמר ─────────────────────────────────────────
-- נוגע מחדש בעמודה רק אצל מי שמחזיק סתירה; הטריגר עצמו מחליט מה להסיר.
update public.clients c
   set authority_representations = c.authority_representations
 where coalesce(c.family_status, '') not in ('', 'married')
   and exists (select 1 from jsonb_each(coalesce(c.authority_representations, '{}'::jsonb)) a
                where a.key <> 'incomeTax' and jsonb_typeof(a.value) = 'object'
                  and coalesce(a.value->>'status', 'none') <> 'none'
                  and (a.value->'targets' ? 'spouse' or coalesce((a.value->>'coversSpouse')::boolean, false)));
