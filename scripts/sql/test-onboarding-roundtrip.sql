-- הלוך-ושוב: חמש הרשימות של המשרד (לפני 216) מול המסלול שנבנה מהן.
-- מחזיר דרך PAYLOAD את שני הצדדים; הבדיקה ב-JS מתרגמת את המסלול בחזרה
-- (compileOnboarding) ומשווה. הכול מתבטל.
-- __MODE__ = real — הרשימות של משרד הבדיקות כפי שהן.
--            synthetic — נוספות בקשות משרד: אחת זהה בשני סוגים, אחת שונה בין סוגים,
--                        מסמך מהספרייה, רשות ותאריך יעד — ואז המסלול נבנה מחדש.
do $test$
declare
  uid    uuid := '__USER__';
  v_mode text := '__MODE__';
  v_office uuid;
  v_flow text;
  out    jsonb;
  v_k    text;
begin
  select office_id into v_office from public.profiles where id = uid;
  if v_mode = 'synthetic' then
    perform public.seed_office_journey_defaults(v_office);
    -- הריצות הקיימות מצביעות על המסלול (restrict) — מעבירים לארכיון; הכול מתבטל בסוף.
    update public.office_flows set status = 'archived' where office_id = v_office and trigger = 'quote_approved';
    update public.profiles
       set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{client_documents}',
             '[{"id":"doc-qa","label":"מדריך הוצאות QA","url":"https://example.invalid/x.pdf","path":"x/x.pdf"}]'::jsonb)
     where id = uid;
    for v_k in select unnest(array['licensed_dealer', 'company']) loop
      update public.office_journey_defaults
         set entries = entries || jsonb_build_array(
               jsonb_build_object('key', 'fee_ack-1', 'stepType', 'custom_request', 'enabled', true, 'sortIndex', 95,
                 'source', 'office', 'requiredForClose', false, 'dueInDays', 7, 'dependsOn', null, 'variants', '[]'::jsonb,
                 'payload', '{"title":"אישור שכר טרחה","clientTitle":"אישור שכר טרחה","requirements":[{"key":"i1","kind":"confirm","label":"קראתי ואני מאשר","done":false,"required":true}]}'::jsonb),
               jsonb_build_object('key', 'car-1', 'stepType', 'custom_request', 'enabled', true, 'sortIndex', 96,
                 'source', 'office', 'requiredForClose', null, 'dueInDays', null, 'dependsOn', null, 'variants', '[]'::jsonb,
                 'payload', jsonb_build_object('title', 'הוצאות רכב', 'clientTitle', 'הוצאות רכב - ' || v_k,
                            'requirements', '[{"key":"i1","kind":"file","label":"צילום רישיון רכב","done":false,"required":true}]'::jsonb)),
               jsonb_build_object('key', 'send_document-1', 'stepType', 'custom_request', 'enabled', true, 'sortIndex', 97,
                 'source', 'office', 'requiredForClose', true, 'dueInDays', null, 'dependsOn', null, 'variants', '[]'::jsonb,
                 'documentId', 'doc-qa',
                 'payload', '{"title":"מדריך הוצאות QA","clientTitle":"מדריך הוצאות QA","clientSub":"מסמך מהמשרד - כמה דקות קריאה","clientCta":"לפתיחת המסמך","clientResource":"doc-qa","requirements":[{"key":"opened","kind":"confirm","label":"פתיחת המדריך","done":false,"required":false},{"key":"reviewed","kind":"confirm","label":"עברתי על המדריך","done":false,"required":true}]}'::jsonb))
       where office_id = v_office and client_kind = v_k;
    end loop;
  end if;
  v_flow := public.ensure_onboarding_flow(v_office);
  select jsonb_build_object(
    'definition', (select v.definition from public.office_flow_versions v
                    join public.office_flows f on f.id = v.flow_id and v.version = f.current_version
                   where f.id = v_flow),
    'entries', (select jsonb_object_agg(d.client_kind, d.entries) from public.office_journey_defaults d where d.office_id = v_office),
    'templates', (select coalesce(jsonb_object_agg(t.id, jsonb_build_object('name', t.name, 'entry', t.entries->0)), '{}'::jsonb)
                    from public.journey_templates t where t.kind = 'request' and (t.office_id = v_office or t.office_id is null)),
    'documents', (select coalesce(p.settings->'client_documents', '[]'::jsonb) from public.profiles p where p.id = uid))
    into out;
  raise exception 'PAYLOAD:%', out::text;
end;
$test$;
