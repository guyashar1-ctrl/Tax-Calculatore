-- נמשך חי 2026-08-05 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text
CREATE OR REPLACE FUNCTION public.get_quotation(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'quotationNumber', q.quotation_number,
    'status', q.status,
    'revision', q.revision,
    'expiresAt', q.expires_at,
    'vatRate', coalesce((q.snapshot->>'vatRate')::numeric, q.vat_rate),
    'recipientName', coalesce(q.snapshot->>'recipientName', l.full_name, nullif(trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')), '')),
    'businessName', coalesce(q.snapshot->>'businessName', l.business_name),
    'notesForClient', coalesce(q.snapshot->>'notesForClient', q.notes_for_client),
    'items', coalesce(q.snapshot->'items', q.items),
    'futureServices', coalesce(q.snapshot->'futureServices', q.future_services),
    'representation', coalesce(q.snapshot->'representation', q.representation),
    'onboardingToken', (
      select r.onboarding_token from public.representation_requests r
      where r.id = q.representation_request_id
    ),
    'firm', jsonb_build_object(
      'firmName', p.firm_name,
      'branding', p.branding,
      'email', p.email,
      'phone', p.phone,
      'address', p.address,
      'emailSignature', p.communication->>'emailSignature'
    )
  )
  from public.quotations q
  left join public.leads l   on l.id = q.lead_id
  left join public.clients c on c.id = q.client_id
  left join public.profiles p on p.id = q.user_id
  where q.public_token = p_token
  limit 1;
$function$

