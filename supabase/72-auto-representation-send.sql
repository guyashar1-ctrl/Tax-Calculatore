-- 72 · מייל הייצוג נשלח אוטומטית מיד עם אישור ההצעה
--
-- הכרעת גיא D1 (2026-08-07):
--   "מייל הייצוג נשלח אוטומטית, מיד אחרי אישור ההצעה — מצד השרת, אטומי
--    ואידמפוטנטי; בלי תלות בכניסת רו"ח ובלי כפילויות; כשל חייב להיות גלוי
--    וניתן לניסיון חוזר."
--
-- מה היה עד היום: אישור הצעה **לא שלח כלום**. היו שני מסלולים חלקיים —
-- תיבת סימון בדיאלוג של הרו"ח, ואפקט 24 שעות שרץ בדפדפן שלו בכניסה למערכת.
-- לקוח שאישר בשישי בערב חיכה לקישור עד שגיא נכנס למערכת.
--
-- ‼ סדר ההחלה: המיגרציה הזאת מפעילה קריאה ל-Edge Function שחייבת כבר לתמוך
--   בסוד הפנימי. לכן היא **אחרונה** — אחרי פריסת הפונקציות. ראה §19.3 בתוכנית.
--
-- ארכוב לפני החלפה: supabase/live-2026-08-07/approve_quotation.sql

-- ── 1 · הסוד הפנימי וכתובת הפונקציות ────────────────────────────────────────
-- ‼ שני ערכים לכל סביבה. הם *לא* נכתבים כאן בקוד: מיגרציה שנכנסת לגיט לא
--   תחזיק סוד, וכתובת הפונקציות שונה בין הפרודקשן לסביבת הבדיקות. הסוד נוצר
--   אקראית אם אינו קיים; הכתובת נקבעת בנפרד לכל סביבה (ראה docs/EMAIL-POLICY.md).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'internal_send_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'internal_send_secret',
      'סוד פנימי לקריאות שרת→Edge Function. אינו יוצא מהמסד ואינו בגיט.');
  end if;
end $$;

-- אימות הסוד — אותה תבנית בדיוק של verify_quotation_cron_secret (מיגרציה 12).
create or replace function public.verify_internal_send_secret(p text)
returns boolean
language sql stable security definer set search_path to 'public', 'vault'
as $function$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'internal_send_secret' and decrypted_secret = p
  );
$function$;

revoke all on function public.verify_internal_send_secret(text) from public, anon, authenticated;

-- ── 2 · הפעלת השליחה מתוך אישור ההצעה ───────────────────────────────────────
-- ‼ ההגדרה החיה (live-2026-08-07) + בלוק אחד בסוף. שום דבר בפאן-אאוט הקיים
--   לא נגע: הסטטוס, החתימה, האירועים, פתיחת הייצוג ויצירת ההתקשרות — מילה
--   במילה כפי שהיו.
--
-- ‼ הבלוק עטוף ב-exception handler שבולע הכול. כשל בשליחת מייל **לעולם לא
--   יפיל אישור הצעה**: הלקוח כבר חתם, וזה חייב להיתפס. כשל משאיר את
--   representation_sent_at ריק, וההתראה היומית תתפוס אותו.
--
-- ‼ net.http_post נרשם בתור בתוך הטרנזקציה ונשלח בפועל רק אחרי ה-commit.
--   אישור שיתגלגל לאחור לא ישלח כלום — בדיוק ההתנהגות הרצויה.
create or replace function public.approve_quotation(p_token text, p_signature text default null::text, p_signer_name text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  q         public.quotations%rowtype;
  v_req_id  text;
  v_token   text;
  v_needs   boolean := false;
  v_reused  boolean := false;
  v_secret  text;
  v_base    text;
begin
  select * into q from public.quotations where public_token = p_token limit 1;
  if q.id is null then return jsonb_build_object('status', 'invalid'); end if;

  if q.status = 'approved' then
    v_reused := q.representation_request_id is not null;
    v_req_id := coalesce(q.representation_request_id, public.open_quotation_representation(q.id));
  elsif q.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled');
  elsif q.expires_at is not null and q.expires_at < now() then
    update public.quotations
      set status = 'expired',
          events = coalesce(events, '[]'::jsonb) || jsonb_build_object('type','expired','at', now())
      where id = q.id and status <> 'expired';
    return jsonb_build_object('status', 'expired');
  elsif q.status not in ('sent','viewed') then
    return jsonb_build_object('status', q.status);
  else
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

    v_req_id := public.open_quotation_representation(q.id);
    select (r.created_at < now() - interval '10 seconds') into v_reused
      from public.representation_requests r where r.id = v_req_id;
  end if;

  begin
    perform public.create_engagement_for_quotation(q.id, false);
  exception when others then
    null;
  end;

  select r.onboarding_token, coalesce(r.onboarding_status, 'pending') = 'pending'
    into v_token, v_needs
    from public.representation_requests r where r.id = v_req_id;

  -- ── חדש · שליחת מייל הייצוג, מהשרת, מיד ─────────────────────────────────
  begin
    -- נשלח רק כשיש בקשת ייצוג שהלקוח עוד לא מילא, וכשטרם נשלח מייל עליה.
    if v_req_id is not null and coalesce(v_needs, false) and q.representation_sent_at is null then
      select decrypted_secret into v_secret from vault.decrypted_secrets
       where name = 'internal_send_secret' limit 1;
      select decrypted_secret into v_base from vault.decrypted_secrets
       where name = 'functions_base_url' limit 1;

      if v_secret is null or v_base is null then
        -- ‼ חסר סוד או כתובת ⇒ לא שולחים, אבל גם לא שותקים. ההתראה היומית
        --   תתפוס את ההצעה הזאת כ"קישור לא יצא", והרו"ח ישלח ידנית.
        perform public.log_onboarding_event(q.user_id, null, null, 'note', 'system',
          'מייל הייצוג לא נשלח אוטומטית — חסרה הגדרת שליחה פנימית',
          jsonb_build_object('quotationId', q.id));
      else
        perform net.http_post(
          url     := rtrim(v_base, '/') || '/functions/v1/send-onboarding-email',
          body    := jsonb_build_object('internalSecret', v_secret, 'quotationId', q.id),
          params  := '{}'::jsonb,
          headers := jsonb_build_object('Content-Type', 'application/json'),
          timeout_milliseconds := 15000);
      end if;
    end if;
  exception when others then
    -- ‼ כשל כאן אינו מפיל את האישור. הלקוח חתם — זה חייב להיתפס.
    begin
      perform public.log_onboarding_event(q.user_id, null, null, 'note', 'system',
        'מייל הייצוג לא נשלח אוטומטית — שגיאה בהפעלת השליחה',
        jsonb_build_object('quotationId', q.id, 'error', sqlerrm));
    exception when others then null;
    end;
  end;

  return jsonb_build_object(
    'status', 'approved',
    'onboardingToken', case when coalesce(v_needs, false) then v_token end,
    'repReused', coalesce(v_reused, false)
  );
end;
$function$;

-- ── 3 · ההתראה "הקישור לא יצא" ──────────────────────────────────────────────
-- ‼ זו היורשת של מנגנון 24 השעות. ההבדל: הישן שלח מייל **ללקוח** מהדפדפן של
--   גיא; זו התראה **פנימית** בלבד, ואף מייל ללקוח אינו יוצא ממנה.
create or replace function public.flag_missing_representation_links()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select q.id, q.user_id, q.quotation_number, q.client_id
      from public.quotations q
      join public.representation_requests rr on rr.id = q.representation_request_id
     where q.status = 'approved'
       and q.representation_sent_at is null
       and coalesce(rr.onboarding_status, 'pending') = 'pending'
       and q.approved_at < now() - interval '24 hours'
       -- פעם אחת להצעה. התראה שחוזרת כל יום הופכת לרעש שמתעלמים ממנו.
       and not exists (
         select 1 from public.accountant_notifications an
          where an.kind = 'representation_link_missing'
            and an.payload->>'quotationId' = q.id)
  loop
    perform public.queue_accountant_notification(
      r.user_id, 'representation_link_missing', r.client_id, null, null, null,
      jsonb_build_object('quotationId', r.id, 'quotationNumber', r.quotation_number));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.flag_missing_representation_links() from public, anon, authenticated;

-- ── 4 · חיבור לעבודה היומית הקיימת ──────────────────────────────────────────
-- ‼ מרחיב את המשימה היומית `onboarding-attention-daily` (מיגרציה 34) בקריאה
--   אחת. **לא יוצר** משימה חדשה: אם המשימה אינה קיימת — כמו בסביבת הבדיקות,
--   שבה אין ולא יהיו משימות מתוזמנות — הבלוק פשוט לא עושה כלום.
do $$
declare v_cmd text;
begin
  select command into v_cmd from cron.job where jobname = 'onboarding-attention-daily';
  if v_cmd is null then
    raise notice 'אין משימה יומית בסביבה הזאת — מדלגים (צפוי ב-staging).';
  elsif position('flag_missing_representation_links' in v_cmd) > 0 then
    raise notice 'הקריאה כבר קיימת במשימה היומית.';
  else
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'onboarding-attention-daily'),
      command => v_cmd || ' select public.flag_missing_representation_links();');
  end if;
end $$;

-- ── רולבק ────────────────────────────────────────────────────────────────────
-- 1. ‼ הכי מהיר, ומכבה רק את השליחה: שחזור approve_quotation מ-
--    supabase/live-2026-08-07/approve_quotation.sql. אישורים ימשיכו לעבוד,
--    מיילים יפסיקו לצאת אוטומטית, ושום דבר אחר לא ייגע.
-- 2. drop function if exists public.flag_missing_representation_links();
-- 3. drop function if exists public.verify_internal_send_secret(text);
-- 4. delete from vault.secrets where name = 'internal_send_secret';
