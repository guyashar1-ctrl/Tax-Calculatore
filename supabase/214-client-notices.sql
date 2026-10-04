-- 214: הודעות ללקוח — «חדש» מול «תזכורת», סימון לכל בקשה, ומניעת שליחה כפולה בשרת.
--
-- ‼ מה היה שבור (docs/DESIGN-LIBRARY-FLOWS-2026-10-02.md §1 #8):
--   · המייל המרוכז פירט את כל מה שממתין, לא רק את מה שחדש.
--   · «נשלח» נגזר מהשוואת זמנים ללקוח כולו (192). בקשה שפורסמה תוך כדי שליחה
--     נחשבה «נשלחה» בלי שהופיעה במייל.
--   · שום דבר בשרת לא מנע את אותו מייל פעמיים: לחיצה כפולה, שתי לשוניות,
--     ניסיון חוזר אחרי כשל.
--
-- ‼ המודל החדש:
--   · לכל בקשה גרסת תוכן ללקוח (client_content_version) וגרסה שנמסרה לו
--     (announced_version). «חדש» = גרסה שטרם נמסרה. אין שעונים.
--   · הודעה (client_notices) נתפסת בשרת לפני השליחה, עם קבוצת הבקשות שהיא
--     מוסרת (client_notice_items). רק אחרי 2xx מהספק הן מסומנות «נמסרו».
--   · כשל שבו לא ידוע אם נשלח ⇒ 'unknown': הבקשות לא משתחררות לבד, והמסך
--     מציע «שלח שוב (אותו מייל)» עם אותו מפתח אידמפוטנטיות אצל הספק.
--   · תזכורת היא הודעה נפרדת, רק על מה שכבר נמסר ועדיין פתוח, ואינה מסמנת
--     כלום כ«נמסר».
--
-- ‼ הטבלאות של המסלולים (flow_runs) נוצרות כאן ולא ב-215, כי בחירת הפריטים
--   להודעה אוטומטית צריכה לדעת אם הריצה בעצירה.

-- ── 1 · מסלולים: הטבלאות (הפונקציות ב-215) ────────────────────────────────
create table if not exists public.office_flows (
  id              text primary key default replace(gen_random_uuid()::text, '-', ''),
  office_id       uuid not null,
  name            text not null,
  trigger         text not null check (trigger in ('quote_approved', 'manual', 'annual')),
  status          text not null default 'active' check (status in ('active', 'archived')),
  current_version int  not null default 1,
  seed_key        text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- מסלול קליטה אחד פעיל למשרד — הוא שמתורגם לרשימות של המחולל.
create unique index if not exists office_flows_one_onboarding
  on public.office_flows (office_id) where trigger = 'quote_approved' and status = 'active';

create table if not exists public.office_flow_versions (
  flow_id    text not null references public.office_flows(id) on delete cascade,
  version    int  not null,
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  note       text,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (flow_id, version)
);

create table if not exists public.flow_runs (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id       uuid not null references auth.users(id) on delete cascade,
  client_id     text not null references public.clients(id) on delete cascade,
  flow_id       text not null references public.office_flows(id) on delete restrict,
  flow_version  int  not null,
  -- ‼ זהות הריצה: (לקוח, מסלול, מחזור). קליטה — ההתקשרות; שנתי — השנה;
  -- ידני — מספר רץ. אירוע חוזר על אותו מחזור אינו פותח ריצה שנייה.
  cycle_key     text not null,
  trigger       text not null,
  status        text not null default 'active' check (status in ('active', 'paused', 'cancelled', 'done')),
  engagement_id text references public.engagements(id) on delete set null,
  facts         jsonb not null default '{}'::jsonb,
  state         jsonb not null default '{}'::jsonb,
  started_by    text not null default 'accountant' check (started_by in ('accountant', 'system')),
  started_at    timestamptz not null default now(),
  paused_at     timestamptz,
  resumed_at    timestamptz,
  cancelled_at  timestamptz,
  done_at       timestamptz,
  updated_at    timestamptz not null default now(),
  unique (client_id, flow_id, cycle_key)
);
create index if not exists flow_runs_client_idx on public.flow_runs (client_id);

alter table public.onboarding_steps
  add column if not exists flow_run_id    text references public.flow_runs(id) on delete set null,
  add column if not exists flow_stage_key text,
  add column if not exists flow_item_key  text;
create index if not exists onboarding_steps_flow_run_idx
  on public.onboarding_steps (flow_run_id) where flow_run_id is not null;
-- אותו פריט באותה ריצה (ולאותו אדם) — פעם אחת. מבוטלת אינה נספרת.
-- ‼ לכל אדם פעם אחת; ובבן/בת זוג עם אישור אישי — בקשה בדף (לשאר הפריטים) ומשימה למשרד
-- (לאישור) הן שתי שורות של אותו פריט (215 _flow_materialize).
drop index if exists public.onboarding_steps_flow_item_uidx;
create unique index onboarding_steps_flow_item_uidx
  on public.onboarding_steps (flow_run_id, flow_item_key, coalesce(payload->>'subjectRole', ''), (payload ? 'personalConfirmFor'))
  where flow_run_id is not null and flow_item_key is not null and status <> 'cancelled';

alter table public.office_flows enable row level security;
alter table public.office_flow_versions enable row level security;
alter table public.flow_runs enable row level security;

drop policy if exists office_flows_read on public.office_flows;
create policy office_flows_read on public.office_flows for select to authenticated
  using (office_id = public.current_office_id());
drop policy if exists office_flow_versions_read on public.office_flow_versions;
create policy office_flow_versions_read on public.office_flow_versions for select to authenticated
  using (exists (select 1 from public.office_flows f where f.id = flow_id and f.office_id = public.current_office_id()));
drop policy if exists flow_runs_own on public.flow_runs;
create policy flow_runs_own on public.flow_runs for select to authenticated
  using (user_id = auth.uid());
-- הגבלה מחייבת כמו בכל טבלאות המשרד (166).
drop policy if exists require_authorized on public.office_flows;
create policy require_authorized on public.office_flows as restrictive for all to authenticated using (public.is_authorized());
drop policy if exists require_authorized on public.office_flow_versions;
create policy require_authorized on public.office_flow_versions as restrictive for all to authenticated using (public.is_authorized());
drop policy if exists require_authorized on public.flow_runs;
create policy require_authorized on public.flow_runs as restrictive for all to authenticated using (public.is_authorized());
revoke all on public.office_flows, public.office_flow_versions, public.flow_runs from anon;
grant select on public.office_flows, public.office_flow_versions, public.flow_runs to authenticated;

-- ‼ (215) קשתות שמסלול הוסיף מסומנות, כדי שכותב שמחליף את התלויות של בקשה
-- (set_onboarding_step_dependencies) לא ימחק את שער השלב בלי לדעת.
alter table public.onboarding_step_dependencies add column if not exists origin text;

-- כתיבה רק דרך פונקציות השרת; בטבלאות החדשות אין למשתמש מחובר כתיבה ישירה.
revoke insert, update, delete, truncate, references, trigger
  on public.office_flows, public.office_flow_versions, public.flow_runs from authenticated;

-- ── 2 · גרסת תוכן ללקוח ────────────────────────────────────────────────────
-- ‼ על הבקשה עצמה רק הגרסה — היא נכתבת בתוך עדכון שקורה ממילא (טריגר BEFORE),
-- ולכן אינה נוגעת ב-updated_at. כל הנהלת החשבונות של «נמסר/הוזכר» בטבלה
-- נפרדת (§3): updated_at מזין את גיל הבקשה, את «תקוע אצל הלקוח» ואת
-- «השתנה מאז שהוסתר» — מייל או תזכורת אינם שינוי בבקשה ואסור שיאפסו אותם.
alter table public.onboarding_steps
  add column if not exists client_content_version int not null default 1;
alter table public.onboarding_steps alter column client_content_version set default 0;

-- המפתחות הפתוחים (לא הושלמו) ברשימת המסמכים או בדרישות.
create or replace function public._step_open_item_keys(p_payload jsonb)
returns text[] language sql immutable set search_path to 'public' as $$
  select coalesce(array_agg(distinct k), '{}')
    from (
      select coalesce(nullif(x->>'key', ''), x->>'label') as k
        from jsonb_array_elements(case when jsonb_typeof(p_payload->'checklist') = 'array'
                                       then p_payload->'checklist' else '[]'::jsonb end) x
       where coalesce(x->>'done', 'false') <> 'true'
      union all
      select coalesce(nullif(x->>'key', ''), x->>'label')
        from jsonb_array_elements(case when jsonb_typeof(p_payload->'requirements') = 'array'
                                       then p_payload->'requirements' else '[]'::jsonb end) x
       where coalesce(x->>'done', 'false') <> 'true'
    ) t where k is not null;
$$;

/**
 * הגרסה עולה כשיש ללקוח משהו חדש לשמוע: פורסמה, נפתחה מחדש, נוסף פריט פתוח
 * (מסמך שנוסף, פריט שחזר להיות חסר), או שהנוסח שהוא רואה השתנה.
 * ‼ השלמה של פריט אינה חדשה. פתיחה מחדש של שאלון בידי הלקוח עצמו אינה חדשה לו.
 */
create or replace function public.onboarding_step_content_version_trg()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    new.client_content_version := case when new.published_at is not null then 1 else 0 end;
    return new;
  end if;
  if old.published_at is null and new.published_at is not null then
    new.client_content_version := old.client_content_version + 1;
  elsif new.published_at is null then
    return new;
  elsif old.status in ('completed', 'verified', 'skipped', 'cancelled')
        and new.status not in ('completed', 'verified', 'skipped', 'cancelled')
        and new.step_type <> 'intake_questionnaire' then
    new.client_content_version := old.client_content_version + 1;
  elsif new.payload is distinct from old.payload and (
          not (public._step_open_item_keys(new.payload) <@ public._step_open_item_keys(old.payload))
          or (new.payload->>'title')       is distinct from (old.payload->>'title')
          or (new.payload->>'clientTitle') is distinct from (old.payload->>'clientTitle')
          or (new.payload->>'clientSub')   is distinct from (old.payload->>'clientSub')
          or (new.payload->>'message')     is distinct from (old.payload->>'message')) then
    new.client_content_version := old.client_content_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists onboarding_steps_content_version on public.onboarding_steps;
create trigger onboarding_steps_content_version
  before insert or update on public.onboarding_steps
  for each row execute function public.onboarding_step_content_version_trg();

-- ── 3 · מה נמסר ללקוח — לכל בקשה ─────────────────────────────────────────
-- שורה חסרה = שום גרסה לא נמסרה (בקשה שנוצרה אחרי 214). המילוי למטה יוצר
-- שורה לכל בקשה קיימת, כך שהפריסה לא הופכת הכול ל«בדף, בלי מייל».
create table if not exists public.client_step_notice_state (
  step_id             text primary key references public.onboarding_steps(id) on delete cascade,
  announced_version   int not null default 0,
  announced_at        timestamptz,
  announced_notice_id uuid,
  reminder_count      int not null default 0,
  last_reminded_at    timestamptz,
  -- תזכורת אוטומטית שלא יצאה (אין כתובת, כשל ודאי) — לא מנסים שוב לפני כן.
  reminder_backoff_until timestamptz
);
alter table public.client_step_notice_state enable row level security;
drop policy if exists client_step_notice_state_own on public.client_step_notice_state;
create policy client_step_notice_state_own on public.client_step_notice_state for select to authenticated
  using (exists (select 1 from public.onboarding_steps s where s.id = step_id and s.user_id = auth.uid()));
drop policy if exists require_authorized on public.client_step_notice_state;
create policy require_authorized on public.client_step_notice_state as restrictive for all to authenticated
  using (public.is_authorized());
revoke all on public.client_step_notice_state from anon;
revoke insert, update, delete, truncate, references, trigger on public.client_step_notice_state from authenticated;
grant select on public.client_step_notice_state to authenticated;

-- ‼ המילוי: אותו פרדיקט כמו 192 (מייל הדף האחרון מול פרסום/שינוי), ועוד שני
-- מקרים ש-192 פספס: בקשה נעולה (מעולם לא נמסרה כמשהו לעשות), ובקשה שנפתחה
-- מנעילה אחרי מייל הדף האחרון.
with last_sent as (
  select client_id, max(sent_at) as at
    from public.email_messages
   where kind in ('process_open', 'documents_sent', 'status_update') and status <> 'failed'
     and client_id is not null
   group by client_id
), changed as (
  select e.step_id, max(e.at) as at
    from public.onboarding_events e
    join public.onboarding_steps s on s.id = e.step_id
   where e.at > s.published_at
     and (e.meta ? 'items' or e.meta ? 'editApplied'
          or (e.type = 'status_changed' and e.meta->>'to' = 'waiting_client'
              and e.meta->>'from' in ('completed', 'verified', 'skipped'))
          or (e.type = 'status_changed' and e.meta->>'from' = 'locked'))
   group by e.step_id
)
insert into public.client_step_notice_state (step_id, announced_version, announced_at)
select s.id,
       case when s.status not in ('completed', 'verified', 'skipped', 'cancelled')
             and (s.status = 'locked'
                  or s.published_at is null
                  or ls.at is null
                  or greatest(s.published_at, coalesce(ch.at, s.published_at)) > ls.at)
            then 0 else s.client_content_version end,
       ls.at
  from public.onboarding_steps s
  left join last_sent ls on ls.client_id = s.client_id
  left join changed ch on ch.step_id = s.id
on conflict (step_id) do nothing;

-- ── 4 · הודעות ────────────────────────────────────────────────────────────
create table if not exists public.client_notices (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  client_id       text not null references public.clients(id) on delete cascade,
  -- new — מה שחדש ללקוח · reminder — מה שכבר נמסר ועדיין פתוח ·
  -- update — הקישור לדף ועדכון מצב, כשאין חדש (לא מסמן כלום כ«נמסר»).
  kind            text not null check (kind in ('new', 'reminder', 'update')),
  origin          text not null check (origin in ('manual', 'auto')),
  idempotency_key text not null,
  status          text not null check (status in
                    ('queued', 'claimed', 'sending', 'sent', 'failed', 'unknown', 'cancelled', 'skipped')),
  -- ‼ אסימון הגידור: מתחלף בכל תפיסה. סימון «שולח», השלמה וכשל דורשים אותו,
  -- כך שפונקציית שליחה שאיבדה את התפיסה לא יכולה לשלוח או לסמן.
  claim_token     uuid,
  -- המפתח לספק (Idempotency-Key) ומתי נעשה בו שימוש ראשון. מתחלף רק אחרי
  -- כשל ודאי, או אחרי 23 שעות (החלון של הספק הוא 24).
  provider_gen    int not null default 0,
  provider_key    text,
  provider_key_first_used_at timestamptz,
  -- גוף הבקשה לספק, כפי שנשלח בפעם הראשונה. ‼ request_text הוא המחרוזת
  -- המדויקת (jsonb מסדר מפתחות מחדש) — ניסיון חוזר שולח אותה תו בתו.
  request_body    jsonb,
  request_text    text,
  -- סוג המייל ביומן (process_open / documents_sent / portal_reminder / status_update).
  event_kind      text,
  due_at          timestamptz,
  lease_until     timestamptz,
  attempts        int not null default 0,
  kick_attempts   int not null default 0,
  last_kicked_at  timestamptz,
  to_email        text,
  subject         text,
  resend_id       text,
  transport       text,
  email_message_id uuid,
  fingerprint     text,
  reason          text,
  error           text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
-- ‼ ההגנה מפני שתי לשוניות: לכל לקוח הודעה אחת בתנועה בכל רגע.
alter table public.client_notices add column if not exists request_text text;
alter table public.client_notices add column if not exists event_kind text;
-- איזה נוסח יצא (noticeWording.templateKey — «מייל ראשון» / «בקשות חדשות ללקוח שכבר קיבל מייל»…).
-- נקבע ברגע השליחה ונכתב ליומן כ-meta.templateKey, כדי שכל שורה בעמוד «מיילים» תספור את הנוסח שלה.
alter table public.client_notices add column if not exists template_key text;
create unique index if not exists client_notices_one_inflight
  on public.client_notices (client_id) where status in ('claimed', 'sending');
-- הודעה אוטומטית אחת ממתינה לכל לקוח ולכל סוג — תוספות נאספות אליה.
create unique index if not exists client_notices_one_queued
  on public.client_notices (client_id, kind) where status = 'queued';
create index if not exists client_notices_client_idx on public.client_notices (client_id, created_at desc);
create index if not exists client_notices_queued_idx on public.client_notices (due_at) where status = 'queued';

create table if not exists public.client_notice_items (
  notice_id uuid not null references public.client_notices(id) on delete cascade,
  step_id   text not null references public.onboarding_steps(id) on delete cascade,
  version   int  not null,
  primary key (notice_id, step_id)
);
create index if not exists client_notice_items_step_idx on public.client_notice_items (step_id);

alter table public.client_notices enable row level security;
alter table public.client_notice_items enable row level security;
drop policy if exists client_notices_own on public.client_notices;
create policy client_notices_own on public.client_notices for select to authenticated using (user_id = auth.uid());
drop policy if exists client_notice_items_own on public.client_notice_items;
create policy client_notice_items_own on public.client_notice_items for select to authenticated
  using (exists (select 1 from public.client_notices n where n.id = notice_id and n.user_id = auth.uid()));
drop policy if exists require_authorized on public.client_notices;
create policy require_authorized on public.client_notices as restrictive for all to authenticated using (public.is_authorized());
drop policy if exists require_authorized on public.client_notice_items;
create policy require_authorized on public.client_notice_items as restrictive for all to authenticated using (public.is_authorized());
revoke all on public.client_notices, public.client_notice_items from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.client_notices, public.client_notice_items from authenticated;
grant select on public.client_notices, public.client_notice_items to authenticated;

-- ── 5 · מה הלקוח רואה כבקשה ─────────────────────────────────────────────
-- ‼ אותו שם בדיוק כמו בדף האישי (build_client_portal).
create or replace function public._client_step_title(p_step_type text, p_payload jsonb)
returns text language sql immutable set search_path to 'public' as $$
  select coalesce(nullif(p_payload->>'clientTitle', ''),
           case p_step_type
             when 'client_documents' then 'מסמכים שביקשנו'
             when 'custom_request' then coalesce(nullif(p_payload->>'title', ''), 'בקשה מהמשרד')
             when 'prev_accountant_details' then 'פרטי רואה החשבון הקודם שלך'
             when 'paperless_invite' then 'הרשמה לפייפרלס'
             when 'paperless_tax_authority' then 'חיבור פייפרלס לרשות המסים'
             -- כשע״ם דורשת את האישור, clientTitle הוא «אישור הייצוג באזור האישי» (201).
             when 'rep_client_approval' then 'זירוז אישור הייצוג באזור האישי'
             else coalesce(nullif(p_payload->>'title', ''), 'בקשה מהמשרד') end);
$$;

-- המפתח של הפריט בדף האישי — כדי שהמייל ייקח ממנו את השורה המשנית.
create or replace function public._client_step_portal_key(p_step_id text, p_step_type text)
returns text language sql immutable set search_path to 'public' as $$
  select case p_step_type
           when 'client_documents' then 'docs'
           when 'custom_request' then 'custom_' || p_step_id
           when 'prev_accountant_details' then 'prev_details'
           when 'paperless_invite' then 'paperless_signup'
           when 'paperless_tax_authority' then 'paperless_tax'
           when 'rep_client_approval' then 'rep_approval'
         end;
$$;

/**
 * השער של הדף האישי — לכל בקשה. בקשה שפורסמה (published_at) גלויה ללקוח — בדף האישי,
 * ב«שלח מייל…», במייל שיוצא לבד, בתזכורות, בתזכורת הכרטיס באזור האישי ובמשימה האוטומטית —
 * רק כשהשער פתוח:
 *   · אין קליטה פתוחה (open_intake_engagement_id, 155) ⇒ כמו קודם: התקשרות כלשהי של הלקוח
 *     נפתחה ללקוח (process_published_at), או שאין לו התקשרות בכלל;
 *   · יש קליטה פתוחה ⇒ הקליטה נפתחה ללקוח, או שהבקשה פורסמה לפני שהקליטה נוצרה
 *     (published_at < created_at של הקליטה).
 * ‼ הכרעות גיא (03.10):
 *   (ב) לקוח שחוזר: קליטה חדשה לא מסתירה בקשות שכבר פורסמו ועדיין פתוחות — הן נשארות בדף,
 *       במייל ובתזכורות, והמשרד מבחין בין ההתקשרויות (payload.carriedFrom ממה שעבר לקליטה
 *       החדשה, 217 _carry_open_work_to_engagement). בלי כפילויות: מה שעבר אינו נוצר שוב.
 *       הקליטה החדשה עצמה — כל מה שפורסם מאז שנוצרה — טיוטה עד שהמשרד מפרסם אותה.
 *   (א) כרטיס «אישור הייצוג באזור האישי» (rep_client_approval) שנולד בקליטה חדשה שטרם
 *       פורסמה — לא בדף, לא במייל ולא בתזכורת, עד הפרסום; במשרד הוא מסומן «ממתין לפרסום».
 *       כרטיס שפורסם לפני הקליטה — עבודה קודמת, ונשאר כמו כל בקשה פתוחה (ב).
 * ‼ «לפני» = קטן ממש: מה שפורסם באותה טרנזקציה שבה נוצרה הקליטה (אישור ההצעה, המחולל, בקשה
 *   שהוחזקה עד האישור) שייך לקליטה החדשה.
 * ‼ p_published_at = null ⇒ השער ברמת הלקוח («התהליך נפתח ללקוח»), בדיוק הכלל הקודם —
 *   client_process_published (217) היא העטיפה שלו, ו«אנחנו מכינים את המשך התהליך» בדף נשען
 *   עליה. מקור אחד בשרת; לדפדפן תאום שחייב לענות אותו דבר — שינוי כאן, גם שם.
 */
create or replace function public.client_step_gate_open(p_client_id text, p_published_at timestamptz)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when public.open_intake_engagement_id(p_client_id) is not null
      then coalesce((select e.process_published_at is not null
                            or coalesce(p_published_at < e.created_at, false)
                       from public.engagements e
                      where e.id = public.open_intake_engagement_id(p_client_id)), true)
    else coalesce((select bool_or(e.process_published_at is not null) from public.engagements e
                    where e.client_id = p_client_id), true) end;
$$;

/**
 * הבקשות שמותר להודיע עליהן ללקוח — המקור היחיד, גם למגש וגם למייל.
 * ‼ אותם סוגים כמו 192 (שאלון הפתיחה נשאר בחוץ במכוון: מועדו הכרעת הרו"ח,
 * ויש לו מייל משלו). אותו שער כמו הדף האישי, לכל בקשה (למטה).
 * בקשה «רק בדף» לעולם לא נכללת.
 * ‼ אישור הייצוג באזור האישי (rep_client_approval) — רק כששע״ם דרשה אותו
 *   (201 shaam_require_client_approval: payload.requiredBy = 'shaam'), והלקוח
 *   טרם הצהיר. זירוז אופציונלי אינו סיבה למייל. ‼ רק ב«שלח מייל…» של המשרד:
 *   לעולם לא «לבד» ולא בתזכורת אוטומטית (delivery 'approve', בלי reminder).
 * ‼ משימה ישנה שסומנה לבדיקה (internalTaskReview) ואין בה שום דבר ללקוח —
 *   המשרד מכריע (להסתיר/לערוך); עד אז היא לא נכנסת למייל.
 * ‼ השער — לכל בקשה: client_step_gate_open(p_client_id, s.published_at), אותו שער כמו הדף
 *   האישי (build_client_portal, 216). לקוח שחוזר: מה שפורסם לפני שנפתחה הקליטה החדשה ועדיין
 *   פתוח — במייל ובתזכורת; הקליטה החדשה — רק אחרי שהמשרד מפרסם אותה (הכרעה ב).
 * ‼ «אין תוכן ללקוח» = _payload_has_client_content (216 §9), תו בתו (p ⇐ s.payload) —
 *   משוכפל כי 214 מוחלת לפני 216. שינוי באחד מהם — בשני המקומות;
 *   test-r4-notices.sql (N.1–N.5) נופל על כל סטייה.
 */
create or replace function public._client_announceable_steps(p_client_id text)
returns table (step_id text, step_type text, version int, announced_version int, title text,
               delivery text, run_id text, run_status text, stage_key text,
               reminder jsonb, announced_at timestamptz, reminder_count int,
               last_reminded_at timestamptz, reminder_backoff_until timestamptz,
               is_document boolean, sort_key int, created_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select s.id, s.step_type, s.client_content_version, coalesce(ns.announced_version, 0),
         public._client_step_title(s.step_type, s.payload),
         case when s.step_type = 'rep_client_approval' then 'approve'
              else coalesce(nullif(s.payload->>'delivery', ''), 'approve') end,
         s.flow_run_id, r.status, s.flow_stage_key,
         case when s.step_type <> 'rep_client_approval' and jsonb_typeof(s.payload->'reminder') = 'object'
              then s.payload->'reminder' end,
         ns.announced_at, coalesce(ns.reminder_count, 0), ns.last_reminded_at, ns.reminder_backoff_until,
         (s.step_type = 'custom_request' and not (s.payload ? 'shaamIdentity')
           and (nullif(s.payload->>'clientResource', '') is not null
                or jsonb_typeof(s.payload->'clientResources') = 'array')),
         coalesce(s.pending_sort_order, s.sort_order, 0), s.created_at
    from public.onboarding_steps s
    left join public.client_step_notice_state ns on ns.step_id = s.id
    left join public.flow_runs r on r.id = s.flow_run_id
   where s.client_id = p_client_id
     and s.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked')
     and s.published_at is not null
     and public.client_step_gate_open(p_client_id, s.published_at)
     and coalesce(s.pending_cancel, false) = false
     and s.step_type in ('client_documents', 'custom_request', 'paperless_tax_authority',
                         'paperless_invite', 'prev_accountant_details', 'rep_client_approval')
     and (s.step_type <> 'rep_client_approval'
          or (coalesce(s.payload->>'requiredBy', '') = 'shaam'
              and coalesce(s.ball, 'client') = 'client'
              and nullif(s.payload->>'clientDeclaredAt', '') is null))
     and (s.step_type <> 'custom_request'
          or (coalesce(s.ball, 'client') = 'client'
              and coalesce(s.payload->>'messageOnly', 'false') <> 'true'
              and s.payload->'externalParty' is null
              -- ‼ משימה של המשרד (216 §9) אינה בדף — ולכן גם לא במייל, גם אחרי «ממתין ללקוח».
              and not (s.payload ? 'personalConfirmFor')
              and coalesce(s.payload->>'internalTask', 'false') <> 'true'
              -- ‼ סומנה לבדיקה ואין בה תוכן ללקוח. הכלל של התוכן = _payload_has_client_content
              --   (216 §9), משוכפל כאן תו בתו כי 214 מוחלת לפניה — לשנות בשני המקומות יחד.
              and not (coalesce(s.payload->>'internalTaskReview', '') = 'true'
                       and not (coalesce(s.payload, '{}'::jsonb) <> '{}'::jsonb and coalesce(jsonb_typeof(s.payload) = 'object', false) and (
       coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'requirements') = 'array' then s.payload->'requirements' end), 0) > 0
    or coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'checklist') = 'array' then s.payload->'checklist' end), 0) > 0
    or coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'clientResources') = 'array' then s.payload->'clientResources' end), 0) > 0
    or coalesce(nullif(s.payload->>'clientResource', ''), nullif(btrim(coalesce(s.payload->>'clientLinkUrl', '')), '')) is not null
    or coalesce(s.payload->>'messageOnly', '') = 'true'
    or coalesce(jsonb_typeof(s.payload->'externalParty'), '') = 'object'
    or s.payload ?| array['smartForm', 'shaamIdentity', 'guideKey'])))))
     and coalesce(s.payload->>'delivery', '') <> 'page';
$$;

/**
 * הפריטים להודעה.
 *   new      — גרסה שטרם נמסרה, ושאינה מכוסה בהודעה אחרת שבתנועה או שלא ידוע
 *              מה עלה בגורלה.
 *   reminder — נמסר במלואו ועדיין פתוח, ואינו מכוסה בתזכורת אחרת בתנועה/לא-ידועה.
 * origin 'auto' ⇒ רק מה שהמשרד הגדיר כ«לבד», ורק מריצה שאינה בעצירה.
 * p_due_only ⇒ תזכורת אוטומטית: רק פריט שהגיע זמן התזכורת שלו לפי השלב.
 */
create or replace function public._client_notice_items(p_client_id text, p_kind text,
  p_origin text default 'manual', p_due_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_items jsonb;
begin
  if p_kind = 'update' then
    return jsonb_build_object('items', '[]'::jsonb, 'fingerprint', '');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'stepId', a.step_id, 'stepType', a.step_type, 'version', a.version,
           'title', a.title, 'runId', a.run_id, 'stageKey', a.stage_key,
           'isDocument', a.is_document, 'delivery', a.delivery,
           'portalKey', public._client_step_portal_key(a.step_id, a.step_type))
           order by a.sort_key, a.created_at, a.step_id), '[]'::jsonb)
    into v_items
    from public._client_announceable_steps(p_client_id) a
   where not exists (
           select 1 from public.client_notice_items i
             join public.client_notices n on n.id = i.notice_id
            where i.step_id = a.step_id and n.kind = p_kind
              and i.version >= case when p_kind = 'new' then a.version else 0 end
              and (n.status in ('claimed', 'sending', 'unknown')))
     and case p_kind
           when 'new' then
             a.version > a.announced_version
             and (p_origin <> 'auto'
                  or (a.delivery = 'auto' and coalesce(a.run_status, 'active') not in ('paused', 'cancelled')))
           when 'reminder' then
             a.announced_version >= 1 and a.version = a.announced_version
             and (p_origin <> 'auto' or coalesce(a.run_status, 'active') not in ('paused', 'cancelled'))
             and (not p_due_only or (
                   a.reminder is not null
                   and coalesce(a.reminder_backoff_until, '-infinity'::timestamptz) <= now()
                   and a.reminder_count < least(greatest(case when (a.reminder->>'max') ~ '^\d+$' then (a.reminder->>'max')::int else 1 end, 1), 5)
                   and coalesce(a.last_reminded_at, a.announced_at, now())
                       <= now() - make_interval(days => least(greatest(
                            case when (a.reminder->>'afterDays') ~ '^\d+$' then (a.reminder->>'afterDays')::int else 7 end, 1), 60))))
           else false
         end;

  return jsonb_build_object(
    'items', v_items,
    'fingerprint', coalesce((select md5(string_agg((x->>'stepId') || ':' || (x->>'version'), ',' order by x->>'stepId'))
                               from jsonb_array_elements(v_items) x), ''));
end;
$$;

-- הפעם הראשונה שהלקוח מקבל מייל דף — לשורת «שמחים להתחיל». כשל אינו נספר.
-- ‼ גם מייל שחזר (bounced) אינו נספר: הספק קיבל אותו, אבל הלקוח לא — והמייל הבא
-- הוא בפועל הראשון שלו (בנוסח «פתחנו לכם דף», לא «יש בקשות חדשות»).
-- ‼ «ראשון» אינו «קליטה»: לקוח ותיק בלי היסטוריית מייל דף (דוח שנתי, בקשה ידנית) מקבל את
-- נוסח ההמשך ועוד שורה שמציגה את הדף. ההכרעה בשולח (firstPageEmailKind, stepTemplates),
-- לפי isFirst ו-openIntake שהתפיסה והתצוגה מחזירות.
create or replace function public._client_first_page_email(p_client_id text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select not exists (select 1 from public.client_notices n
                       left join public.email_messages m on m.id = n.email_message_id
                      where n.client_id = p_client_id and n.status = 'sent'
                        and coalesce(m.status, 'sent') not in ('failed', 'bounced'))
     and not exists (select 1 from public.email_messages m
                      where m.client_id = p_client_id
                        and m.kind in ('process_open', 'documents_sent', 'status_update', 'portal_reminder')
                        and m.status not in ('failed', 'bounced'));
$$;

-- חכירות שפקעו: נתפסה ולא נשלחה ⇒ כשל ודאי (לא הגענו לספק). נשלחה ולא הושלמה ⇒ לא ידוע.
create or replace function public._expire_client_notice_leases(p_client_id text default null)
returns void language sql security definer set search_path to 'public' as $$
  update public.client_notices
     set status = 'failed', reason = 'lease_expired_before_send', lease_until = null, updated_at = now()
   where status = 'claimed' and lease_until < now() and (p_client_id is null or client_id = p_client_id);
  update public.client_notices
     set status = 'unknown', reason = 'lease_expired_while_sending', lease_until = null, updated_at = now()
   where status = 'sending' and lease_until < now() and (p_client_id is null or client_id = p_client_id);
$$;

-- ── 6 · תפיסה, שליחה, השלמה, כשל ──────────────────────────────────────────
/**
 * תופסת הודעה לפני שליחה. נקראת רק מפונקציית השליחה (service_role).
 * ‼ הנעילה על שורת הלקוח מסדרת את כל התופסים של אותו לקוח בתור — זה מה
 * שהופך לחיצה כפולה ושתי לשוניות לשליחה אחת. כל תפיסה מחזירה אסימון; בלעדיו
 * אי אפשר לסמן «שולח», להשלים או להכשיל.
 */
create or replace function public.claim_client_notice(
  p_user_id uuid, p_client_id text, p_kind text, p_idempotency_key text,
  p_expected_fingerprint text default null, p_origin text default 'manual',
  p_notice_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c        public.clients%rowtype;
  n        public.client_notices%rowtype;
  v_key    text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_res    jsonb;
  v_items  jsonb;
  v_fp     text;
  v_email  text;
  v_id     uuid;
  v_origin text := p_origin;
  v_kind   text := p_kind;
begin
  if p_kind not in ('new', 'reminder', 'update') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;
  if p_origin not in ('manual', 'auto') then
    return jsonb_build_object('ok', false, 'error', 'bad_origin');
  end if;
  select * into c from public.clients where id = p_client_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if p_user_id is null or c.user_id <> p_user_id then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  perform public._expire_client_notice_leases(c.id);

  if p_notice_id is not null then
    select * into n from public.client_notices where id = p_notice_id and client_id = c.id;
    if n.id is null then return jsonb_build_object('ok', false, 'error', 'notice_not_found'); end if;
    v_key := n.idempotency_key; v_origin := n.origin; v_kind := n.kind;
  elsif v_key is not null then
    select * into n from public.client_notices where user_id = p_user_id and idempotency_key = v_key;
    -- ‼ מפתח שכבר שימש ללקוח אחר — לא «כבר נשלח» ולא המשך של הודעה זרה.
    if n.id is not null and n.client_id <> c.id then
      return jsonb_build_object('ok', false, 'error', 'idempotency_key_conflict');
    end if;
    if n.id is not null then v_origin := n.origin; v_kind := n.kind; end if;
  end if;
  if v_key is null then
    v_key := 'manual:' || gen_random_uuid()::text;
  end if;

  if n.id is not null then
    if n.status = 'sent' then
      return jsonb_build_object('ok', true, 'alreadySent', true, 'noticeId', n.id, 'emailId', n.email_message_id);
    elsif n.status in ('claimed', 'sending') then
      return jsonb_build_object('ok', false, 'error', 'in_flight', 'noticeId', n.id);
    elsif n.status = 'unknown' then
      return jsonb_build_object('ok', false, 'error', 'unknown', 'noticeId', n.id);
    elsif n.status in ('cancelled', 'skipped') then
      return jsonb_build_object('ok', false, 'error', 'not_queued', 'noticeId', n.id, 'reason', n.reason);
    end if;
    -- queued (אוטומטית שהגיע זמנה) או failed (ניסיון חוזר אחרי כשל ודאי) ⇒ ממשיכים.
  end if;

  if exists (select 1 from public.client_notices
              where client_id = c.id and status in ('claimed', 'sending') and id is distinct from n.id) then
    return jsonb_build_object('ok', false, 'error', 'in_flight');
  end if;

  -- ‼ הודעה שלא ידוע אם יצאה חוסמת הודעה מאותו סוג, עד שהרו"ח מכריע.
  select id into v_id from public.client_notices
   where client_id = c.id and kind = v_kind and status = 'unknown' and id is distinct from n.id
   order by created_at desc limit 1;
  if v_id is not null and v_kind <> 'update' then
    if n.id is not null and n.status = 'queued' then
      update public.client_notices set status = 'skipped', reason = 'unknown_pending', updated_at = now() where id = n.id;
    end if;
    return jsonb_build_object('ok', false, 'error', 'unknown_pending', 'noticeId', v_id);
  end if;

  v_res := public._client_notice_items(c.id, v_kind, v_origin, v_kind = 'reminder' and v_origin = 'auto');
  v_items := v_res->'items';
  v_fp := v_res->>'fingerprint';

  if v_kind <> 'update' and jsonb_array_length(v_items) = 0 then
    if n.id is not null and n.status = 'queued' then
      update public.client_notices set status = 'skipped', reason = 'nothing_to_announce', updated_at = now() where id = n.id;
    end if;
    return jsonb_build_object('ok', false, 'error', 'nothing_to_announce');
  end if;

  if p_expected_fingerprint is not null and p_expected_fingerprint <> v_fp then
    return jsonb_build_object('ok', false, 'error', 'items_changed', 'items', v_items, 'fingerprint', v_fp);
  end if;

  v_email := nullif(trim(coalesce(c.email, '')), '');
  if v_email is null then
    -- ‼ אין כתובת ⇒ שום דבר לא נחשב «נמסר». הבקשות נשארות בדף.
    if n.id is not null and n.status = 'queued' then
      update public.client_notices set status = 'skipped', reason = 'no_email', updated_at = now() where id = n.id;
      if v_kind = 'reminder' then
        insert into public.client_step_notice_state (step_id, reminder_backoff_until)
        select x->>'stepId', now() + interval '1 day' from jsonb_array_elements(v_items) x
        on conflict (step_id) do update set reminder_backoff_until = excluded.reminder_backoff_until;
      end if;
    end if;
    return jsonb_build_object('ok', false, 'error', 'no_email');
  end if;

  -- ידנית שנשלחת עכשיו מחליפה את האוטומטית הממתינה מאותו סוג — מייל אחד.
  if v_origin = 'manual' then
    update public.client_notices
       set status = 'cancelled', reason = 'superseded', updated_at = now()
     where client_id = c.id and kind = v_kind and status = 'queued' and id is distinct from n.id;
  end if;

  if n.id is null then
    insert into public.client_notices
      (user_id, client_id, kind, origin, idempotency_key, status, claim_token, lease_until, attempts,
       to_email, fingerprint, provider_gen)
    values (p_user_id, c.id, v_kind, v_origin, v_key, 'claimed', gen_random_uuid(), now() + interval '120 seconds', 1,
            v_email, v_fp, 0)
    returning * into n;
  else
    update public.client_notices
       set status = 'claimed', claim_token = gen_random_uuid(), lease_until = now() + interval '120 seconds',
           attempts = attempts + 1,
           -- ‼ ניסיון אחרי כשל ודאי: הספק לא יצר מייל, ולכן מפתח חדש אצלו.
           provider_gen = case when status = 'failed' then provider_gen + 1 else provider_gen end,
           provider_key_first_used_at = case when status = 'failed' then null else provider_key_first_used_at end,
           request_body = case when status = 'failed' then null else request_body end,
           request_text = case when status = 'failed' then null else request_text end,
           to_email = v_email, fingerprint = v_fp, error = null, reason = null, updated_at = now()
     where id = n.id
     returning * into n;
    delete from public.client_notice_items where notice_id = n.id;
  end if;

  update public.client_notices set provider_key = 'notice-' || n.id || '-' || n.provider_gen where id = n.id
  returning * into n;

  insert into public.client_notice_items (notice_id, step_id, version)
  select n.id, x->>'stepId', (x->>'version')::int from jsonb_array_elements(v_items) x;

  return jsonb_build_object(
    'ok', true, 'noticeId', n.id, 'claimToken', n.claim_token, 'kind', n.kind, 'origin', n.origin,
    'items', v_items, 'fingerprint', v_fp, 'toEmail', v_email,
    'providerKey', n.provider_key,
    'isFirst', public._client_first_page_email(c.id),
    -- ‼ נוסח «ברוכים הבאים / תהליך ההצטרפות» רק בקליטה פתוחה (firstPageEmailKind ב-stepTemplates).
    'openIntake', public.open_intake_engagement_id(c.id) is not null);
end;
$$;

/** רגע לפני הקריאה לספק: מקפיאים את גוף הבקשה המלא — ניסיון חוזר ישלח בדיוק אותו. */
drop function if exists public.mark_client_notice_sending(uuid, uuid, text, jsonb);
-- ‼ החתימה גדלה (p_template_key) — הישנה יורדת, אחרת קריאה בשישה ארגומנטים דו-משמעית.
drop function if exists public.mark_client_notice_sending(uuid, uuid, text, jsonb, text, text);
create or replace function public.mark_client_notice_sending(p_notice_id uuid, p_claim_token uuid,
  p_subject text, p_request_body jsonb, p_request_text text default null, p_event_kind text default null,
  p_template_key text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n public.client_notices%rowtype;
begin
  update public.client_notices
     set status = 'sending', subject = p_subject, request_body = p_request_body,
         request_text = coalesce(p_request_text, p_request_body::text), event_kind = coalesce(p_event_kind, event_kind),
         template_key = coalesce(nullif(p_template_key, ''), template_key),
         provider_key_first_used_at = coalesce(provider_key_first_used_at, now()),
         lease_until = now() + interval '10 minutes', updated_at = now()
   where id = p_notice_id and claim_token = p_claim_token and status = 'claimed' and lease_until > now()
   returning * into n;
  if n.id is null then return jsonb_build_object('ok', false, 'error', 'lost_claim'); end if;
  return jsonb_build_object('ok', true, 'providerKey', n.provider_key);
end;
$$;

/**
 * ניסיון חוזר על הודעה שלא ידוע אם נשלחה — אותו גוף, ואותו מפתח אצל הספק
 * כל עוד לא עברו 23 שעות מהשימוש הראשון בו. ‼ זו תפיסה: מעבר מותנה, אסימון
 * חדש, וחכירה; לחיצה כפולה מקבלת in_flight.
 */
create or replace function public.reclaim_unknown_client_notice(p_user_id uuid, p_notice_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  n public.client_notices%rowtype;
  c public.clients%rowtype;
begin
  select * into n from public.client_notices where id = p_notice_id;
  if n.id is null or n.user_id <> p_user_id then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into c from public.clients where id = n.client_id for update;
  perform public._expire_client_notice_leases(c.id);
  select * into n from public.client_notices where id = p_notice_id;
  if n.status = 'sent' then return jsonb_build_object('ok', true, 'alreadySent', true); end if;
  if n.status in ('claimed', 'sending') then return jsonb_build_object('ok', false, 'error', 'in_flight'); end if;
  if n.status <> 'unknown' then return jsonb_build_object('ok', false, 'error', 'not_unknown', 'status', n.status); end if;
  if n.request_body is null then
    -- לא הגענו לספק בכלל ⇒ זה כשל ודאי, לא «לא ידוע».
    update public.client_notices set status = 'failed', reason = 'never_sent', updated_at = now() where id = n.id;
    return jsonb_build_object('ok', false, 'error', 'never_sent');
  end if;
  if exists (select 1 from public.client_notices where client_id = n.client_id and status in ('claimed', 'sending')) then
    return jsonb_build_object('ok', false, 'error', 'in_flight');
  end if;
  -- ‼ הנמען נפתר מהכרטיס. כתובת שתוקנה מאז ⇒ לא שולחים את הגוף הישן לכתובת הישנה.
  -- ‼ ולא משחררים לבד: ייתכן שהמייל הקודם כן הגיע. ההודעה נשארת «לא ידוע» עד
  -- שהרו"ח משחרר במפורש (resolve_client_notice 'not_sent' ⇒ reason recipient_changed).
  if lower(trim(coalesce(c.email, ''))) is distinct from lower(trim(coalesce(n.to_email, ''))) then
    return jsonb_build_object('ok', false, 'error', 'recipient_changed', 'noticeId', n.id);
  end if;
  -- ‼ אחרי 23 שעות הספק כבר לא מזהה כפילות. לא שולחים את הישן במפתח חדש, ולא
  -- משחררים בשקט (הבקשות היו נכנסות למייל הבא בלי שמישהו החליט) — ההודעה נשארת
  -- «לא ידוע», והרו"ח מחליט במפורש (שחרור ⇒ שליחה חדשה, שעלולה להגיע שוב).
  if n.provider_key_first_used_at < now() - interval '23 hours' then
    return jsonb_build_object('ok', false, 'error', 'retry_expired', 'noticeId', n.id);
  end if;
  -- ‼ הסיבה הקודמת (למשל חכירה שפקעה) לא נגררת לניסיון הזה — היא נקבעת מחדש
  -- מתוצאת הניסיון (fail / חכירה שפוקעת).
  update public.client_notices
     set status = 'sending', claim_token = gen_random_uuid(), attempts = attempts + 1,
         reason = null, lease_until = now() + interval '10 minutes', updated_at = now()
   where id = n.id and status = 'unknown'
   returning * into n;
  if n.id is null then return jsonb_build_object('ok', false, 'error', 'in_flight'); end if;
  return jsonb_build_object('ok', true, 'noticeId', n.id, 'claimToken', n.claim_token,
    'requestBody', n.request_body, 'requestText', n.request_text, 'subject', n.subject, 'providerKey', n.provider_key,
    'kind', n.kind, 'eventKind', n.event_kind, 'origin', n.origin, 'clientId', n.client_id);
end;
$$;

/**
 * הספק החזיר הצלחה. רושמים ביומן הדואר (record_email_sent — מסלול רישום אחד),
 * ורק עכשיו מסמנים את הבקשות כ«נמסרו» — כל אחת בגרסה שנכללה במייל.
 * ‼ הצלחה מהספק גוברת גם על «לא ידוע» וגם על «סומן שלא נשלח».
 */
create or replace function public.complete_client_notice(p_notice_id uuid, p_claim_token uuid, p_resend_id text,
  p_transport text default 'resend', p_event_kind text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  n      public.client_notices%rowtype;
  v_rec  jsonb;
  v_eng  text;
  v_kind text;
  v_meta jsonb;
begin
  update public.client_notices
     set status = 'sent', resend_id = p_resend_id, transport = p_transport, sent_at = now(), lease_until = null,
         error = null, updated_at = now()
   where id = p_notice_id and claim_token = p_claim_token and status not in ('sent', 'cancelled', 'queued')
   returning * into n;
  if n.id is null then
    select * into n from public.client_notices where id = p_notice_id;
    if n.status = 'sent' then return jsonb_build_object('ok', true, 'alreadyRecorded', true, 'emailId', n.email_message_id); end if;
    return jsonb_build_object('ok', false, 'error', 'lost_claim');
  end if;

  v_kind := coalesce(nullif(p_event_kind, ''), nullif(n.event_kind, ''),
              case n.kind when 'reminder' then 'portal_reminder' when 'update' then 'status_update' else 'process_open' end);
  select coalesce(jsonb_agg(jsonb_build_object('stepId', i.step_id, 'version', i.version)), '[]'::jsonb)
    into v_meta from public.client_notice_items i where i.notice_id = n.id;
  v_eng := public.current_engagement_id(n.client_id);

  v_rec := public.record_email_sent(
    p_user_id => n.user_id, p_kind => v_kind, p_to_email => n.to_email, p_subject => n.subject,
    p_resend_id => p_resend_id, p_html => n.request_body->>'html', p_client_id => n.client_id,
    -- ‼ templateKey — איזה נוסח יצא; בלעדיו העמוד «מיילים» סופר את שני הנוסחים של הסוג יחד.
    p_meta => jsonb_build_object('noticeId', n.id, 'noticeKind', n.kind, 'origin', n.origin,
                                 'items', v_meta, 'transport', p_transport)
              || case when nullif(n.template_key, '') is not null
                      then jsonb_build_object('templateKey', n.template_key) else '{}'::jsonb end,
    p_idempotency_key => 'notice:' || n.id,
    p_event_actor => case when n.origin = 'auto' then 'system' else 'accountant' end,
    p_event_note => case n.kind
                      when 'reminder' then 'נשלחה תזכורת ללקוח: '
                      when 'update' then 'נשלח ללקוח הקישור לדף: '
                      else 'נשלח מייל על מה שחדש בדף: ' end || coalesce(n.subject, ''),
    p_event_meta => jsonb_build_object('noticeId', n.id, 'kind', n.kind, 'items', jsonb_array_length(v_meta)),
    p_engagement_id => v_eng);

  update public.client_notices set email_message_id = (v_rec->>'emailId')::uuid where id = n.id;

  if n.kind = 'new' then
    -- ‼ גרסה חדשה שנמסרה מתחילה את ספירת התזכורות מאפס.
    insert into public.client_step_notice_state as ns (step_id, announced_version, announced_at, announced_notice_id,
                                                       reminder_count, last_reminded_at, reminder_backoff_until)
    select i.step_id, i.version, now(), n.id, 0, null, null
      from public.client_notice_items i where i.notice_id = n.id
    on conflict (step_id) do update
       set announced_version = greatest(ns.announced_version, excluded.announced_version),
           announced_at = now(), announced_notice_id = n.id,
           reminder_count = 0, last_reminded_at = null, reminder_backoff_until = null;
  elsif n.kind = 'reminder' then
    insert into public.client_step_notice_state as ns (step_id, reminder_count, last_reminded_at)
    select i.step_id, 1, now() from public.client_notice_items i where i.notice_id = n.id
    on conflict (step_id) do update
       set reminder_count = ns.reminder_count + 1, last_reminded_at = now(), reminder_backoff_until = null;
  end if;

  return jsonb_build_object('ok', true, 'emailId', v_rec->>'emailId', 'noticeId', n.id);
end;
$$;

/** כשל. ודאי (הספק דחה) ⇒ הבקשות משתחררות. לא ודאי (רשת/תקלה/409) ⇒ 'unknown'. */
create or replace function public.fail_client_notice(p_notice_id uuid, p_claim_token uuid, p_error text, p_definite boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n public.client_notices%rowtype;
begin
  -- ‼ לא ודאי ⇒ הסיבה נגזרת מהשגיאה של הניסיון הזה (client_ready_to_send.cause),
  -- לא מסיבה ישנה שנשארה על השורה.
  update public.client_notices
     set status = case when p_definite then 'failed' else 'unknown' end,
         reason = case when p_definite then reason end,
         error = left(coalesce(p_error, ''), 500), lease_until = null, updated_at = now()
   where id = p_notice_id and claim_token = p_claim_token and status in ('claimed', 'sending')
   returning * into n;
  if n.id is null then return jsonb_build_object('ok', false, 'error', 'lost_claim'); end if;
  if p_definite then
    -- ‼ גלוי ביומן «מה נשלח», בלי מפתח ייחודי — אחרת השליחה המוצלחת הבאה
    -- הייתה נרשמת כ«כבר נרשם» והיומן היה מראה רק את הכשל (EMAIL-POLICY).
    insert into public.email_messages (user_id, client_id, to_email, subject, kind, html, status, error, meta)
    values (n.user_id, n.client_id, n.to_email, coalesce(n.subject, ''),
            coalesce(nullif(n.event_kind, ''), case n.kind when 'reminder' then 'portal_reminder' when 'update' then 'status_update' else 'process_open' end),
            n.request_body->>'html', 'failed', left(coalesce(p_error, ''), 500),
            jsonb_build_object('noticeId', n.id, 'origin', n.origin)
              || case when nullif(n.template_key, '') is not null
                      then jsonb_build_object('templateKey', n.template_key) else '{}'::jsonb end);
    if n.kind = 'reminder' and n.origin = 'auto' then
      insert into public.client_step_notice_state (step_id, reminder_backoff_until)
      select i.step_id, now() + interval '1 day' from public.client_notice_items i where i.notice_id = n.id
      on conflict (step_id) do update set reminder_backoff_until = excluded.reminder_backoff_until;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'status', n.status);
end;
$$;

/**
 * הרו"ח מכריע: «לא נשלח» משחרר את הבקשות של הודעה שלא ידוע מה עלה בגורלה;
 * «אל תשלח לבד» מבטל הודעה אוטומטית שממתינה.
 * ‼ הסיבה שנרשמת אומרת למה שוחרר: recipient_changed כשהכתובת בכרטיס כבר אינה
 * הכתובת שאליה נשלח המייל (שחרור לכתובת החדשה), אחרת office_marked_not_sent.
 */
create or replace function public.resolve_client_notice(p_notice_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid    uuid := auth.uid();
  n        public.client_notices%rowtype;
  v_email  text;
  v_reason text;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into n from public.client_notices where id = p_notice_id;
  if n.id is null or n.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- אותו סדר נעילה כמו התפיסה: קודם שורת הלקוח.
  select email into v_email from public.clients where id = n.client_id for update;
  perform public._expire_client_notice_leases(n.client_id);
  if p_action = 'not_sent' then
    v_reason := case when lower(trim(coalesce(v_email, ''))) is distinct from lower(trim(coalesce(n.to_email, '')))
                     then 'recipient_changed' else 'office_marked_not_sent' end;
    update public.client_notices set status = 'failed', reason = v_reason, updated_at = now()
     where id = n.id and status = 'unknown';
    if not found then return jsonb_build_object('ok', false, 'error', 'not_unknown'); end if;
    return jsonb_build_object('ok', true, 'status', 'failed', 'reason', v_reason);
  elsif p_action = 'cancel_queued' then
    update public.client_notices set status = 'cancelled', reason = 'office_cancelled', updated_at = now()
     where id = n.id and status = 'queued';
    if not found then return jsonb_build_object('ok', false, 'error', 'not_queued'); end if;
    return jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;
  return jsonb_build_object('ok', false, 'error', 'bad_action');
end;
$$;

/**
 * הודעה אוטומטית ממתינה ללקוח. «חדש»: כמה תוספות קרובות נאספות להודעה אחת —
 * כל תוספת דוחה את מועד השליחה, אבל לא יותר מחצי שעה מהראשונה.
 * «תזכורת»: לכל היותר אחת ביום ללקוח (מפתח קבוע ליום), כך שכשל אינו לולאה.
 */
create or replace function public.enqueue_client_notice(p_client_id text, p_kind text default 'new',
  p_due_at timestamptz default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  c     public.clients%rowtype;
  v_id  uuid;
  v_due timestamptz := coalesce(p_due_at, now() + interval '2 minutes');
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;
  if p_kind = 'reminder' then
    insert into public.client_notices (user_id, client_id, kind, origin, idempotency_key, status, due_at)
    values (c.user_id, c.id, 'reminder', 'auto',
            'auto:reminder:' || c.id || ':' || to_char(now() at time zone 'Asia/Jerusalem', 'YYYY-MM-DD'),
            'queued', v_due)
    on conflict do nothing
    returning id into v_id;
    return v_id;
  end if;
  insert into public.client_notices (user_id, client_id, kind, origin, idempotency_key, status, due_at)
  values (c.user_id, c.id, p_kind, 'auto', 'auto:' || p_kind || ':' || c.id || ':' || gen_random_uuid()::text,
          'queued', v_due)
  on conflict (client_id, kind) where status = 'queued'
  do update set due_at = least(greatest(public.client_notices.due_at, excluded.due_at),
                               public.client_notices.created_at + interval '30 minutes'),
                updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- ── 7 · המשלח האוטומטי ────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'client_notice_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'client_notice_secret');
  end if;
end $$;

create or replace function public.verify_client_notice_secret(p text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(p, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'client_notice_secret' and decrypted_secret = p);
$$;

/** קריאה לפונקציית השליחה. ‼ לעולם לא מפילה את הכתיבה שהפעילה אותה (כמו 211). */
create or replace function public._kick_edge(p_function text, p_body jsonb)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_base   text;
  v_secret text;
begin
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'functions_base_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'client_notice_secret';
  if v_base is null or v_secret is null then return; end if;
  perform net.http_post(
    url := rtrim(v_base, '/') || '/functions/v1/' || p_function,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-client-notice-secret', v_secret),
    body := p_body,
    timeout_milliseconds := 30000);
exception when others then
  null;
end;
$$;

/**
 * הדופק (cron כל 5 דקות — בייצור בלבד, שלב שחרור מפורש):
 *   1. תזכורות שהגיע זמנן נכנסות לתור (פריט אחד לפחות שהגיע זמנו).
 *   2. חכירות שפקעו — כשל ודאי / לא ידוע.
 *   3. מה שבתור ושהגיע זמנו נשלח; אחרי 5 ניסיונות בלי תוצאה — «נתקע», גלוי במגש.
 *   4. התראות למשרד שממתינות — נשלחות מהשרת, לא רק כשהרו"ח נכנס למערכת.
 *   5. רשת ביטחון למסלולים: צעד נעול שתלותו הושלמה נפתח (מרוץ בין שני הורים).
 */
create or replace function public.kick_due_client_notices(p_limit int default 20)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  r        record;
  v_kicked int := 0;
  v_rem    int := 0;
  v_users  int := 0;
  v_healed int := 0;
begin
  for r in
    select distinct s.client_id
      from public.onboarding_steps s
      join public.flow_runs fr on fr.id = s.flow_run_id and fr.status = 'active'
      join public.client_step_notice_state ns on ns.step_id = s.id
     where jsonb_typeof(s.payload->'reminder') = 'object'
       and ns.announced_version >= 1
       and s.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked')
       and coalesce(ns.reminder_backoff_until, '-infinity'::timestamptz) <= now()
       and coalesce(ns.last_reminded_at, ns.announced_at) <= now() - interval '1 day'
  loop
    if jsonb_array_length(public._client_notice_items(r.client_id, 'reminder', 'auto', true)->'items') > 0
       and public.enqueue_client_notice(r.client_id, 'reminder', now()) is not null then
      v_rem := v_rem + 1;
    end if;
  end loop;

  perform public._expire_client_notice_leases(null);

  update public.client_notices
     set status = 'skipped', reason = 'kick_exhausted', updated_at = now()
   where status = 'queued' and kick_attempts >= 5;

  for r in
    select id from public.client_notices
     where status = 'queued' and due_at <= now()
       and (last_kicked_at is null or last_kicked_at < now() - interval '4 minutes')
     order by due_at
     limit greatest(p_limit, 1)
     for update skip locked
  loop
    update public.client_notices set kick_attempts = kick_attempts + 1, last_kicked_at = now() where id = r.id;
    perform public._kick_edge('send-process-open-email', jsonb_build_object('noticeId', r.id));
    v_kicked := v_kicked + 1;
  end loop;

  for r in
    select distinct user_id from public.accountant_notifications
     where sent_at is null and suppressed_at is null and attempts < 3
       and created_at > now() - interval '2 days'
  loop
    perform public._kick_edge('notify-accountant', jsonb_build_object('userId', r.user_id));
    v_users := v_users + 1;
  end loop;

  -- רשת הביטחון של המסלולים מוגדרת ב-215.
  begin
    v_healed := public._flow_heal_all();
  exception when undefined_function then null;
  end;

  return jsonb_build_object('ok', true, 'kicked', v_kicked, 'remindersQueued', v_rem, 'officeFlushes', v_users,
                            'healed', v_healed);
end;
$$;

-- ── 8 · תצוגה מקדימה ומגש «מוכן לשליחה» ───────────────────────────────────
create or replace function public.client_notice_preview(p_client_id text, p_kind text default 'new')
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  c     public.clients%rowtype;
  v_res jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is not null and (c.user_id <> v_uid or not public.is_authorized()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  v_res := public._client_notice_items(c.id, p_kind, 'manual', false);
  return jsonb_build_object('ok', true, 'kind', p_kind, 'items', v_res->'items', 'fingerprint', v_res->>'fingerprint',
    'toEmail', nullif(trim(coalesce(c.email, '')), ''), 'isFirst', public._client_first_page_email(c.id),
    'openIntake', public.open_intake_engagement_id(c.id) is not null);
end;
$$;

/**
 * המגש: אותה צורה כמו 192 ועוד שדות. owner.items = «חדש» (המסך הקיים קורא
 * רק את זה ולכן ממשיך לעבוד), ונוספו: מה שממתין לשליחה לבד, מה שבתנועה,
 * מה שלא ידוע אם נשלח, ומה שאפשר להזכיר.
 * ‼ «בתנועה» רק בחכירה חיה; «שולח» שחכירתו פקעה מוצג כ«לא ידוע».
 */
create or replace function public.client_ready_to_send(p_client_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid       uuid := auth.uid();
  c           public.clients%rowtype;
  v_last_sent timestamptz;
  v_new       jsonb;
  v_rem       jsonb;
  v_owner     jsonb := '[]'::jsonb;
  v_persons   jsonb := '[]'::jsonb;
  v_queued    jsonb;
  v_unknown   jsonb;
  v_inflight  boolean;
  v_last_rem  timestamptz;
  s           record;
  x           jsonb;
  v_exec      jsonb;
  v_track     jsonb;
  v_role      text;
  v_email     text;
  v_name      text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is not null and (c.user_id <> v_uid or not public.is_authorized()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select max(sent_at) into v_last_sent
    from public.email_messages
   where client_id = p_client_id
     and kind in ('process_open', 'documents_sent', 'status_update', 'portal_reminder')
     and status <> 'failed';
  select max(sent_at) into v_last_rem
    from public.client_notices where client_id = p_client_id and kind = 'reminder' and status = 'sent';

  v_new := public._client_notice_items(c.id, 'new', 'manual', false);
  for x in select value from jsonb_array_elements(v_new->'items')
  loop
    select s2.id, s2.step_type, s2.payload, s2.published_at, coalesce(ns.announced_version, 0) as announced
      into s from public.onboarding_steps s2
      left join public.client_step_notice_state ns on ns.step_id = s2.id
     where s2.id = x->>'stepId';
    v_owner := v_owner || jsonb_strip_nulls(jsonb_build_object(
      'stepId', s.id, 'stepType', s.step_type,
      'title', coalesce(nullif(s.payload->>'title', ''), nullif(s.payload->>'clientTitle', '')),
      'publishedAt', s.published_at,
      -- ‼ «העדכון טרם נשלח»: נמסר בעבר והשתנה מאז.
      'changedAt', case when s.announced >= 1 then now() end,
      'version', (x->>'version')::int,
      'isDocument', (x->>'isDocument')::boolean,
      'delivery', x->>'delivery'));
  end loop;

  v_rem := public._client_notice_items(c.id, 'reminder', 'manual', false);

  select jsonb_build_object('noticeId', n.id, 'dueAt', n.due_at, 'kind', n.kind,
           'kickAttempts', n.kick_attempts, 'lastKickedAt', n.last_kicked_at)
    into v_queued
    from public.client_notices n
   where n.client_id = c.id and n.status = 'queued' and n.kind = 'new'
   order by n.due_at limit 1;

  -- ‼ «לא ידוע» — העובדות שידועות, כדי שהמשרד יכריע בלי לנחש:
  --   at — הניסיון הראשון (ממנו נמדד החלון של הספק), לא העדכון האחרון;
  --   retryUntil — עד מתי «שלח שוב (אותו מייל)» לא ישלח פעמיים (null ⇒ אין מה לשלוח שוב);
  --   recipientChanged — הכתובת בכרטיס כבר אינה הכתובת שאליה נשלח (אותה השוואה כמו reclaim);
  --   cause — מה ידוע על הניסיון האחרון (בלי טקסט הספק באנגלית);
  --   itemList — הבקשות שבמייל, ואם עדיין פתוחות.
  select coalesce(jsonb_agg(jsonb_build_object('noticeId', n.id,
           'at', coalesce(n.provider_key_first_used_at, n.created_at),
           'lastTriedAt', n.updated_at,
           'retryUntil', case when n.request_body is not null and n.provider_key_first_used_at is not null
                              then n.provider_key_first_used_at + interval '23 hours' end,
           'toEmail', n.to_email,
           'recipientChanged', lower(trim(coalesce(c.email, ''))) is distinct from lower(trim(coalesce(n.to_email, ''))),
           'origin', n.origin,
           'attempts', n.attempts,
           'cause', case
                      when n.status = 'sending' or coalesce(n.reason, '') = 'lease_expired_while_sending' then 'cut_off'
                      when coalesce(n.error, '') like 'retry_rejected:%' then 'retry_rejected'
                      when coalesce(n.error, '') like 'network:%' then 'no_answer'
                      when coalesce(n.error, '') = 'ok_without_id' then 'accepted_no_id'
                      when coalesce(n.error, '') ~* 'concurrent_idempotent' then 'provider_busy'
                      else 'provider_error' end,
           'kind', n.kind,
           'subject', n.subject,
           'items', (select count(*) from public.client_notice_items i where i.notice_id = n.id),
           'itemList', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'title', public._client_step_title(st.step_type, st.payload),
                                  'stillOpen', st.status not in ('completed', 'verified', 'skipped', 'cancelled'))
                                  order by coalesce(st.pending_sort_order, st.sort_order, 0), st.created_at, st.id), '[]'::jsonb)
                          from public.client_notice_items i
                          join public.onboarding_steps st on st.id = i.step_id
                         where i.notice_id = n.id))
           order by n.updated_at desc), '[]'::jsonb)
    into v_unknown
    from public.client_notices n
   where n.client_id = c.id
     and (n.status = 'unknown' or (n.status = 'sending' and n.lease_until < now()));

  v_inflight := exists (select 1 from public.client_notices n
                         where n.client_id = c.id and n.status in ('claimed', 'sending') and n.lease_until > now());

  -- אנשים (ב"ל) — ללא שינוי מ-192: הוראות לאדם עצמו, במייל שלו.
  for s in
    select st.id, st.payload
      from public.onboarding_steps st
     where st.client_id = p_client_id
       and st.step_type = 'authority_representation'
       and st.payload->>'authority' = 'national_insurance'
       and st.status not in ('completed', 'verified', 'skipped', 'cancelled')
     order by st.sort_order, st.created_at
  loop
    v_role := case when s.payload->>'subjectRole' = 'spouse' then 'spouse' else 'client' end;
    select execution into v_exec from public.representation_requests
     where id = s.payload->>'representationRequestId';
    v_track := coalesce(v_exec -> (case when v_role = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end), '{}'::jsonb);
    continue when nullif(v_track->>'referenceNumber', '') is null;
    continue when (v_track->>'instructionsSentAt') is not null;
    continue when nullif(v_track->>'deadline', '') is not null and (v_track->>'deadline')::date < current_date;

    v_email := case when v_role = 'spouse' then c.spouse_email else c.email end;
    v_name  := coalesce(nullif(s.payload->>'subjectName', ''),
                 case when v_role = 'spouse'
                      then nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), '')
                      else nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') end,
                 case when v_role = 'spouse' then 'בן/בת הזוג' else 'הלקוח' end);
    v_persons := v_persons || jsonb_strip_nulls(jsonb_build_object(
      'role', v_role, 'name', v_name,
      'email', nullif(trim(coalesce(v_email, '')), ''),
      'stepId', s.id, 'requestId', s.payload->>'representationRequestId',
      'referenceNumber', v_track->>'referenceNumber',
      'deadline', nullif(v_track->>'deadline', '')));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'owner', jsonb_strip_nulls(jsonb_build_object(
      'email', nullif(trim(coalesce(c.email, '')), ''),
      'lastSentAt', v_last_sent,
      'items', v_owner,
      'fingerprint', v_new->>'fingerprint',
      'reminder', jsonb_build_object('items', v_rem->'items', 'fingerprint', v_rem->>'fingerprint',
                                     'lastReminderAt', v_last_rem),
      'queued', v_queued,
      'unknown', v_unknown,
      'inFlight', v_inflight)),
    'persons', v_persons);
end;
$$;

-- ── 9 · הרשאות ───────────────────────────────────────────────────────────
-- ‼ פונקציה פנימית נסגרת גם ל-authenticated: ברירת המחדל של סופאבייס נותנת
-- לו הרצה ישירות, והטריגר של 160 מסיר רק את PUBLIC (165:260-264).
revoke all on function public._step_open_item_keys(jsonb) from public, anon, authenticated;
revoke all on function public.onboarding_step_content_version_trg() from public, anon, authenticated;
revoke all on function public._client_step_title(text, jsonb) from public, anon;
revoke all on function public._client_step_portal_key(text, text) from public, anon;
revoke all on function public.client_step_gate_open(text, timestamptz) from public, anon, authenticated;
revoke all on function public._client_announceable_steps(text) from public, anon, authenticated;
revoke all on function public._client_notice_items(text, text, text, boolean) from public, anon, authenticated;
revoke all on function public._client_first_page_email(text) from public, anon, authenticated;
revoke all on function public._expire_client_notice_leases(text) from public, anon, authenticated;
revoke all on function public.claim_client_notice(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.mark_client_notice_sending(uuid, uuid, text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.reclaim_unknown_client_notice(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_client_notice(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.fail_client_notice(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.enqueue_client_notice(text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.verify_client_notice_secret(text) from public, anon, authenticated;
revoke all on function public._kick_edge(text, jsonb) from public, anon, authenticated;
revoke all on function public.kick_due_client_notices(int) from public, anon, authenticated;
revoke all on function public.resolve_client_notice(uuid, text) from public, anon;
revoke all on function public.client_notice_preview(text, text) from public, anon;
revoke all on function public.client_ready_to_send(text) from public, anon;

grant execute on function public._client_step_title(text, jsonb) to authenticated, service_role;
grant execute on function public._client_step_portal_key(text, text) to authenticated, service_role;
grant execute on function public.client_step_gate_open(text, timestamptz) to service_role;
grant execute on function public._client_announceable_steps(text) to service_role;
grant execute on function public._client_notice_items(text, text, text, boolean) to service_role;
grant execute on function public._client_first_page_email(text) to service_role;
grant execute on function public._expire_client_notice_leases(text) to service_role;
grant execute on function public.claim_client_notice(uuid, text, text, text, text, text, uuid) to service_role;
grant execute on function public.mark_client_notice_sending(uuid, uuid, text, jsonb, text, text, text) to service_role;
grant execute on function public.reclaim_unknown_client_notice(uuid, uuid) to service_role;
grant execute on function public.complete_client_notice(uuid, uuid, text, text, text) to service_role;
grant execute on function public.fail_client_notice(uuid, uuid, text, boolean) to service_role;
grant execute on function public.enqueue_client_notice(text, text, timestamptz) to service_role;
grant execute on function public.verify_client_notice_secret(text) to service_role;
grant execute on function public._kick_edge(text, jsonb) to service_role;
grant execute on function public.kick_due_client_notices(int) to service_role;
grant execute on function public.resolve_client_notice(uuid, text) to authenticated, service_role;
grant execute on function public.client_notice_preview(text, text) to authenticated, service_role;
grant execute on function public.client_ready_to_send(text) to authenticated, service_role;

select public.assert_domain_function_invariants();
