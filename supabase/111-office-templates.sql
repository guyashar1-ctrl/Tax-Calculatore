-- ─── 111 · תבניות בקשה ברמת המשרד ───────────────────────────────────────────
-- ארבעה חלקים, וכולם תוספתיים:
--
-- 1. profiles.office_id — שיוך המשרד. ‼ אין במוצר מודל דיירים קיים: כל טבלה
--    שייכת ל-auth user בודד. לכן לא המצאתי היררכיה חדשה אלא הוספתי מפתח
--    קיבוץ אחד על הפרופיל שכבר קיים. כל משתמש קיים הופך למשרד של עצמו
--    (office_id = id), ולכן **שום הרשאה לא משתנה היום**. צירוף עובד למשרד
--    קיים הוא עדכון של שדה אחד.
--
-- 2. journey_templates — office_id (בעלות), kind ('journey' | 'request'),
--    ו-seed_key לתבניות מובנות. user_id נשאר כ"מי יצר".
--
-- 3. תבניות מובנות = office_id IS NULL. גלויות לכולם, אינן ניתנות לעריכה.
--    "עדכן תבנית" על מובנית יוצר עותק של המשרד (copy-on-write) — כך אין
--    צורך לזרוע שורות לכל משרד בנפרד, ואין תוכן שהמשרד לא יכול לשנות.
--
-- 4. save_request_template / update_request_template — שמירה של **בקשה אחת**
--    כתבנית ועדכון תבנית קיימת. save_journey_template הקיימת (מסע שלם) לא
--    נגעה, וכללי הניקוי שלה משוכפלים לפונקציית עזר אחת ומשמשים את שתיהן.
--
-- ‼ מה שלא נגע: הבקשות עצמן. בקשה היא צילום — היא נוצרת עם התוכן שהיה
-- ברגע היצירה, ושינוי תבנית בעתיד אינו נוגע בה. זו כבר ההתנהגות היום
-- (create_onboarding_request מעתיק את ה-payload), ולכן אין כאן מה לשנות.

-- ── 1 · שיוך משרד ───────────────────────────────────────────────────────────
alter table public.profiles add column if not exists office_id uuid;
update public.profiles set office_id = id where office_id is null;
alter table public.profiles alter column office_id set not null;

create index if not exists profiles_office_id_idx on public.profiles (office_id);

-- ‼ SECURITY DEFINER: מדיניות ה-RLS של התבניות קוראת לזה, ובלי זה היא הייתה
-- צריכה לקרוא מ-profiles — שעליה יש RLS משלה, כלומר רקורסיה.
create or replace function public.current_office_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select office_id from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_office_id() to authenticated;

-- ── 2 · בעלות התבניות ───────────────────────────────────────────────────────
alter table public.journey_templates add column if not exists office_id uuid;
alter table public.journey_templates add column if not exists kind text not null default 'journey';
alter table public.journey_templates add column if not exists seed_key text;

-- כל תבנית קיימת עוברת למשרד של מי שיצר אותה. אצל משתמש יחיד זה בדיוק
-- אותו דבר, ולכן אף תבנית לא משנה בעלים בפועל.
update public.journey_templates t
   set office_id = p.office_id
  from public.profiles p
 where p.id = t.user_id and t.office_id is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'journey_templates_kind_check') then
    alter table public.journey_templates
      add constraint journey_templates_kind_check check (kind in ('journey','request'));
  end if;
end $$;

-- תבנית מובנית אחת לכל מפתח. תבנית של משרד אינה נושאת seed_key.
create unique index if not exists journey_templates_seed_key_idx
  on public.journey_templates (seed_key) where seed_key is not null;

create index if not exists journey_templates_office_idx
  on public.journey_templates (office_id, kind);

-- ‼ החלפת המדיניות: קריאה — המשרד שלי או מובנית (office_id null). כתיבה —
-- המשרד שלי בלבד. משרד אחר לעולם אינו רואה ולא כותב. המובנות קריאות לכולם
-- ואינן ניתנות לכתיבה לאיש.
drop policy if exists journey_templates_own on public.journey_templates;

drop policy if exists journey_templates_read on public.journey_templates;
create policy journey_templates_read on public.journey_templates for select to authenticated
  using (office_id = public.current_office_id() or office_id is null);

drop policy if exists journey_templates_insert on public.journey_templates;
create policy journey_templates_insert on public.journey_templates for insert to authenticated
  with check (office_id = public.current_office_id() and office_id is not null);

drop policy if exists journey_templates_update on public.journey_templates;
create policy journey_templates_update on public.journey_templates for update to authenticated
  using (office_id = public.current_office_id() and office_id is not null)
  with check (office_id = public.current_office_id() and office_id is not null);

drop policy if exists journey_templates_delete on public.journey_templates;
create policy journey_templates_delete on public.journey_templates for delete to authenticated
  using (office_id = public.current_office_id() and office_id is not null);

-- ── 3 · ניקוי משותף: בקשה של לקוח ⇐ תוכן תבנית ──────────────────────────────
-- ‼ מקור אחד לכלל "מה אישי ומה תוכן". היה קבור בתוך save_journey_template;
-- עכשיו שתי הפונקציות קוראות לו, ולכן אי אפשר שיסטו זו מזו.
create or replace function public.template_payload_from_step(p_payload jsonb)
returns jsonb
language sql
immutable
as $$
  select (coalesce(p_payload, '{}'::jsonb)
            - 'published' - 'releaseToken' - 'releaseBody' - 'releaseSubject'
            - 'releaseSentAt' - 'objectionDueDate' - 'submitted' - 'submittedByClient'
            - 'prevAccountantSignature' - 'prevAccountantSignedAt' - 'prevAccountantSignerName'
            - 'authUrl' - 'providerRef'
            - 'autoExecutedAt' - 'autoError' - 'templateOrigin')
      || case when p_payload ? 'checklist' then jsonb_build_object('checklist',
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'key', x->>'key', 'label', x->>'label', 'done', false) order by ord), '[]'::jsonb)
              from jsonb_array_elements(p_payload->'checklist') with ordinality t(x, ord)))
         else '{}'::jsonb end
      || case when p_payload ? 'requirements' then jsonb_build_object('requirements',
           (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                     'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                     'required', coalesce((x->>'required')::boolean, true),
                     'options', x->'options',
                     'maxFiles', x->'maxFiles',
                     'done', false)) order by ord), '[]'::jsonb)
              from jsonb_array_elements(p_payload->'requirements') with ordinality t(x, ord)))
         else '{}'::jsonb end;
$$;

-- ── 4 · שמירת בקשה אחת כתבנית ───────────────────────────────────────────────
create or replace function public.save_request_template(
  p_step_id text, p_name text, p_description text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s       public.onboarding_steps%rowtype;
  v_uid   uuid := auth.uid();
  v_office uuid;
  v_id    text;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_name');
  end if;

  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
  values (v_uid, v_office, 'request', trim(p_name),
          nullif(trim(coalesce(p_description,'')), ''),
          jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
            'key', 'e1',
            'stepType', s.step_type,
            'owner', case when s.payload ? 'externalParty' then 'external'
                          when s.ball = 'client' then 'client' else 'me' end,
            'requiredForClose', coalesce(s.required_for_close, true),
            'payload', public.template_payload_from_step(
              coalesce(s.draft_payload, s.payload))))))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'templateId', v_id);
end;
$function$;

-- ── 5 · עדכון תבנית קיימת מתוך בקשה ─────────────────────────────────────────
-- ‼ פעולה מפורשת בלבד. עריכת בקשה של לקוח לעולם אינה מגיעה לכאן.
-- ‼ תבנית מובנית (office_id null) אינה נכתבת — במקומה נוצר עותק של המשרד,
-- כדי שלא יהיה תוכן שהמשרד רואה ולא יכול לתקן.
create or replace function public.update_request_template(
  p_template_id text, p_step_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s        public.onboarding_steps%rowtype;
  t        public.journey_templates%rowtype;
  v_uid    uuid := auth.uid();
  v_office uuid;
  v_entry  jsonb;
  v_id     text;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  select * into t from public.journey_templates where id = p_template_id;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;
  if t.office_id is not null and t.office_id <> v_office then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_entry := jsonb_strip_nulls(jsonb_build_object(
    'key', 'e1',
    'stepType', s.step_type,
    'owner', case when s.payload ? 'externalParty' then 'external'
                  when s.ball = 'client' then 'client' else 'me' end,
    'requiredForClose', coalesce(s.required_for_close, true),
    'payload', public.template_payload_from_step(coalesce(s.draft_payload, s.payload))));

  if t.office_id is null then
    -- מובנית: נשארת כפי שהיא, והמשרד מקבל עותק משלו שגובר עליה בתצוגה.
    insert into public.journey_templates (user_id, office_id, kind, name, description, entries, seed_key)
    values (v_uid, v_office, 'request', t.name, t.description, jsonb_build_array(v_entry), t.seed_key)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'templateId', v_id, 'copiedFromSeed', true);
  end if;

  update public.journey_templates
     set entries = jsonb_build_array(v_entry), updated_at = now()
   where id = t.id;

  return jsonb_build_object('ok', true, 'templateId', t.id);
end;
$function$;

grant execute on function public.save_request_template(text, text, text) to authenticated;
grant execute on function public.update_request_template(text, text) to authenticated;

-- ── 6 · תבניות מובנות ───────────────────────────────────────────────────────
-- ‼ התוכן זהה למה שהמחולל האוטומטי כבר יוצר (generate_onboarding_steps).
-- לא נכתב כאן תוכן מקצועי חדש — רק הועתק, כדי שהוספה ידנית תפסיק להיווצר
-- ריקה. איחוד המחולל עצמו לקריאה מכאן נדחה בכוונה (ראה דוח).

-- user_id היה NOT NULL; תבנית מובנית אינה שייכת לאיש, ולכן משחררים לפני הזריעה.
alter table public.journey_templates alter column user_id drop not null;

insert into public.journey_templates (user_id, office_id, kind, seed_key, name, description, entries)
select null, null, 'request', 'client_documents', 'מסמכים מהלקוח',
       'רשימת המסמכים שמבקשים מלקוח חדש',
       jsonb_build_array(jsonb_build_object(
         'key','e1', 'stepType','client_documents', 'owner','client', 'requiredForClose', true,
         'payload', jsonb_build_object(
           'checklist', jsonb_build_array(
             jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק','done',false),
             jsonb_build_object('key','id_card','label','צילום תעודת זהות','done',false)),
           'clientTitle','להעלות 2 מסמכים',
           'clientSub','אישור ניהול חשבון בנק · צילום תעודת זהות',
           'clientCta','להעלאה')))
where not exists (select 1 from public.journey_templates where seed_key = 'client_documents');

insert into public.journey_templates (user_id, office_id, kind, seed_key, name, description, entries)
select null, null, 'request', 'prev_accountant_details', 'פרטי הרו״ח הקודם',
       'הלקוח מוסר שם, מייל וטלפון של הרו״ח הקודם',
       jsonb_build_array(jsonb_build_object(
         'key','e1', 'stepType','prev_accountant_details', 'owner','client', 'requiredForClose', true,
         'payload', jsonb_build_object(
           'clientTitle','פרטי רואה החשבון הקודם שלך',
           'clientSub','שם, אימייל וטלפון — כדי שנפנה אליו בשמך',
           'clientCta','למילוי')))
where not exists (select 1 from public.journey_templates where seed_key = 'prev_accountant_details');
