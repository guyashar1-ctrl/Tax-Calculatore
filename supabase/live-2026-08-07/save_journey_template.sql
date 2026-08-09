-- נמשך חי 2026-08-07 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_name text, p_description text
CREATE OR REPLACE FUNCTION public.save_journey_template(p_client_id text, p_name text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c       public.clients%rowtype;
  v_uid   uuid := auth.uid();
  v_items jsonb;
  v_id    text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_name');
  end if;

  -- ‼ שומרים את הניסוח וההגדרות, לא את המצב. סטטוס, כדור, תאריכים ומסמכים
  -- שהתקבלו שייכים ללקוח הזה בלבד ואין להם מה לעבור לתבנית.
  select coalesce(jsonb_agg(jsonb_build_object(
           'stepType', s.step_type,
           'payload', (s.payload - 'published' - 'releaseToken' - 'releaseBody' - 'releaseSubject'
                                 - 'releaseSentAt' - 'objectionDueDate' - 'submitted' - 'submittedByClient'
                                 - 'prevAccountantSignature' - 'prevAccountantSignedAt' - 'prevAccountantSignerName'
                                 - 'authUrl' - 'providerRef')
             -- פריטים חוזרים ריקים: התבנית אומרת מה לבקש, לא מה כבר הגיע.
             || case when s.payload ? 'checklist' then jsonb_build_object('checklist',
                  (select coalesce(jsonb_agg(jsonb_build_object('key',x->>'key','label',x->>'label','done',false) order by ord), '[]'::jsonb)
                     from jsonb_array_elements(s.payload->'checklist') with ordinality t(x,ord)))
                else '{}'::jsonb end
             || case when s.payload ? 'requirements' then jsonb_build_object('requirements',
                  (select coalesce(jsonb_agg(jsonb_build_object('key',x->>'key','kind',x->>'kind','label',x->>'label','done',false) order by ord), '[]'::jsonb)
                     from jsonb_array_elements(s.payload->'requirements') with ordinality t(x,ord)))
                else '{}'::jsonb end)
         order by s.sort_order, s.created_at), '[]'::jsonb)
    into v_items
    from public.onboarding_steps s
   where s.client_id = c.id
     and s.status <> 'cancelled'
     -- הייצוג נולד מבקשת הייצוג ולא מתבנית; שלבים אוטומטיים אינם ניתנים להרכבה.
     and s.step_type not in ('representation', 'representation_upgrade', 'internal_setup', 'first_month_review');

  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_save');
  end if;

  insert into public.journey_templates (user_id, name, description, entries)
  values (v_uid, trim(p_name), nullif(trim(coalesce(p_description,'')), ''), v_items)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'templateId', v_id, 'count', jsonb_array_length(v_items));
end;
$function$

