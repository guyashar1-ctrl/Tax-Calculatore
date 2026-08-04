-- ═══════════════════════════════════════════════════════════════════════════
--  44 · מילוי אוטומטי של ההקמה הפנימית
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ העיקרון: המערכת לא מבקשת מהרו"ח לסמן דבר שהיא כבר יודעת. מספרי התיקים
--  של עצמאי הם ת.ז. שלו — היא נאספה בתהליך הייצוג. המטפל היחיד במשרד של
--  איש אחד הוא הוא עצמו. שתי תיבות סימון שנוצרו כדי להיסגר ביד, ואין שום
--  סיבה שהן ייסגרו ביד.
--
--  ‼ מה שהפונקציה הזו *לא* עושה: לא נוגעת ב-kyc_identification. אישור הכרת
--  הלקוח הוא חתימה רגולטורית של רואה החשבון, ומכונה לא חותמת במקומו.
--
--  ‼ coalesce בלבד: ערך שהרו"ח כבר הזין בכרטיס לעולם לא נדרס.
--  ‼ אידמפוטנטית: קריאה חוזרת על שלב שכבר מולא אינה משנה דבר ואינה כותבת ליומן.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.autofill_internal_setup(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c           public.clients%rowtype;
  s           public.onboarding_steps%rowtype;
  v_uid       uuid := auth.uid();
  v_item      jsonb;
  v_next      jsonb := '[]'::jsonb;
  v_changed   boolean := false;
  v_open      int := 0;
  v_files     jsonb;
  v_part_b    jsonb;
  v_auth      text[];
  v_emp       text;
  v_filled    text[] := '{}';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into c from public.clients where id = p_client_id;
  if c.id is null or c.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into s from public.onboarding_steps
    where client_id = p_client_id
      and step_type = 'internal_setup'
      and status not in ('completed', 'verified', 'skipped', 'cancelled')
    order by created_at limit 1;
  if s.id is null then
    return jsonb_build_object('ok', true, 'noop', true, 'reason', 'no_open_step');
  end if;

  -- ── מספרי תיקים ─────────────────────────────────────────────────────────
  -- כבר יש בכרטיס תיק עם מספר? אין מה למלא, רק לסמן.
  select case when exists (
    select 1 from jsonb_array_elements(coalesce(c.tax_files, '[]'::jsonb)) t
    where coalesce(t->>'fileNumber', '') <> ''
  ) then c.tax_files else null end into v_files;

  if v_files is null and coalesce(c.id_number, '') <> '' then
    -- הרשויות שנלקח מולן ייצוג קובעות אילו תיקים קיימים. חלק ב' של ייפוי
    -- הכוח הוא המקור המדויק כשמולא; אחרת ת.ז., שהיא ברירת המחדל אצל עצמאי.
    select r.authorities, r.part_b into v_auth, v_part_b
      from public.representation_requests r
      where r.linked_client_id = c.id
      order by r.created_at desc limit 1;

    if v_auth is null or array_length(v_auth, 1) is null then
      v_auth := array['incomeTax', 'vat'];
    end if;

    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',        'tf-auto-' || a,
      'authority', case a when 'incomeTax' then 'income_tax'
                          when 'withholding' then 'deductions'
                          when 'nationalInsurance' then 'national_insurance'
                          else 'vat' end,
      'fileNumber', coalesce(
        nullif(case a when 'incomeTax'   then v_part_b->>'incomeTaxFileNumber'
                      when 'vat'         then v_part_b->>'vatDealerNumber'
                      when 'withholding' then v_part_b->>'withholdingFileNumber'
                 end, ''),
        c.id_number),
      'owner',     'client',
      'repStatus', 'pending',
      'notes',     'מולא אוטומטית בקליטה'
    )))
    into v_files
    from unnest(v_auth) a
    where a in ('incomeTax', 'vat', 'withholding', 'nationalInsurance');

    if v_files is not null then
      update public.clients set tax_files = coalesce(tax_files, v_files)
        where id = c.id and (tax_files is null or tax_files = '[]'::jsonb);
      v_filled := v_filled || 'מספרי תיקים'::text;
    end if;
  end if;

  -- ── שיוך מטפל ───────────────────────────────────────────────────────────
  if coalesce(c.assigned_accountant_id, '') = '' then
    select e.id into v_emp from public.employees e
      where e.user_id = v_uid order by e.created_at limit 1;
    if v_emp is not null then
      update public.clients set assigned_accountant_id = v_emp
        where id = c.id and coalesce(assigned_accountant_id, '') = '';
      v_filled := v_filled || 'שיוך מטפל'::text;
    end if;
  end if;

  -- ── סימון הפריטים ברשימה ────────────────────────────────────────────────
  -- נקרא מחדש מהמסד: ייתכן שהעדכונים שלמעלה שינו את התמונה.
  select * into c from public.clients where id = p_client_id;

  for v_item in select * from jsonb_array_elements(coalesce(s.payload->'checklist', '[]'::jsonb))
  loop
    if coalesce((v_item->>'done')::boolean, false) then
      v_next := v_next || v_item;
      continue;
    end if;

    if v_item->>'key' = 'file_numbers'
       and exists (select 1 from jsonb_array_elements(coalesce(c.tax_files, '[]'::jsonb)) t
                   where coalesce(t->>'fileNumber', '') <> '') then
      v_next := v_next || jsonb_set(v_item, '{done}', 'true'::jsonb);
      v_changed := true;
    elsif v_item->>'key' = 'assignee'
       and coalesce(c.assigned_accountant_id, '') <> '' then
      v_next := v_next || jsonb_set(v_item, '{done}', 'true'::jsonb);
      v_changed := true;
    else
      v_next := v_next || v_item;
      v_open := v_open + 1;    -- נשאר ידני (למשל תדירויות דיווח)
    end if;
  end loop;

  if not v_changed then
    return jsonb_build_object('ok', true, 'noop', true, 'openItems', v_open);
  end if;

  update public.onboarding_steps
    set payload = payload || jsonb_build_object('checklist', v_next),
        -- ‼ כל הפריטים נסגרו לבד ⇒ השלב נסגר לבד. שלב שכולו מסומן ומחכה
        -- ללחיצה נוספת הוא בדיוק סוג הרעש שהמהלך הזה בא לחסל.
        status = case when v_open = 0 then 'completed' else status end,
        completion_method = case when v_open = 0 then 'auto' else completion_method end,
        completed_at = case when v_open = 0 and completed_at is null then now() else completed_at end,
        needs_attention = case when v_open = 0 then false else needs_attention end,
        updated_at = now()
    where id = s.id;

  perform public.log_onboarding_event(
    s.user_id, s.id, s.engagement_id,
    case when v_open = 0 then 'status_changed' else 'note' end,
    'system',
    case when v_open = 0
         then 'ההקמה הפנימית הושלמה אוטומטית — ' || array_to_string(v_filled, ', ')
         else 'הושלם אוטומטית: ' || array_to_string(v_filled, ', ') end,
    jsonb_build_object('autofilled', to_jsonb(v_filled), 'remaining', v_open));

  if v_open = 0 then
    perform public.unlock_dependent_steps(s.id);
  end if;

  return jsonb_build_object('ok', true, 'filled', to_jsonb(v_filled),
                            'openItems', v_open, 'closed', v_open = 0);
end;
$function$;

grant execute on function public.autofill_internal_setup(text) to authenticated;
