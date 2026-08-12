-- ─── 88: חיובים נוספים — פריט כספי חד-פעמי מעבר לריטיינר ───────────────────
-- מסך הלקוחות V3.3, המקור החזותי המחייב:
-- docs/prototypes/customers-v3-production-reference.html (מקטע "חיובים נוספים")
--
-- ‼ זה לא הצעת מחיר ולא התקשרות — פריט כספי פשוט שמצטרף לריטיינר הרגיל,
-- ולכן אינו נתלה על quotations/engagements רק כי הטבלאות האלה כבר קיימות.
-- הסכום, הסטטוס וההיסטוריה שייכים לחיוב עצמו; quotations/engagements
-- ממשיכים לתאר בדיוק את מה שתיארו קודם.
--
-- מודל המצבים קטן בכוונה — 'pending'→'requested' בלבד. אין 'paid': אין
-- אינטגרציית סליקה במערכת, ולכן אי אפשר לדעת בביטחון שהתשלום התקבל.
-- הרחבה עתידית ל"שולם" תדרוש מנגנון אישור אמיתי (webhook מספק סליקה /
-- סימון ידני מפורש) ולא תשבור את המבנה הזה — quotient_id/status נשארים.

create table public.additional_charges (
  id            text primary key default gen_random_uuid()::text,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- ‼ on delete cascade ולא set null: חיוב נוסף הוא פריט טפל לאדם, לא רשומה
  -- עצמאית כמו הצעה/ליד — בלי הלקוח הוא חסר משמעות ולא אמור להישאר יתום.
  client_id     text not null references public.clients(id) on delete cascade,
  description   text not null,
  amount        numeric not null check (amount > 0),
  currency      text not null default 'ILS',
  status        text not null default 'pending' check (status in ('pending', 'requested')),
  requested_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index additional_charges_user_id_idx     on public.additional_charges(user_id);
create index additional_charges_client_id_idx   on public.additional_charges(client_id);
create index additional_charges_user_status_idx on public.additional_charges(user_id, status);

alter table public.additional_charges enable row level security;

create policy "additional_charges_select_own" on public.additional_charges
  for select using (auth.uid() = user_id);
create policy "additional_charges_insert_own" on public.additional_charges
  for insert with check (auth.uid() = user_id);
create policy "additional_charges_update_own" on public.additional_charges
  for update using (auth.uid() = user_id);
create policy "additional_charges_delete_own" on public.additional_charges
  for delete using (auth.uid() = user_id);

create trigger additional_charges_updated_at
  before update on public.additional_charges
  for each row execute function public.set_updated_at();
