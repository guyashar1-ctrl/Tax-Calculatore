-- ─── 223: שם הנושא בבקשת «ייצוג בביטוח לאומי — X» נגזר מהכרטיס ────────────
-- נצפה בייצור (גיא, 6.10.2026): בדף האישי של הדסה סלע הופיעה ההודעה
-- «ייצוג בביטוח לאומי — בן/בת הזוג» במקום «— יאיר סלע». הזוג חולק תיבת מייל
-- אחת, ובלי שם יאיר יכול לחשוב שהדסה צריכה לאשר שוב.
--
-- הסיבה: השם נכתב פעם אחת ל-payload (subjectName + title) כשהשלב נוצר —
-- במילוי-לאחור של 157 (9.9), כשבכרטיס עוד לא היה שם לבן הזוג, ולכן נכתב
-- ממלא-המקום «בן/בת הזוג». השם הוזן אחר כך בכרטיס, ושום דבר לא רענן את השלב.
--
-- ‼ הכרטיס הוא מקור האמת לשם; ה-payload הוא היטל שלו, ולכן נגזר בטריגר
-- (יסודות §9: «היטל אינו מקור אמת»). התפקיד (subjectRole) לא משתנה — רק השם.
--
-- ‼ מה כן ומה לא:
--   · שלב פתוח — השם מתעדכן לפי הכרטיס.
--   · שלב שהושלם — היסטוריה: לא משוכתב. רק ממלא-מקום (ריק / «בן/בת הזוג»)
--     מוחלף בשם האמיתי — זה לא שכתוב, זה מילוי של מה שלא היה ידוע.
--   · הכותרת מוחלפת רק כשהיא הכותרת שנוצרה אוטומטית («ייצוג בביטוח לאומי — »
--     + השם הקודם). כותרת שמישהו ערך ביד — נשארת.
--   · שלב מבוטל — לא נוגעים.
--
-- ‼ שינוי הכותרת מעלה את client_content_version (טריגר קיים) — הלקוח רואה
-- טקסט אחר, ולכן זה נכון. שום מייל לא יוצא מזה.

-- ── 1 · הרענון ──────────────────────────────────────────────────────────────
create or replace function public.refresh_authority_rep_subject_names(p_client_id text)
returns int
language plpgsql
security definer
set search_path = public
as $function$
declare
  c        public.clients;
  v_linked public.clients;
  s        record;
  v_name   text;
  v_old    text;
  v_prefix constant text := 'ייצוג בביטוח לאומי — ';
  v_n      int := 0;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return 0; end if;

  for s in
    select id, status, payload from public.onboarding_steps
     where client_id = p_client_id and step_type = 'authority_representation'
       and status not in ('cancelled','skipped')
  loop
    if s.payload->>'subjectRole' = 'spouse' then
      v_name := coalesce(
        nullif(trim(coalesce(c.spouse_first_name,'') || ' ' || coalesce(c.spouse_last_name,'')), ''),
        nullif(trim(coalesce(c.spouse_name,'')), ''));
      if v_name is null and c.spouse_client_id is not null then
        select * into v_linked from public.clients where id = c.spouse_client_id;
        v_name := nullif(trim(coalesce(v_linked.first_name,'') || ' ' || coalesce(v_linked.last_name,'')), '');
      end if;
    else
      v_name := nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '');
    end if;

    v_old := coalesce(s.payload->>'subjectName', '');
    continue when v_name is null or v_name = v_old;
    continue when s.status in ('completed','verified') and v_old not in ('', 'בן/בת הזוג');

    update public.onboarding_steps
       set payload = payload
                     || jsonb_build_object('subjectName', v_name)
                     || case when coalesce(payload->>'title','') in ('', v_prefix || v_old, rtrim(v_prefix))
                             then jsonb_build_object('title', v_prefix || v_name)
                             else '{}'::jsonb end
     where id = s.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

revoke all on function public.refresh_authority_rep_subject_names(text) from public, anon, authenticated;

-- ── 2 · הטריגר — שינוי שם בכרטיס ──────────────────────────────────────────
create or replace function public.tg_refresh_authority_rep_subject_names()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.refresh_authority_rep_subject_names(new.id);
  -- בן/בת זוג עם כרטיס משלו: השם שלו הוא השם של הנושא בכרטיס של בן/בת הזוג
  perform public.refresh_authority_rep_subject_names(o.id)
     from public.clients o where o.spouse_client_id = new.id and o.id <> new.id;
  return new;
end;
$function$;

revoke all on function public.tg_refresh_authority_rep_subject_names() from public, anon, authenticated;

drop trigger if exists z_authority_rep_subject_names on public.clients;
create trigger z_authority_rep_subject_names
  after update of first_name, last_name, spouse_first_name, spouse_last_name, spouse_name, spouse_client_id
  on public.clients
  for each row
  when (old.first_name        is distinct from new.first_name
     or old.last_name         is distinct from new.last_name
     or old.spouse_first_name is distinct from new.spouse_first_name
     or old.spouse_last_name  is distinct from new.spouse_last_name
     or old.spouse_name       is distinct from new.spouse_name
     or old.spouse_client_id  is distinct from new.spouse_client_id)
  execute function public.tg_refresh_authority_rep_subject_names();

-- ── 3 · תיקון לאחור — כל לקוח שיש לו שלב כזה ──────────────────────────────
-- (בייצור ב-6.10.2026: שורה אחת — «בן/בת הזוג» של הדסה סלע ⇐ «יאיר סלע».)
select public.refresh_authority_rep_subject_names(x.client_id)
  from (select distinct client_id from public.onboarding_steps
         where step_type = 'authority_representation') x;
