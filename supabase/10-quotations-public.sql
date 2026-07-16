-- ─── 10: גישה ציבורית לעמוד ההצעה (?quote=TOKEN) ───────────────────────────
-- הטוקן עצמו הוא האישור (כמו get_intake / signing-session). כל הפונקציות
-- security definer ומוגבלות לפעולה אחת. אישור בלבד — אין דחייה/בקשת שינויים.

-- קריאת ההצעה + מיתוג המשרד. מעדיף snapshot קפוא (מרגע השליחה); אם אין —
-- קורא מהשדות החיים (טיוטה שעדיין לא נשלחה, למשל בדיקת הרו"ח).
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

-- סימון "נצפתה" — רק במעבר מ-sent. שומר חותמת ראשונה ומוסיף אירוע.
create or replace function public.mark_quotation_viewed(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  q public.quotations%rowtype;
begin
  select * into q from public.quotations where public_token = p_token limit 1;
  if q.id is null then return false; end if;
  if q.status = 'sent' then
    update public.quotations
      set status = 'viewed',
          first_viewed_at = coalesce(first_viewed_at, now()),
          events = coalesce(events, '[]'::jsonb) || jsonb_build_object('type','viewed','at', now())
      where id = q.id;
  end if;
  return true;
end;
$$;

-- אישור ההצעה על ידי הלקוח. אידמפוטנטי; חוסם אם פג תוקף / בוטלה.
-- מחזיר את הסטטוס הסופי: approved | expired | cancelled | invalid.
-- המרת ליד ללקוח + מסירה לתהליך הייצוג נעשות בצד הרו"ח (שלב 4).
create or replace function public.approve_quotation(p_token text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  q public.quotations%rowtype;
begin
  select * into q from public.quotations where public_token = p_token limit 1;
  if q.id is null then return 'invalid'; end if;
  if q.status = 'approved' then return 'approved'; end if;
  if q.status = 'cancelled' then return 'cancelled'; end if;
  if q.expires_at is not null and q.expires_at < now() then
    update public.quotations
      set status = 'expired',
          events = coalesce(events, '[]'::jsonb) || jsonb_build_object('type','expired','at', now())
      where id = q.id and status <> 'expired';
    return 'expired';
  end if;
  if q.status not in ('sent','viewed') then return q.status; end if;
  update public.quotations
    set status = 'approved',
        approved_at = now(),
        events = coalesce(events, '[]'::jsonb) || jsonb_build_object('type','approved','at', now())
    where id = q.id;
  return 'approved';
end;
$$;

grant execute on function public.get_quotation(text) to anon, authenticated;
grant execute on function public.mark_quotation_viewed(text) to anon, authenticated;
grant execute on function public.approve_quotation(text) to anon, authenticated;
