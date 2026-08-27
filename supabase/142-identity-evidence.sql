-- 142 — צילום התעודה, ולא רק המספר
--
-- עד כה הקליטה אספה מספר זיהוי נוסף (ת.ז. הורה / רישיון / דרכון) והסתפקה בו.
-- מעכשיו נדרש גם צילום התעודה עצמה, לפי האמצעי שנבחר:
--   רישיון נהיגה ⇒ צילום רישיון · דרכון ⇒ צילום דרכון · ת.ז. הורה ⇒ ת.ז. או רישיון
--
-- ממי — נגזר מהיקף הייצוג שהתבקש (`representation_requests.scope`), לפי אדם
-- ולא לפי רשות: מי שמופיע בשלוש רשויות מעלה תעודה פעם אחת. אצל זוג נשוי עם
-- ייצוג במס הכנסה נדרשים שניהם, כי שניהם חותמים על טופס 2279.
--
-- (א) `representation_requests.identity_docs` — jsonb:
--       { "client": [{documentId, docKind, fileName, at}], "spouse": [...] }
--     הקבצים עצמם נשמרים כמסמכים רגילים בתיק הלקוח (category='id_card'),
--     ולא במקום חדש — כדי שיימצאו איפה שכל מסמך אחר נמצא.
--     NULL/חסר = בקשה שנפתחה לפני המהלך; אין דרישה רטרואקטיבית.
--
-- (ב) `get_onboarding` מחזירה גם `scope` ו-`identity_docs`, כדי שדף הקליטה
--     ידע ממי לבקש ומה כבר הגיע. שאר העמודות והחתימה לא השתנו — גרסת UI
--     ישנה בדפדפן ממשיכה לעבוד ופשוט מתעלמת מהשדות החדשים.

alter table public.representation_requests
  add column if not exists identity_docs jsonb;

comment on column public.representation_requests.identity_docs is
  'צילומי תעודות שהתקבלו בקליטה, לפי אדם: {client:[{documentId,docKind,...}], spouse:[...]}. NULL = בקשה מלפני מיגרציה 142.';

-- ── (ב) get_onboarding — שני שדות נוספים בסוף ────────────────────────────────
-- ‼ RETURNS TABLE משתנה ⇒ חייבים drop לפני create (אחרת 42P13).
drop function if exists public.get_onboarding(text);

create or replace function public.get_onboarding(p_token text)
 returns table(
   client_name text, firm_name text, branding jsonb, already_submitted boolean,
   status text, authorities text[], already_signed boolean, has_setup boolean,
   known_first_name text, known_last_name text, known_email text,
   known_family_status text, known_family_status_year integer,
   ni_included boolean, prefill jsonb,
   scope jsonb, identity_docs jsonb
 )
 language sql
 security definer
 set search_path to 'public'
as $function$
  select r.client_name,
         coalesce(p.firm_name, '') as firm_name,
         coalesce(p.branding, '{}'::jsonb) as branding,
         (r.onboarding_status = 'submitted') as already_submitted,
         r.status,
         coalesce(r.authorities, '{}'::text[]) as authorities,
         (r.identification ? 'signatureDataUrl') as already_signed,
         (r.signature_setup is not null) as has_setup,
         nullif(c.first_name, '') as known_first_name,
         nullif(c.last_name, '')  as known_last_name,
         nullif(coalesce(c.email, r.client_email), '') as known_email,
         nullif(c.family_status, '') as known_family_status,
         case c.family_status
           when 'married'  then c.marriage_year
           when 'divorced' then c.divorce_year
           when 'widowed'  then c.widowhood_year
           else null
         end as known_family_status_year,
         coalesce(c.authority_representations ? 'nationalInsurance', false) as ni_included,
         coalesce(r.prefill, '{}'::jsonb) as prefill,
         -- ‼ ההיקף מהבקשה קודם; מרשם הכרטיס הוא נפילה-לאחור לבקשות ישנות,
         -- בדיוק כמו במסכי הרו"ח (`requestScope`).
         coalesce(r.scope, c.authority_representations, '{}'::jsonb) as scope,
         coalesce(r.identity_docs, '{}'::jsonb) as identity_docs
  from public.representation_requests r
  join public.profiles p on p.id = r.user_id
  left join public.clients c on c.id = r.linked_client_id
  where r.onboarding_token = p_token
  limit 1;
$function$;
