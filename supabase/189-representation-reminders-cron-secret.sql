-- 189: סוד ה-cron ל-representation-reminders — באותה שיטה בדיוק כמו
-- quotation_reminder_cron_secret (12-quotation-reminders.sql) ו-automation_worker_secret
-- (150-automation-jobs.sql). נוצר בתוך המסד ולעולם לא עובר דרך כלי חיצוני; ה-cron
-- שולח אותו בכותרת x-cron-secret, וה-edge function מאמת מולו.
--
-- ‼ הפער שהתגלה: representation-reminders (186) יושמה עם אימות Authorization:
-- Bearer <service_role> בלבד — בדיוק כמו quotation-reminders, אבל בלי המסלול השני
-- (x-cron-secret) שהוא זה שה-cron האמיתי בפועל משתמש בו (ראה docs/EMAIL-POLICY.md
-- §5 — הדוגמה שם קוראת ל-net.http_post עם x-cron-secret, לא עם Bearer). בלי המסלול
-- הזה, אין דרך שמשימה מתוזמנת אמיתית תוכל להפעיל את הפונקציה בכלל.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'representation_reminder_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'representation_reminder_cron_secret');
  end if;
end $$;

create or replace function public.verify_representation_reminder_cron_secret(p text)
returns boolean
language sql
security definer
set search_path to 'public', 'vault'
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'representation_reminder_cron_secret' and decrypted_secret = p
  );
$$;

revoke all on function public.verify_representation_reminder_cron_secret(text) from public, anon, authenticated;
grant execute on function public.verify_representation_reminder_cron_secret(text) to service_role;
