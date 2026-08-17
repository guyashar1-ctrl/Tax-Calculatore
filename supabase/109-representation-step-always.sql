-- ─── 109: בקשת ייצוג שנשלחה מופיעה גם ברשימת הבקשות של הרו"ח ────────────────
-- הבעיה שגיא דיווח עליה: שלח בקשת ייצוג ל"שבע עשרה", הלקוחה רואה בדף שלה
-- "מילוי פרטים וייפוי כוח" — ובכרטיס הלקוח כתוב "אין בקשות פתוחות כרגע".
--
-- ‼ הסיבה: שני משטחים, שני מקורות. דף הלקוח (build_client_portal) קורא ישירות
-- מ-representation_requests, ולכן הבקשה מופיעה בו תמיד. משטח הבקשות בכרטיס
-- מוצג מ-onboarding_steps — והשלב 'representation' נוצר רק במסלול ההצעה
-- (generate_onboarding_steps, שרץ כשהצעה מאושרת ונפתחת התקשרות). ייצוג שנפתח
-- ישירות ("התחלת ייצוג ללא הצעה", "+ בקשת ייצוג") לא יצר שלב מעולם.
-- בייצור: 10 מתוך 12 בקשות ייצוג בלי שלב.
--
-- ‼ אין כאן מצב חדש ואין שכפול אמת. הבקשה נשארת המקור היחיד למצב הייצוג —
-- sync_representation_step ממשיכה לדחוף אליו כל שינוי מצב, בדיוק כמו היום.
-- מה שנוסף כאן הוא רק **קיום** השלב, כדי שלייצוג יהיה מקום על משטח הבקשות.

-- ── יצירת שלב הייצוג ללקוח שיש לו בקשה ─────────────────────────────────────
-- אידמפוטנטית: קיים שלב פתוח ⇒ מחזירה אותו ולא נוגעת. אין בקשה ⇒ null.
create or replace function public.ensure_representation_step(p_client_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  r        public.representation_requests%rowtype;
  v_id     text;
  v_status text;
  v_ball   text;
  v_eng    text;
  v_sort   int;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;

  select * into r from public.representation_requests
    where linked_client_id = p_client_id
    order by created_at desc limit 1;
  if r.id is null then return null; end if;

  select id into v_id from public.onboarding_steps
    where client_id = p_client_id and step_type = 'representation'
      and status <> 'cancelled' limit 1;
  if v_id is not null then return v_id; end if;

  -- אותה מפה בדיוק כמו ב-sync_representation_step. שינוי כאן מחייב שינוי שם.
  case r.status
    when 'pending_fill'         then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_accountant'  then v_status := 'in_progress';    v_ball := 'me';
    when 'pending_signature'    then v_status := 'waiting_client'; v_ball := 'client';
    when 'awaiting_stamp'       then v_status := 'in_progress';    v_ball := 'me';
    when 'awaiting_authorities' then v_status := 'in_progress';    v_ball := 'authority';
    when 'active'               then v_status := 'completed';      v_ball := 'me';
    else v_status := 'in_progress'; v_ball := 'me';
  end case;

  select id into v_eng from public.engagements
    where client_id = p_client_id order by created_at desc limit 1;

  -- ‼ ראשון ברשימה: הייצוג הוא שער הכניסה, וכל שאר הבקשות באות אחריו —
  -- גם בכרטיס וגם בדף הלקוח (שם הפריט היה נופל אחרון, כי לא היה לו שלב).
  select coalesce(min(sort_order), 1) - 1 into v_sort
    from public.onboarding_steps
    where client_id = p_client_id and status <> 'cancelled';

  -- published_at = now(): הבקשה כבר יצאה ללקוח, ולכן היא אינה טיוטה. בלי זה
  -- הכרטיס היה מציג "שינוי אחד שלא פורסם" על משהו שהלקוח כבר ראה.
  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, completion_method, completed_at, published_at)
  values
    (c.user_id, v_eng, p_client_id, true, 'representation', 'authorities', 'person',
     v_status, v_ball, v_sort, 'auto',
     case when v_status = 'completed' then coalesce(r.updated_at, now()) end,
     now())
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.ensure_representation_step(text) from public, anon, authenticated;

-- ── הבקשה נולדת ⇒ השלב נולד איתה ───────────────────────────────────────────
-- גם on insert (המסלול הישיר) וגם כשבקשה קיימת נקשרת ללקוח בדיעבד.
create or replace function public.ensure_representation_step_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.linked_client_id is not null then
    perform public.ensure_representation_step(new.linked_client_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists rep_requests_ensure_step on public.representation_requests;
create trigger rep_requests_ensure_step
  after insert or update of linked_client_id on public.representation_requests
  for each row execute function public.ensure_representation_step_trg();

-- ── התקשרות שנפתחה מאמצת שלב ייצוג יתום ────────────────────────────────────
-- ‼ במסלול ההצעה, הבקשה נוצרת (open_quotation_representation) לפני ההתקשרות,
-- ולכן הטריגר שלמעלה כבר יצר את השלב — בלי engagement_id. בלי האימוץ הזה
-- שער הסגירה (onboarding_close_readiness, שסופר לפי engagement_id) היה מפסיק
-- לספור את הייצוג, וזו הרעה לעומת היום.
create or replace function public.adopt_representation_step_to_engagement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.onboarding_steps
     set engagement_id = new.id
   where client_id = new.client_id
     and step_type = 'representation'
     and engagement_id is null
     and status <> 'cancelled';
  return new;
end;
$function$;

drop trigger if exists engagements_adopt_rep_step on public.engagements;
create trigger engagements_adopt_rep_step
  after insert on public.engagements
  for each row execute function public.adopt_representation_step_to_engagement();

-- ── השלמה למפרע ────────────────────────────────────────────────────────────
-- כל לקוח שיש לו בקשת ייצוג ואין לו שלב. אידמפוטנטי — אפשר להריץ שוב.
do $$
declare r record;
begin
  for r in
    select distinct linked_client_id as cid
      from public.representation_requests
     where linked_client_id is not null
  loop
    perform public.ensure_representation_step(r.cid);
  end loop;
end $$;
