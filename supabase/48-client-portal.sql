-- ═══════════════════════════════════════════════════════════════════════════
--  48 · הדף האישי של הלקוח (?portal=)
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ הבעיה: קליטה עם שלושה מסלולים פעילים = שלושה מיילים עם שלושה קישורים
--  שונים, ולקוח שלא זוכר איזה מהם עוד רלוונטי. הפתרון: קישור אחד קבוע,
--  שתמיד מציג את המצב העדכני — מה הושלם, מה ממתין לו, ומה בטיפול המשרד.
--
--  ‼ הדף הוא מפה, לא מפתח-על: הוא מציג סטטוסים ומוביל לפעולות, אבל כל
--  פעולה רגישה ממשיכה לעבור דרך הטוקן הממודר שלה (onboard/sign/intake) —
--  בדיוק הקישורים שהלקוח היה מקבל במייל ממילא. שום נתון רגיש (ת.ז., סכומים
--  מעבר למה שבמייל) לא נחשף.
--
--  ‼ מה הלקוח רואה (הכרעת גיא): גם את מה שבטיפול המשרד — "הגשנו לרשויות",
--  "ממתינים לחומרים מהרו"ח הקודם". בתקופת הקליטה הלקוח משלם ועוד לא רואה
--  תוצרים; דף שמראה שהמשרד עובד הוא שירות בפני עצמו.
--  מה הוא לא רואה לעולם: המסלול הפנימי (הקמה, הכרת הלקוח, ביקורת, שדרוג).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.clients add column if not exists portal_token text;
create unique index if not exists clients_portal_token_idx
  on public.clients (portal_token) where portal_token is not null;

-- ── הנפקה — לרו"ח מחובר (כפתור "קישור ללקוח") ולפונקציות המייל ─────────────
create or replace function public.mint_portal_token(p_client_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_token text;
begin
  select portal_token into v_token from public.clients
    where id = p_client_id and user_id = v_uid;
  if v_token is not null then return v_token; end if;
  if not exists (select 1 from public.clients where id = p_client_id and user_id = v_uid) then
    return null;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '');
  update public.clients set portal_token = v_token
    where id = p_client_id and portal_token is null;
  select portal_token into v_token from public.clients where id = p_client_id;
  return v_token;
end;
$function$;

grant execute on function public.mint_portal_token(text) to authenticated;

-- ── הדף עצמו — נגיש בטוקן בלבד ─────────────────────────────────────────────
-- מחזיר פריטים ממויינים לדליים: action (ממתין ללקוח, עם קישור), office
-- (בטיפול המשרד), done, future (נעול שיופיע בהמשך). הקישורים העמוקים
-- מוחזרים כטוקנים/כתובות — העמוד מרכיב מהם URL באותו origin.
create or replace function public.get_client_portal(p_token text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  req      public.representation_requests%rowtype;
  s        record;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
  v_sign_token text;
  v_spouse_pending boolean := false;
  v_invite_url text;
  v_prev_open boolean := false;
  v_prev_done boolean := false;
  v_first  text;
begin
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into p from public.profiles where id = c.user_id;
  v_first := split_part(trim(coalesce(c.first_name, '')), ' ', 1);
  v_invite_url := nullif(trim(coalesce(p.settings->'paperless'->>'inviteUrl', '')), '');

  -- אישור ההצעה — נקודת הפתיחה. קיימת התקשרות = ההצעה אושרה.
  if exists (select 1 from public.engagements e where e.client_id = c.id) then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','אישור הצעת המחיר');
  end if;

  select * into req from public.representation_requests
    where linked_client_id = c.id order by created_at desc limit 1;

  for s in
    select * from public.onboarding_steps st
    where st.client_id = c.id and st.status <> 'cancelled'
    order by st.created_at
  loop
    case s.step_type

    when 'representation' then
      if req.id is null then
        continue;
      elsif req.status = 'pending_fill' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_fill','label','מילוי פרטים וייפוי כוח','sub','הפרטים שנדרשים כדי לייצג אותך מול רשויות המס · כמה דקות','actionKind','onboard','actionValue', req.onboarding_token));
      elsif req.status = 'pending_signature' then
        select x->>'signToken' into v_sign_token
          from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
          where x->>'role' = 'client' and x->>'signStatus' = 'pending' limit 1;
        select exists (
          select 1 from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
          where x->>'role' = 'spouse' and x->>'signStatus' = 'pending')
          into v_spouse_pending;
        if v_sign_token is not null then
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign','label','חתימה על ייפוי הכוח','sub','הטופס מוכן — נשארה חתימה · כדקה','actionKind','sign','actionValue', v_sign_token));
        elsif v_spouse_pending then
          v_items := v_items || jsonb_build_object('bucket','office','key','rep_sign_spouse','label','חתימת בן/בת הזוג על ייפוי הכוח','sub','קישור חתימה אישי נשלח במייל נפרד');
        end if;
      elsif req.status in ('awaiting_accountant', 'awaiting_stamp') then
        v_items := v_items || jsonb_build_object('bucket','office','key','rep_office','label','ייפוי הכוח בבדיקה ובחתימה אצלנו');
      elsif req.status = 'awaiting_authorities' then
        v_items := v_items || jsonb_build_object('bucket','office','key','rep_authorities','label','ייפוי הכוח הוגש לרשויות המס','sub','נעדכן ברגע שהייצוג יאושר');
      elsif req.status = 'active' then
        v_items := v_items || jsonb_build_object('bucket','done','key','rep_done','label','הייצוג מול רשויות המס אושר');
      end if;

    when 'paperless_invite' then
      continue;   -- הפריט ללקוח הוא החיבור; ההזמנה היא הצד שלנו

    when 'paperless_connection' then
      if coalesce(s.payload->>'paperlessStatus', '') = 'not_applicable' then
        continue;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless','label','חיבור לפייפרלס');
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'other_rep' then
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_transfer','label','העברת חשבון הפייפרלס אלינו','sub','אנחנו מושכים את החשבון מהמייצג הקודם — אין צורך בפעולה שלך');
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'self' then
        v_items := v_items || jsonb_build_object('bucket','action','key','paperless_link','label','קישור חשבון הפייפרלס למשרד','sub','בחשבון הפייפרלס שלך: הוסיפו את המשרד כמייצג');
      elsif v_invite_url is not null then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','paperless_open','label','פתיחת חשבון פייפרלס','sub','המערכת שדרכה נעבוד יחד — צילום קבלות מהטלפון · כדקה','actionKind','external','actionValue', v_invite_url));
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_soon','label','חיבור לפייפרלס','sub','נשלח לך הזמנה בהמשך');
      end if;

    when 'retainer_authorization' then
      if coalesce(s.payload->>'method', '') = 'manual_arrangement' then
        continue;   -- מוסדר מחוץ למערכת — אין מה להציג
      elsif s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','retainer','label','הרשאת התשלום החודשי הוקמה');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_build_object('bucket','future','key','retainer_future','label','הרשאת התשלום החודשי','sub','תופיע כאן אחרי חיבור הפייפרלס');
      elsif nullif(trim(coalesce(s.payload->>'authUrl', '')), '') is not null then
        v_items := v_items || jsonb_build_object('bucket','action','key','retainer_auth',
          'label','אישור הרשאת התשלום החודשי',
          'sub','הסכום שסוכם בהצעה, כהרשאה קבועה · פחות מדקה',
          'actionKind','external','actionValue', trim(s.payload->>'authUrl'));
      end if;
      -- אין authUrl ⇒ עוד לא מוכן להצגה. לא מציגים חצי-פריט.

    when 'intake_questionnaire' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','intake','label','שאלון פתיחת התיק');
      elsif s.status = 'waiting_client' and c.intake_token is not null then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','intake_fill','label','שאלון פתיחת התיק','sub','עונים רק על מה שרלוונטי · אפשר לעצור ולהמשיך','actionKind','intake','actionValue', c.intake_token));
      end if;
      -- טרם נשלח ⇒ לא מציגים: גיא שולט על העיתוי.

    when 'release_letter' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'materials_received' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'file_opening' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','files','label','פתיחת התיקים ברשויות');
      elsif s.status not in ('skipped') then
        v_items := v_items || jsonb_build_object('bucket','office','key','files_office','label','פתיחת התיקים ברשויות','sub','מע"מ, מס הכנסה וביטוח לאומי — בטיפולנו');
      end if;

    else
      continue;   -- המסלול הפנימי ושלבי הנתונים אינם עניינו של הלקוח
    end case;
  end loop;

  -- מסלול הרו"ח הקודם — פריט אחד מאוחד, לא שניים
  if v_prev_open then
    v_items := v_items || jsonb_build_object('bucket','office','key','prev_accountant','label','קבלת החומרים מרואה החשבון הקודם','sub','ביקשנו את התיק — בתהליך');
  elsif v_prev_done then
    v_items := v_items || jsonb_build_object('bucket','done','key','prev_accountant','label','החומרים מרואה החשבון הקודם התקבלו');
  end if;

  -- הספירה נגזרת מהפריטים עצמם — future אינו נספר (הוא הבטחה, לא משימה)
  select count(*) filter (where x->>'bucket' = 'done'),
         count(*) filter (where x->>'bucket' <> 'future')
    into v_done, v_total
    from jsonb_array_elements(v_items) x;

  return jsonb_build_object(
    'ok', true,
    'clientFirstName', v_first,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'done', v_done, 'total', v_total,
    'items', v_items);
end;
$function$;

grant execute on function public.get_client_portal(text) to anon, authenticated;
