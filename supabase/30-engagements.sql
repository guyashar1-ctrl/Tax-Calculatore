-- ═══════════════════════════════════════════════════════════════════════════
--  30 — התקשרויות ושלבי קליטה  ·  הטבלאות בלבד
-- ═══════════════════════════════════════════════════════════════════════════
--  התקשרות = הצעת מחיר שאושרה. היא מחזיקה את מה שנמכר (סכום חודשי, חודש חיוב
--  ראשון) מוקפא מרגע האישור, ואת מסלול הקליטה שנגזר ממנה.
--
--  ‼ למה זה שייך להתקשרות ולא לאדם: אדם אחד יכול לאשר כמה הצעות במהלך חייו.
--  הראשונה מולידה קליטה מלאה; שנייה (שירות נוסף) מולידה קליטה מצומצמת. שלבים
--  שנעשים פעם אחת בחיי האדם (ייצוג, חיבור לפייפרלס, שחרור מרו"ח קודם) מסומנים
--  scope='person' ולא נוצרים שוב; שלבים שחוזרים בכל עסקה (הרשאת תשלום — הסכום
--  השתנה!) מסומנים scope='engagement'.
--
--  ‼ תוספתי בלבד. אף טבלה קיימת לא נוגעת, אף עמודה לא נמחקת, אף מזהה לא זז.
--  ביטול מלא = מחיקת שלוש הטבלאות האלה; שום זרימה קיימת לא תלויה בהן.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── התקשרות ────────────────────────────────────────────────────────────────
create table if not exists public.engagements (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id       uuid not null references auth.users(id) on delete cascade,
  client_id     text not null references public.clients(id) on delete cascade,
  -- ‼ המפתח לאידמפוטנטיות: הצעה אחת ⇐ התקשרות אחת. ניסיון חוזר של האוטומציה
  -- (או מילוי-לאחור שרץ פעמיים) נתקל באילוץ ולא יוצר כפילות.
  quotation_id  text unique references public.quotations(id) on delete set null,
  status        text not null default 'onboarding'
                check (status in ('onboarding','active','ended','cancelled')),
  -- מוקפאים מההצעה ברגע האישור. שלב הרשאת התשלום קורא מכאן ולא מהקטלוג החי,
  -- כדי ששינוי מחירון עתידי לא ישנה הרשאה שכבר נשלחה.
  monthly_total       numeric,
  billing_start_month text,          -- 'YYYY-MM'
  approved_at   timestamptz,
  activated_at  timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists engagements_user_status_idx on public.engagements (user_id, status);
create index if not exists engagements_client_idx      on public.engagements (client_id);

-- ─── שלב קליטה ──────────────────────────────────────────────────────────────
create table if not exists public.onboarding_steps (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- ניתן להיות ריק: לקוח ותיק שמסמנים לו "כבר מחובר לפייפרלס" עוד לפני
  -- שנפתחה לו התקשרות במערכת.
  engagement_id text references public.engagements(id) on delete cascade,
  client_id     text not null references public.clients(id) on delete cascade,
  step_type     text not null check (step_type in (
                  'representation','file_opening',
                  'release_letter','materials_received',
                  'paperless_invite','paperless_connection','data_import','data_verification',
                  'retainer_authorization',
                  'internal_setup','kyc_identification',
                  'first_month_review')),
  track         text not null check (track in (
                  'authorities','prev_accountant','tools','payment','internal','review')),
  scope         text not null check (scope in ('person','engagement')),
  status        text not null default 'pending' check (status in (
                  'locked','pending','in_progress','waiting_client',
                  'completed','verified','skipped','blocked','failed','cancelled')),
  ball          text not null default 'me'
                check (ball in ('me','client','authority','prev_accountant','system')),
  -- ‼ קשת התלות האמיתית. הרשאת התשלום מצביעה כאן על חיבור הפייפרלס — וזו
  -- הסיבה שהיא לא יכולה להישלח לפניו: ההרשאה נוצרת בתוך חשבון הפייפרלס של
  -- הלקוח, שעדיין לא קיים.
  depends_on_step_id text references public.onboarding_steps(id) on delete set null,
  due_date      date,
  needs_attention boolean not null default false,
  -- מידע ייחודי לסוג השלב: מסלול הפייפרלס, קישור ההרשאה, רשימות סימון.
  payload       jsonb not null default '{}'::jsonb,
  -- ידני היום, אוטומטי מחר — בלי לשנות את המבנה כשיהיה ממשק לפייפרלס.
  completion_method text not null default 'manual'
                check (completion_method in ('manual','auto','system')),
  completed_by  uuid,
  completed_at  timestamptz,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- הרכבה חוזרת של אותה התקשרות לא תיצור שלב פעמיים.
create unique index if not exists onboarding_steps_engagement_type_idx
  on public.onboarding_steps (engagement_id, step_type)
  where engagement_id is not null;

-- ‼ שלב ברמת האדם קיים פעם אחת בלבד בחייו. התקשרות שנייה מוצאת אותו ולא
-- מייצרת "הירשם לפייפרלס" ללקוח שכבר מחובר. שלב שבוטל/דולג אינו חוסם חדש.
create unique index if not exists onboarding_steps_person_type_idx
  on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status not in ('cancelled');

create index if not exists onboarding_steps_user_status_idx on public.onboarding_steps (user_id, status);
create index if not exists onboarding_steps_client_idx      on public.onboarding_steps (client_id);
create index if not exists onboarding_steps_engagement_idx  on public.onboarding_steps (engagement_id);

-- ─── יומן אירועי הקליטה ─────────────────────────────────────────────────────
-- מקור האמת של ציר הזמן. המסך ממזג אותו עם יומן המיילים לפי step_id.
create table if not exists public.onboarding_events (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id       uuid not null references auth.users(id) on delete cascade,
  step_id       text references public.onboarding_steps(id) on delete cascade,
  engagement_id text references public.engagements(id) on delete cascade,
  type          text not null,   -- created|status_changed|email_prepared|email_sent|reminder_prepared|blocked|note
  actor         text not null default 'system' check (actor in ('accountant','client','system')),
  note          text,
  meta          jsonb not null default '{}'::jsonb,
  at            timestamptz not null default now()
);

create index if not exists onboarding_events_step_idx on public.onboarding_events (step_id, at desc);
create index if not exists onboarding_events_eng_idx  on public.onboarding_events (engagement_id, at desc);

-- ─── קישור משימה לשלב ───────────────────────────────────────────────────────
-- ‼ עד היום הקשר בין משימה לתהליך נעשה בהתאמת מחרוזת לכותרת ('להשלים ייצוג%').
-- לשלבים החדשים יש הצבעה אמיתית. הטריגר הישן נשאר כמו שהוא — לא נוגעים בו.
--
-- ‼ עדכון 2026-08-04: העמודה הזו נשארת ריקה **בכוונה**. ההחלטה המוצרית היא
-- שקליטה אינה משימה — שלבי הקליטה חיים במסלול שלהם ובמפה, ולוח המשימות נשאר
-- לעבודה השוטפת. מי שיתפתה למלא אותה יחזיר בדיוק את הכפילות שמיגרציה 45 באה
-- לחסל. ראה docs/ONBOARDING-UX-PLAN.md §ב.4.
alter table public.tasks add column if not exists onboarding_step_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_onboarding_step_id_fkey'
  ) then
    alter table public.tasks
      add constraint tasks_onboarding_step_id_fkey
      foreign key (onboarding_step_id) references public.onboarding_steps(id) on delete set null;
  end if;
end $$;

create index if not exists tasks_onboarding_step_idx on public.tasks (onboarding_step_id)
  where onboarding_step_id is not null;

-- ─── עדכון updated_at ───────────────────────────────────────────────────────
drop trigger if exists set_engagements_updated_at on public.engagements;
create trigger set_engagements_updated_at before update on public.engagements
  for each row execute function public.set_updated_at();

drop trigger if exists set_onboarding_steps_updated_at on public.onboarding_steps;
create trigger set_onboarding_steps_updated_at before update on public.onboarding_steps
  for each row execute function public.set_updated_at();

-- ─── RLS — בדיוק אותו דפוס של שאר הטבלאות ──────────────────────────────────
alter table public.engagements      enable row level security;
alter table public.onboarding_steps enable row level security;
alter table public.onboarding_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['engagements','onboarding_steps','onboarding_events'] loop
    execute format('drop policy if exists %I_own on public.%I', t, t);
    execute format(
      'create policy %I_own on public.%I for all to authenticated '
      || 'using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);

    execute format('drop policy if exists require_authorized on public.%I', t);
    execute format(
      'create policy require_authorized on public.%I '
      || 'as restrictive for all to authenticated '
      || 'using (public.is_authorized()) with check (public.is_authorized())', t);
  end loop;
end $$;
