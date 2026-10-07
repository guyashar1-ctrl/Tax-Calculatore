-- ═══════════════════════════════════════════════════════════════════════════
-- 228 · איש קשר ← ליד: «העבר ללידים» בכרטיס איש הקשר (07.10.2026)
--
-- המקור: גיא (07.10.2026) — «במידה וזה לא לקוח זה יישמר באנשי קשר, ואז יהיה ניתן לעשות
--   מעבר ללקוח?». ההחלטה (הדמיה מאושרת, סבב 3): הדרך ללקוח נשארת אחת — ליד ← הצעת מחיר ←
--   לקוח. איש קשר שמתברר כלקוח פוטנציאלי עובר ללידים, ומשם כמו כל ליד.
-- התיעוד: docs/MEETINGS-GOOGLE-CALENDAR.md (סבב 3).
--
-- מה נוסף: move_contact_to_lead — באותה פעולה נוצר הליד (או נמצא ליד פתוח באותו מייל)
--   ואיש הקשר יוצא מאנשי הקשר. ‼ אדם אחד = רשומה אחת: לא נשאר גם איש קשר וגם ליד.
--   · כבר לקוח (מייל של לקוח או של בן/בת הזוג) ⇒ סירוב עם הכרטיס הקיים, ואיש הקשר נשאר.
--   · לחיצה כפולה / שתי לשוניות ⇒ השנייה מחכה לנעילה ומוצאת שאיש הקשר כבר עבר — אותו ליד.
--   · התפקיד, מקום העבודה וההערות עוברים להערות הליד — לא לשם העסק (מקום העבודה של
--     יועץ פנסיוני הוא חברת הביטוח, לא העסק שלו).
--   · הפגישות שנקבעו איתו נשארות: הן מזוהות לפי מייל (meetings.guests), גם בכרטיס הליד.
--
-- ‼ שום טבלה או פונקציה קיימת לא משתנה.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.move_contact_to_lead(p_contact_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  c       public.contacts%rowtype;
  v_email text;
  v_id    text;
  v_notes text;
begin
  if v_uid is null or not public.is_authorized() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- ‼ נעילה: שתי לחיצות במקביל עוברות בתור; השנייה כבר לא מוצאת את איש הקשר.
  select * into c from public.contacts where id = p_contact_id and user_id = v_uid for update;
  if c.id is null then
    return jsonb_build_object('ok', false, 'error', 'contact_not_found');
  end if;

  v_email := lower(btrim(coalesce(c.email, '')));
  if v_email <> '' then
    select id into v_id from public.clients
     where user_id = v_uid and (lower(btrim(email)) = v_email or lower(btrim(spouse_email)) = v_email)
     limit 1;
    if v_id is not null then
      return jsonb_build_object('ok', false, 'error', 'is_client', 'clientId', v_id);
    end if;
    select id into v_id from public.leads
     where user_id = v_uid and lower(btrim(email)) = v_email
       and converted_client_id is null and status <> 'closed'
     order by created_at desc limit 1;
  end if;

  if v_id is null then
    v_notes := nullif(concat_ws(E'\n',
      nullif(concat_ws(' · ', 'הועבר מאנשי הקשר', nullif(btrim(c.role), ''), nullif(btrim(c.organization), '')), ''),
      nullif(btrim(c.notes), '')), '');
    insert into public.leads (user_id, full_name, email, phone, notes, status, source)
    values (v_uid, c.full_name, nullif(v_email, ''), nullif(btrim(c.phone), ''), v_notes, 'new', 'accountant')
    returning id into v_id;
    delete from public.contacts where id = c.id;
    return jsonb_build_object('ok', true, 'leadId', v_id, 'existing', false);
  end if;

  delete from public.contacts where id = c.id;
  return jsonb_build_object('ok', true, 'leadId', v_id, 'existing', true);
end;
$$;

revoke all on function public.move_contact_to_lead(text) from public, anon;
grant execute on function public.move_contact_to_lead(text) to authenticated;
