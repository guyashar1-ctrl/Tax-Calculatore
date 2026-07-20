-- ═══════════════════════════════════════════════════════════════════════════
--  21 — תזמון הגיבוי השבועי  ·  pg_cron
-- ═══════════════════════════════════════════════════════════════════════════
--  כל יום ראשון ב-03:00 UTC (≈06:00 בישראל) מפעיל את פונקציית weekly-backup.
--  אותה שיטת אימות כמו תזכורות ההצעות: סוד ה-cron מהכספת בכותרת x-cron-secret.
-- ═══════════════════════════════════════════════════════════════════════════

select cron.schedule(
  'weekly-backup',
  '0 3 * * 0',
  $$
  select net.http_post(
    url := 'https://uoweoqtuiettozagwgdw.supabase.co/functions/v1/weekly-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'quotation_reminder_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
