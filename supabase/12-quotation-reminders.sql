-- ─── 12: תזכורת אוטומטית לפני פקיעת תוקף ────────────────────────────────────
-- כלל: תזכורת אחת, 3 ימים לפני הפקיעה, רק ל-sent/viewed. מניעת כפילות מוחלטת
-- דרך auto_reminder_sent_at (תפיסה אטומית). כישלון → תיעוד שגיאה בלי לסמן שנשלח.
-- מתוזמן ב-pg_cron שקורא ל-edge function quotation-reminders פעם ביום.

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.quotations add column if not exists auto_reminder_sent_at   timestamptz;
alter table public.quotations add column if not exists auto_reminder_error     text;
alter table public.quotations add column if not exists auto_reminder_error_at  timestamptz;

-- סוד ה-cron נוצר בתוך ה-DB ולעולם לא עובר דרך כלי חיצוני. ה-cron שולח אותו
-- בכותרת, וה-edge function מאמת מולו (דרך verify_quotation_cron_secret).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'quotation_reminder_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'quotation_reminder_cron_secret');
  end if;
end $$;

create or replace function public.verify_quotation_cron_secret(p text)
returns boolean
language sql
security definer
set search_path to 'public', 'vault'
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'quotation_reminder_cron_secret' and decrypted_secret = p
  );
$$;

revoke all on function public.verify_quotation_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_quotation_cron_secret(text) to service_role;
