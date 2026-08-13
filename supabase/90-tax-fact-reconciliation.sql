-- ─── 90: תיק מס — בעלות והתאמה על עובדות מקצועיות ──────────────────────────
-- מסך תיק הלקוח, המקור החזותי המחייב:
-- docs/prototypes/client-case-simplified-exploration-v3-final2.html (לשונית "תיק מס")
--
-- ‼ הערך המקובל של כל עובדה מקצועית נשאר בדיוק איפה שהוא היום — על clients,
-- ב-141 העמודות הקיימות. הטבלה הזו לא מחליפה אותן ולא מוסיפה עמודה אחת.
-- היא מתארת רק **מעברים**: הצעה ממתינה, החלטה, והיסטוריה. שורה 'accepted'
-- היא היסטוריה; שורה 'pending' היא הפס הצהוב בתיק המס; שורה 'rejected'
-- נשמרת גם היא — "לא עכשיו" הוא החלטה שנרשמת, לא מחיקה.
--
-- ‼ עריכה ידנית של הרו"ח נכנסת לאותה טבלה בדיוק, ישר כ-'accepted' (סעיף 3
-- למטה) — כי היא כבר ההחלטה הסופית. זו הדרך היחידה שמונעת שני מקורות אמת:
-- שינוי מהשאלון שסותר ערך שנערך ידנית לעולם לא דורס אותו בשקט, הוא נופל
-- לתור הממתינים כמו כל הצעה אחרת.
--
-- ‼ new_value/old_value הם jsonb אטום מבחינת הפונקציות כאן — {display, patch}
-- כשיש patch להחלה. הפונקציות לעולם לא קוראות את התוכן, רק מעבירות אותו
-- הלאה. הכתיבה בפועל ל-clients נשארת בצד הלקוח דרך updateClient() הקיים
-- (טיפוסי, כבר בדוק, כבר יודע להמיר כל 141 השדות) — לא נבנה כאן מנוע
-- שממפה jsonb גנרי לעמודות מוקלדות; זו בדיוק ה"פלטפורמת עובדות" שהוחלט
-- שלא לבנות. הסדר הבטוח: קודם נכתב הערך האמיתי ל-clients (RLS + טיפוסים
-- קיימים), ורק אחרי הצלחה נסמן accepted — כישלון בשלב השני משאיר טיוטה
-- 'pending' תקועה (ניתנת לניסיון חוזר), לא ערך שגוי בכרטיס.
--
-- ‼ בדיוק כמו onboarding_steps: אין UPDATE ישיר על הטבלה הזו מהלקוח. שלוש
-- פונקציות security definer הן הדרך היחידה לשנות status — כל אחת בודקת
-- auth.uid() מול user_id בעצמה. RLS מרשה רק SELECT.

create table public.tax_fact_changes (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id       uuid not null references auth.users(id) on delete cascade,
  client_id     text not null references public.clients(id) on delete cascade,
  -- מפתח לוגי של העובדה — לא בהכרח שם עמודה יחיד ב-clients (למשל 'residency'
  -- נוגע גם ל-is_new_immigrant וגם ל-is_returning_resident באותו patch).
  field_key     text not null,
  label         text not null,
  old_value     jsonb,
  new_value     jsonb not null,
  source        text not null check (source in ('questionnaire', 'manual', 'institution_alignment', 'import')),
  -- הפניה חופשית למקור: session_id של הדוח השנתי, step_id של יישור קו, וכו'.
  source_ref    text,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz,
  note          text,
  created_at    timestamptz not null default now()
);

create index tax_fact_changes_client_status_idx on public.tax_fact_changes(client_id, status);
create index tax_fact_changes_user_id_idx       on public.tax_fact_changes(user_id);

-- אידמפוטנטיות: הצעה חוזרת לאותה עובדה מרעננת את השורה הממתינה הקיימת
-- במקום לערום עוד ועוד "אותו דבר" — פתיחת מסך ההתאמה פעמיים לא מכפילה כלום.
-- האינדקס חלקי (רק status='pending'), ולכן אחרי הכרעה (accepted/rejected)
-- הצעה חדשה לאותו שדה נכנסת כשורה טרייה — ההיסטוריה של ההכרעה הקודמת נשארת.
create unique index tax_fact_changes_pending_field_uidx
  on public.tax_fact_changes(client_id, field_key)
  where status = 'pending';

alter table public.tax_fact_changes enable row level security;

create policy "tax_fact_changes_select_own" on public.tax_fact_changes
  for select using (auth.uid() = user_id);

-- ── 1. הצעת שינויים — מהשאלון, מיישור קו (M2), או מייבוא ────────────────────
-- p_items: מערך jsonb של {field_key, label, old_value, new_value, note?}.
-- לעולם לא כותבת ל-clients — כל הצעה נוחתת כ-pending, בלי יוצא מן הכלל.
create or replace function public.propose_tax_facts(
  p_client_id text,
  p_source text,
  p_source_ref text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  it jsonb;
  v_count int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  select user_id into v_owner from public.clients where id = p_client_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_source not in ('questionnaire', 'institution_alignment', 'import') then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if coalesce(it->>'field_key', '') = '' then continue; end if;

    insert into public.tax_fact_changes
      (user_id, client_id, field_key, label, old_value, new_value, source, source_ref, note)
    values
      (v_uid, p_client_id, it->>'field_key', coalesce(it->>'label', it->>'field_key'),
       it->'old_value', it->'new_value', p_source, p_source_ref, it->>'note')
    on conflict (client_id, field_key) where status = 'pending'
    do update set
      new_value  = excluded.new_value,
      old_value  = excluded.old_value,
      label      = excluded.label,
      source     = excluded.source,
      source_ref = excluded.source_ref,
      note       = excluded.note,
      created_at = now();

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'proposed', v_count);
end;
$function$;

-- ── 2. אישור — הופך הצעה ממתינה ל"מה שהתקבל". לא כותבת ל-clients (ראה למעלה) ──
-- אחרי קריאה מוצלחת, הצד הקורא כותב את new_value->'patch' דרך updateClient().
create or replace function public.accept_tax_fact_change(p_change_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  r public.tax_fact_changes%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  update public.tax_fact_changes
     set status = 'accepted', decided_by = v_uid, decided_at = now()
   where id = p_change_id and user_id = v_uid and status = 'pending'
   returning * into r;

  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_pending_or_not_found');
  end if;

  return jsonb_build_object('ok', true, 'change', to_jsonb(r));
end;
$function$;

-- ── 3. דחייה — "השאר את הערך הנוכחי". הערך בכרטיס לא זז; ההצעה נשמרת כהחלטה ──
create or replace function public.reject_tax_fact_change(p_change_id text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  r public.tax_fact_changes%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  update public.tax_fact_changes
     set status = 'rejected', decided_by = v_uid, decided_at = now(),
         note = coalesce(p_note, note)
   where id = p_change_id and user_id = v_uid and status = 'pending'
   returning * into r;

  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_pending_or_not_found');
  end if;

  return jsonb_build_object('ok', true, 'change', to_jsonb(r));
end;
$function$;

-- ── 4. עריכה ידנית — הרו"ח הוא הסמכות הסופית ────────────────────────────────
-- נקראת מהלקוח *אחרי* שהערך כבר נכתב בהצלחה ל-clients דרך updateClient()
-- (ראה הערת הראש). התוצאה כאן: שורת היסטוריה 'accepted' מוכנה, כדי שמקור
-- אחר שיסתור אותה בעתיד ייפול ל-pending — ולא ידרוס אותה בשקט.
create or replace function public.record_manual_fact_change(
  p_client_id text,
  p_field_key text,
  p_label text,
  p_old_value jsonb,
  p_new_value jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_id text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  select user_id into v_owner from public.clients where id = p_client_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  insert into public.tax_fact_changes
    (user_id, client_id, field_key, label, old_value, new_value, source, status, decided_by, decided_at, note)
  values
    (v_uid, p_client_id, p_field_key, p_label, p_old_value, p_new_value, 'manual', 'accepted', v_uid, now(), p_note)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

revoke all on function public.propose_tax_facts(text, text, text, jsonb) from public, anon;
revoke all on function public.accept_tax_fact_change(text) from public, anon;
revoke all on function public.reject_tax_fact_change(text, text) from public, anon;
revoke all on function public.record_manual_fact_change(text, text, text, jsonb, jsonb, text) from public, anon;

grant execute on function public.propose_tax_facts(text, text, text, jsonb) to authenticated;
grant execute on function public.accept_tax_fact_change(text) to authenticated;
grant execute on function public.reject_tax_fact_change(text, text) to authenticated;
grant execute on function public.record_manual_fact_change(text, text, text, jsonb, jsonb, text) to authenticated;
