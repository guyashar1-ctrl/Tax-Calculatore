-- ═══════════════════════════════════════════════════════════════════════════
-- 56 — תשתית "המסע הוא הכרטיס": בקשה חופשית וסדר שורות
-- הוחל 2026-08-05 כ-journey_custom_request_and_order_56
-- ═══════════════════════════════════════════════════════════════════════════
-- תוספתי בלבד: אף ערך קיים לא הוסר, אף עמודה לא נמחקה.

-- ── א. סוג שלב חדש: בקשה חופשית ──────────────────────────────────────────────
alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;
alter table public.onboarding_steps add constraint onboarding_steps_step_type_check
  check (step_type = any (array[
    'representation', 'file_opening', 'representation_upgrade', 'release_letter',
    'materials_received', 'paperless_invite', 'paperless_connection', 'data_import',
    'data_verification', 'retainer_authorization', 'internal_setup', 'kyc_identification',
    'first_month_review', 'intake_questionnaire',
    'client_documents', 'prev_accountant_details',
    'custom_request']));

-- מסלול משלו: בקשה חופשית אינה "כלים" ואינה "פנימי" — היא מה שהרו"ח הגדיר.
alter table public.onboarding_steps drop constraint if exists onboarding_steps_track_check;
alter table public.onboarding_steps add constraint onboarding_steps_track_check
  check (track = any (array[
    'authorities', 'prev_accountant', 'tools', 'payment', 'internal', 'review',
    'custom']));

-- ── ב. סדר השורות ────────────────────────────────────────────────────────────
-- עד היום הסדר היה created_at בלבד, ולכן לא היה ניתן לסידור בבונה.
alter table public.onboarding_steps add column if not exists sort_order integer;

update public.onboarding_steps s
   set sort_order = r.rn * 10
  from (select id, row_number() over (partition by client_id order by created_at, id) as rn
          from public.onboarding_steps) r
 where r.id = s.id and s.sort_order is null;

alter table public.onboarding_steps alter column sort_order set default 0;

create index if not exists onboarding_steps_client_order_idx
  on public.onboarding_steps (client_id, sort_order, created_at);

-- מבנה payload.requirements של custom_request (לתיעוד; אין אכיפה סכימתית):
--   [{ key, kind: 'confirm'|'text'|'file', label, done, value?, documentId?, doneAt? }]
-- הניסוח ללקוח נשמר ב-clientTitle / clientSub / clientCta, כמו בשאר הבקשות.
