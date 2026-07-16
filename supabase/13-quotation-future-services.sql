-- ─── 13: מחירון שירותים עתידיים על ההצעה ───────────────────────────────────
-- מטרה: הלקוח יידע מראש כמה יעלו שירותים שלא כלולים בהצעה (הצהרת הון, מעבר
-- מעוסק פטור למורשה וכו') — כדי שלא יופתע כשיבקש שירות נוסף.
-- המחירים מוקפאים יחד עם ההצעה (snapshot), כך ששינוי מחירון עתידי לא משנה
-- הצעות שנשלחו.

alter table public.quotations
  add column if not exists future_services jsonb not null default '[]'::jsonb;

-- get_quotation מחזיר גם את מחירון השירותים העתידיים (מה-snapshot אם קיים)
create or replace function public.get_quotation(p_token text)
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
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
    'futureServices', coalesce(q.snapshot->'futureServices', q.future_services, '[]'::jsonb),
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
$$;

grant execute on function public.get_quotation(text) to anon, authenticated;
