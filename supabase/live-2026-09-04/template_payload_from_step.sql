-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_payload jsonb
CREATE OR REPLACE FUNCTION public.template_payload_from_step(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (coalesce(p_payload, '{}'::jsonb)
            - 'published' - 'releaseToken' - 'releaseBody' - 'releaseSubject'
            - 'releaseSentAt' - 'objectionDueDate' - 'submitted' - 'submittedByClient'
            - 'prevAccountantSignature' - 'prevAccountantSignedAt' - 'prevAccountantSignerName'
            - 'authUrl' - 'providerRef'
            - 'autoExecutedAt' - 'autoError' - 'templateOrigin')
      || case when p_payload ? 'checklist' then jsonb_build_object('checklist',
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'key', x->>'key', 'label', x->>'label', 'done', false) order by ord), '[]'::jsonb)
              from jsonb_array_elements(p_payload->'checklist') with ordinality t(x, ord)))
         else '{}'::jsonb end
      || case when p_payload ? 'requirements' then jsonb_build_object('requirements',
           (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                     'required', coalesce((x->>'required')::boolean, true),
                     'options', x->'options',
                     'maxFiles', x->'maxFiles',
                     'done', false)) order by ord), '[]'::jsonb)
              from jsonb_array_elements(p_payload->'requirements') with ordinality t(x, ord)))
         else '{}'::jsonb end;
$function$

