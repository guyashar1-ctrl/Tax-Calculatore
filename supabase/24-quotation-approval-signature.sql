-- ─── 24: חתימת לקוח באישור הצעת מחיר ────────────────────────────────────────
-- הלקוח חותם (canvas → PNG dataURL) ומזין שם חותם לפני האישור. החתימה נשמרת
-- על ההצעה כראיה, ומוצגת לרו"ח בטאב המעקב. האישור נשאר אידמפוטנטי.

alter table public.quotations
  add column if not exists approval_signature   text,
  add column if not exists approval_signer_name text;

-- מחליפים את הפונקציה הישנה (חתימה אחרת = overload, וקריאה עם פרמטר אחד
-- הייתה הופכת דו-משמעית) — לכן קודם drop.
drop function if exists public.approve_quotation(text);

create or replace function public.approve_quotation(
  p_token text,
  p_signature text default null,
  p_signer_name text default null
)
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
        approval_signature = coalesce(p_signature, approval_signature),
        approval_signer_name = coalesce(nullif(trim(p_signer_name), ''), approval_signer_name),
        events = coalesce(events, '[]'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'type', 'approved',
          'at', now(),
          'note', case when nullif(trim(p_signer_name), '') is not null
                       then 'נחתם על ידי ' || trim(p_signer_name) end
        ))
    where id = q.id;
  return 'approved';
end;
$$;

grant execute on function public.approve_quotation(text, text, text) to anon, authenticated;
