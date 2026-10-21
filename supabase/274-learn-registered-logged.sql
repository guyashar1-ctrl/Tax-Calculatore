-- ═══════════════════════════════════════════════════════════════════════════
-- 274 · לימוד הרשום/ה משע״ם נרשם ב«פעילות» — לא מתחלף בשקט (21.10.2026)
--
-- נמצא בבדיקה המעמיקה (Fable) אחרי 271: _rep_learn_registered_spouse כתב לכרטיס בעלים חדש
-- לתיק מ"ה ו-registered_spouse_verified בלי שום שורה ביומן — הכרעה קודמת של המשרד הייתה
-- נעלמת בלי שאיש יראה. ‼ שע״ם היא מקור האמת (§9.1) ולכן הלמידה נשארת; מה שנוסף: שורה ב«פעילות»
-- על בקשת הייצוג, שאומרת מה נלמד ומאיפה — וכשזה מחליף הכרעה קודמת, גם את זה.
-- ‼ אותה חתימה ואותה התנהגות כמו 271 חוץ מהרישום. שום מייל / פרסום / פנייה לרשות.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._rep_learn_registered_spouse(p_request_id text, p_key text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_learned text := public._rep_shaam_registered_from_notice(p_request_id, p_key);
  c         public.clients%rowtype;
  v_files   jsonb;
  v_id      text;
  v_prev    text;
  v_name    text;
  v_prevnm  text;
  s         public.onboarding_steps%rowtype;
begin
  if v_learned is null then return null; end if;
  select c2.* into c from public.clients c2
    join public.representation_requests r on r.linked_client_id = c2.id
   where r.id = p_request_id for update of c2;
  if c.id is null then return null; end if;
  v_id := nullif(trim(case v_learned when 'spouse' then c.spouse_id_number else c.id_number end), '');
  v_files := case when jsonb_typeof(c.tax_files) = 'array' then c.tax_files else '[]'::jsonb end;
  -- מה היה מוכרע קודם (רק הכרעה מאומתת נחשבת «הכרעה»).
  if c.registered_spouse_verified is true then
    select f ->> 'owner' into v_prev from jsonb_array_elements(v_files) f where f ->> 'authority' = 'income_tax' limit 1;
  end if;
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
  if not found then return v_learned; end if;   -- כבר היה כך — אין מה לרשום

  v_name := case v_learned
              when 'spouse' then coalesce(nullif(trim(coalesce(c.spouse_first_name, '')), ''), nullif(split_part(trim(coalesce(c.spouse_name, '')), ' ', 1), ''), 'בן/בת הזוג')
              else coalesce(nullif(trim(coalesce(c.first_name, '')), ''), 'הלקוח/ה') end;
  v_prevnm := case v_prev
                when 'spouse' then coalesce(nullif(trim(coalesce(c.spouse_first_name, '')), ''), 'בן/בת הזוג')
                when 'client' then coalesce(nullif(trim(coalesce(c.first_name, '')), ''), 'הלקוח/ה') end;
  select * into s from public.onboarding_steps
   where client_id = c.id and step_type = 'representation' and status <> 'cancelled'
   order by created_at desc limit 1;
  if s.id is not null then
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
      'שע״ם העבירה את תיק מס הכנסה למספר של ' || v_name || ' - ' || v_name || ' סומן/ה בכרטיס כבן/בת הזוג הרשום/ה'
        || case when v_prev is not null and v_prev <> v_learned then ' (במקום ' || v_prevnm || ', שסומן/ה קודם)' else '' end,
      jsonb_build_object('requestId', p_request_id, 'submissionKey', p_key, 'learned', v_learned,
                         'previous', v_prev, 'source', 'shaam_creation_notice'));
  end if;
  return v_learned;
end;
$$;
revoke all on function public._rep_learn_registered_spouse(text, text) from public, anon, authenticated;
