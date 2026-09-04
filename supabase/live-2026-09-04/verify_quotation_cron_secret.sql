-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p text
CREATE OR REPLACE FUNCTION public.verify_quotation_cron_secret(p text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'quotation_reminder_cron_secret' and decrypted_secret = p
  );
$function$

