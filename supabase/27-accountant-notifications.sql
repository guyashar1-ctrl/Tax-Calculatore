-- ═══════════════════════════════════════════════════════════════════════════
--  27 — התראות לרו"ח על התקדמות אצל הלקוח
-- ═══════════════════════════════════════════════════════════════════════════
--  שלושת האירועים שקורים אצל הלקוח, בעמוד ציבורי, בלי שאיש מהמשרד נוכח:
--    1. חתם על הצעת המחיר
--    2. מילא את פרטי הייצוג
--    3. חתם על ייפוי הכוח
--  בלי התראה, הדרך היחידה לדעת שמשהו זז היא להיכנס למערכת ולבדוק.
--
--  ‼ תור ולא שליחה ישירה. שליחת מייל מתוך טריגר הייתה קושרת את הצלחת
--  הפעולה של הלקוח לזמינות שרת המייל: תקלה ברסנד הייתה מפילה את החתימה
--  עצמה. כאן הטריגר רק רושם שורה בתור, והשליחה נעשית אחריו ובנפרד —
--  מיד מהדפדפן של הלקוח, ואם זה לא קרה, בכניסה הבאה של הרו"ח למערכת.
--
--  ‼ טריגרים ולא קריאות מתוך הפונקציות. האירוע נתפס בכל מסלול שמגיע אליו,
--  כולל מסלולים שייכתבו בעתיד, ואי אפשר לשכוח להוסיף קריאה.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.accountant_notifications (
  id          text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,   -- quotation_approved | onboarding_submitted | poa_signed
  quotation_id text,
  request_id  text,
  client_id   text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    int not null default 0,
  error       text
);

create index if not exists accountant_notifications_pending_idx
  on public.accountant_notifications (user_id, created_at)
  where sent_at is null;

alter table public.accountant_notifications enable row level security;

-- הרו"ח רואה את ההתראות שלו. הכתיבה נעשית ע"י טריגרים (SECURITY DEFINER)
-- וע"י פונקציית השרת עם service role — לא מהדפדפן.
drop policy if exists accountant_notifications_select_own on public.accountant_notifications;
create policy accountant_notifications_select_own on public.accountant_notifications
  for select using (auth.uid() = user_id);

drop policy if exists require_authorized on public.accountant_notifications;
create policy require_authorized on public.accountant_notifications
  as restrictive for all to authenticated
  using (public.is_authorized()) with check (public.is_authorized());

-- ─── 1. הצעה נחתמה ──────────────────────────────────────────────────────────
create or replace function public.notify_quotation_approved()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(old.status, '') <> 'approved' and new.status = 'approved' then
    insert into public.accountant_notifications (user_id, kind, quotation_id, client_id, payload)
    values (new.user_id, 'quotation_approved', new.id, new.client_id,
            jsonb_build_object(
              'quotationNumber', new.quotation_number,
              'signerName', new.approval_signer_name,
              'recipientName', new.snapshot->>'recipientName'));
  end if;
  return new;
end;
$$;

drop trigger if exists quotations_notify_approved on public.quotations;
create trigger quotations_notify_approved
  after update on public.quotations
  for each row execute function public.notify_quotation_approved();

-- ─── 2. פרטי הייצוג מולאו ───────────────────────────────────────────────────
create or replace function public.notify_onboarding_submitted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(old.onboarding_status, '') <> 'submitted'
     and new.onboarding_status = 'submitted' then
    insert into public.accountant_notifications (user_id, kind, request_id, client_id, payload)
    values (new.user_id, 'onboarding_submitted', new.id, new.linked_client_id,
            jsonb_build_object('clientName', new.client_name));
  end if;
  return new;
end;
$$;

drop trigger if exists rep_requests_notify_onboarding on public.representation_requests;
create trigger rep_requests_notify_onboarding
  after update on public.representation_requests
  for each row execute function public.notify_onboarding_submitted();

-- ─── 3. ייפוי הכוח נחתם ─────────────────────────────────────────────────────
-- נמדד לפי מספר החותמים שחתמו, ולא לפי סטטוס הבקשה: בתא משפחתי יש שני
-- חותמים, ואם נחכה לשינוי הסטטוס נדע רק על האחרון מביניהם.
create or replace function public.notify_poa_signed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_before int;
  v_after  int;
  v_names  text;
begin
  select count(*) into v_before
    from jsonb_array_elements(coalesce(old.signers, '[]'::jsonb)) s
    where s->>'signStatus' = 'signed';
  select count(*) into v_after
    from jsonb_array_elements(coalesce(new.signers, '[]'::jsonb)) s
    where s->>'signStatus' = 'signed';

  if v_after > v_before then
    select string_agg(s->>'name', ', ') into v_names
      from jsonb_array_elements(coalesce(new.signers, '[]'::jsonb)) s
      where s->>'signStatus' = 'signed';

    insert into public.accountant_notifications (user_id, kind, request_id, client_id, payload)
    values (new.user_id, 'poa_signed', new.id, new.linked_client_id,
            jsonb_build_object(
              'clientName', new.client_name,
              'signedNames', coalesce(v_names, ''),
              'signedCount', v_after,
              'totalSigners', jsonb_array_length(coalesce(new.signers, '[]'::jsonb))));
  end if;
  return new;
end;
$$;

drop trigger if exists rep_requests_notify_poa on public.representation_requests;
create trigger rep_requests_notify_poa
  after update on public.representation_requests
  for each row execute function public.notify_poa_signed();

-- ─── שליפת התור לשליחה ──────────────────────────────────────────────────────
-- נקראת ע"י פונקציית השרת בלבד (service role). הטוקן הציבורי מזהה את הרו"ח
-- שאליו שייך האירוע — כך שהדפדפן של הלקוח יכול להפעיל שליחה בלי להתחבר,
-- ובלי לחשוף שום מידע: הוא רק מפעיל, לא מקבל.
create or replace function public.user_id_for_public_token(p_token text)
returns uuid
language sql
security definer
set search_path to 'public'
stable
as $$
  select user_id from public.quotations where public_token = p_token
  union all
  select user_id from public.representation_requests where onboarding_token = p_token
  union all
  select r.user_id from public.representation_requests r
    where exists (select 1 from jsonb_array_elements(coalesce(r.signers, '[]'::jsonb)) s
                  where s->>'signToken' = p_token)
  limit 1;
$$;

revoke all on function public.user_id_for_public_token(text) from public, anon, authenticated;
