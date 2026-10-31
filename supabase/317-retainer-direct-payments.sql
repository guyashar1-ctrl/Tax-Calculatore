-- 317 · «שולם» ידני לחודש ריטיינר של לקוח בלי אשראי (31.10.2026)
--
-- גיא (31.10): לקוח בלי כרטיס בריטיינר של פייפרלס משלם ישירות; «אם עד ה-1.1 לא גביתי ממנו —
-- להוסיף להגשת הדוח». איך יודעים ששילם: «אני אסמן «שולם» בעצמי בתיק הלקוח».
--   ‼ שורה = חודש אחד שנגבה ישירות. אין סליקה ואין קריאה מפייפרלס — רק הסימון של הרו״ח.
--   ‼ ייחודי ללקוח + חודש: לחיצה כפולה / שתי לשוניות לא יוצרות שנייה. ביטול סימון = מחיקת השורה.
--   חודש שסומן נספר «נגבה» ולא עובר להגשת הדוח (billingLedger.ts).

create table if not exists public.retainer_direct_payments (
  id         text primary key default gen_random_uuid()::text,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id  text not null references public.clients(id) on delete cascade,
  month      text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- הסכום שבהסכם לאותו חודש (לפני מע״מ) כפי שהוצג בעת הסימון.
  amount     numeric check (amount >= 0),
  paid_at    timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (client_id, month)
);

create index if not exists retainer_direct_payments_user_idx on public.retainer_direct_payments(user_id);

alter table public.retainer_direct_payments enable row level security;

drop policy if exists "retainer_direct_payments_select_own" on public.retainer_direct_payments;
create policy "retainer_direct_payments_select_own" on public.retainer_direct_payments
  for select using (auth.uid() = user_id);
drop policy if exists "retainer_direct_payments_insert_own" on public.retainer_direct_payments;
create policy "retainer_direct_payments_insert_own" on public.retainer_direct_payments
  for insert with check (auth.uid() = user_id and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));
drop policy if exists "retainer_direct_payments_delete_own" on public.retainer_direct_payments;
create policy "retainer_direct_payments_delete_own" on public.retainer_direct_payments
  for delete using (auth.uid() = user_id);

revoke all on public.retainer_direct_payments from anon;
grant select, insert, delete on public.retainer_direct_payments to authenticated;
