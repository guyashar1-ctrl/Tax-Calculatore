-- נמשך חי 2026-08-07 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_template_id text
CREATE OR REPLACE FUNCTION public.apply_journey_template(p_client_id text, p_template_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c       public.clients%rowtype;
  t       public.journey_templates%rowtype;
  v_uid   uuid := auth.uid();
  e       jsonb;
  v_res   jsonb;
  v_added int := 0;
  v_skip  int := 0;
  v_dup   boolean;
  v_title text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select * into t from public.journey_templates where id = p_template_id and user_id = v_uid;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;

  for e in select * from jsonb_array_elements(t.entries) loop
    if (e->>'stepType') = 'custom_request' then
      -- בקשה חופשית מזוהה לפי הכותרת: אפשר להוסיף כמה שרוצים, אבל לא פעמיים
      -- את אותה אחת.
      v_title := coalesce(nullif(trim(e->'payload'->>'title'), ''),
                          nullif(trim(e->'payload'->>'clientTitle'), ''));
      select exists (select 1 from public.onboarding_steps s
                     where s.client_id = c.id and s.step_type = 'custom_request'
                       and s.status <> 'cancelled'
                       and coalesce(nullif(trim(s.payload->>'title'), ''),
                                    nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title)
        into v_dup;
    else
      -- ‼ קיים ⇒ מדלגים. תבנית מוסיפה, לעולם לא דורסת ניסוח שכבר נערך ידנית
      -- ולא מוחקת בקשה שכבר רצה מול הלקוח.
      select exists (select 1 from public.onboarding_steps s
                     where s.client_id = c.id and s.step_type = e->>'stepType'
                       and s.status <> 'cancelled')
        into v_dup;
    end if;

    if v_dup then v_skip := v_skip + 1; continue; end if;

    v_res := public.create_onboarding_request(c.id, e->>'stepType', coalesce(e->'payload','{}'::jsonb));
    if coalesce((v_res->>'ok')::boolean, false) then v_added := v_added + 1;
    else v_skip := v_skip + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skip, 'template', t.name);
end;
$function$

