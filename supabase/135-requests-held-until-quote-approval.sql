-- 135 — בקשה שנולדת לפני אישור ההצעה היא הכנה, לא פרסום
--
-- הכרעת גיא 2026-08-25: "כל עוד ההצעה לא אושרה, אנחנו מכינים את מסע הקליטה.
-- ברגע שהלקוח מאשר, ההתקשרות נוצרת והבקשות מתפרסמות ומשויכות אליה."
--
-- מה היה קודם: create_onboarding_request נולדה עם p_published ברירת מחדל true
-- כשאין התקשרות (processPublished=false במסך ⇒ `p_published: true`), ולכן בקשה
-- שהרו"ח הכין ללקוח שקיבל הצעה ועוד לא אישר אותה הופיעה מיד בדף האישי שלו.
-- בפועל זה אומר שביקשנו מאדם להקים הרשאה לחיוב חשבון בבנק לפני שהסכים למחיר.
--
-- ‼ הגבול נגזר מ-derive_lifecycle_stage ולא מ"אין התקשרות" ולא מ"אין הצעה
--   מאושרת". רוב הלקוחות במסד הם בלי הצעה ובלי התקשרות בכלל (נוצרו ידנית),
--   והם 'active'/'onboarding' — שני הניסוחים האחרים היו מסתירים בשקט כל בקשה
--   שלהם. רק 'lead' ו-'quoted' הם "עוד לא נמכר".
--
-- ‼ השחרור תלוי באישור ההצעה ולא ביצירת ההתקשרות: הצעה מסוג one_time מאושרת
--   בלי שנוצרת התקשרות בכלל (create_engagement_for_quotation יוצאת מוקדם),
--   וגם הקריאה להתקשרות בתוך approve_quotation עטופה ב-exception שבולע. אילו
--   הפרסום היה תלוי בהן, הבקשות היו נתקעות מוסתרות לנצח.
--
-- ‼ הסימון heldUntilApproval הוא מה שמבדיל בין "בקשה שהרו"ח הכין לפני האישור"
--   לבין טיוטה רגילה. בלי סימון מפורש, שחרור באישור היה מפרסם גם את השלבים
--   שהמחולל יוצר באותו רגע — והם אמורים להישאר טיוטה עד "עדכן את דף הלקוח".

-- ─────────────── 1. הבקשה נולדת מוחזקת כשעוד לא נמכר כלום ────────────────
do $mig$
declare
  v_src text := pg_get_functiondef('public.create_onboarding_request(text,text,jsonb,date,text,boolean,boolean,text,text)'::regprocedure);
  v_new text;
begin
  if v_src like '%heldUntilApproval%' then
    raise notice '135: create_onboarding_request כבר מחזיקה - מדלגים';
    return;
  end if;

  v_new := replace(v_src,
    '  v_payload jsonb;',
    '  v_payload jsonb;' || E'\n' ||
    '  v_hold boolean := false;');
  if v_new = v_src then raise exception '135: עוגן ההצהרה לא נמצא ב-create_onboarding_request'; end if;
  v_src := v_new;

  v_new := replace(v_src,
    '  v_payload := coalesce(p_payload, ''{}''::jsonb)' || E'\n' ||
    '    || case when p_published then ''{}''::jsonb else jsonb_build_object(''published'', false) end;',
    '  -- 135: לפני שנמכר משהו, "הוספתי בקשה" פירושו הכנה ולא שליחה.' || E'\n' ||
    '  if p_published and public.derive_lifecycle_stage(c.id) in (''lead'', ''quoted'') then' || E'\n' ||
    '    p_published := false;' || E'\n' ||
    '    v_hold := true;' || E'\n' ||
    '  end if;' || E'\n' || E'\n' ||
    '  v_payload := coalesce(p_payload, ''{}''::jsonb)' || E'\n' ||
    '    || case when p_published then ''{}''::jsonb else jsonb_build_object(''published'', false) end' || E'\n' ||
    '    || case when v_hold then jsonb_build_object(''heldUntilApproval'', true) else ''{}''::jsonb end;');
  if v_new = v_src then raise exception '135: עוגן ה-payload לא נמצא ב-create_onboarding_request'; end if;
  v_src := v_new;

  v_new := replace(v_src,
    '    case when p_published then ''נוספה בקשה'' else ''נוספה בקשה כטיוטה'' end,',
    '    case when p_published then ''נוספה בקשה''' || E'\n' ||
    '         when v_hold then ''נוספה בקשה - תפורסם כשההצעה תאושר''' || E'\n' ||
    '         else ''נוספה בקשה כטיוטה'' end,');
  if v_new = v_src then raise exception '135: עוגן היומן לא נמצא ב-create_onboarding_request'; end if;
  v_src := v_new;

  v_new := replace(v_src,
    '  return jsonb_build_object(''ok'', true, ''stepId'', v_id, ''status'', v_status,' || E'\n' ||
    '                            ''revived'', v_old is not null);',
    '  return jsonb_build_object(''ok'', true, ''stepId'', v_id, ''status'', v_status,' || E'\n' ||
    '                            ''heldUntilApproval'', v_hold,' || E'\n' ||
    '                            ''revived'', v_old is not null);');
  if v_new = v_src then raise exception '135: עוגן הערך המוחזר לא נמצא ב-create_onboarding_request'; end if;

  execute v_new;
end;
$mig$;

-- ─────────────── 2. "עדכן את דף הלקוח" חסום כל עוד לא אושרה הצעה ──────────
-- בלי זה ההחזקה היא הצעה בלבד: לחיצה אחת על הפס הצהוב הייתה חושפת את הכול.
do $mig$
declare
  v_src text := pg_get_functiondef('public.publish_case_changes(text)'::regprocedure);
  v_new text;
begin
  if v_src like '%quotation_not_approved%' then
    raise notice '135: publish_case_changes כבר חסומה - מדלגים';
    return;
  end if;

  v_new := replace(v_src,
    '  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object(''ok'', false, ''error'', ''forbidden''); end if;',
    '  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object(''ok'', false, ''error'', ''forbidden''); end if;' || E'\n' || E'\n' ||
    '  -- 135: עוד לא נמכר כלום - הבקשות מוכנות ומחכות לאישור ההצעה, לא לכפתור.' || E'\n' ||
    '  if public.derive_lifecycle_stage(c.id) in (''lead'', ''quoted'') then' || E'\n' ||
    '    return jsonb_build_object(''ok'', false, ''error'', ''quotation_not_approved'');' || E'\n' ||
    '  end if;');
  if v_new = v_src then raise exception '135: עוגן ההרשאה לא נמצא ב-publish_case_changes'; end if;

  execute v_new;
end;
$mig$;

-- ─────────────── 3. השחרור: פרסום הבקשות המוחזקות + שיוך להתקשרות ─────────
create or replace function public.release_requests_held_until_approval(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c         public.clients%rowtype;
  v_eng     text;
  s         record;
  v_pub     int := 0;
  v_adopted int := 0;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  v_eng := public.current_engagement_id(p_client_id);

  -- שיוך בקשות יתומות (נוצרו כשעוד לא הייתה התקשרות). בלי זה
  -- onboarding_close_readiness, שסופרת לפי engagement_id, פשוט לא רואה אותן.
  if v_eng is not null then
    update public.onboarding_steps
       set engagement_id = v_eng
     where client_id = p_client_id
       and engagement_id is null
       and status <> 'cancelled';
    get diagnostics v_adopted = row_count;
  end if;

  -- ‼ רק המסומנות. שלב שהמחולל יצר לפני רגע הוא טיוטה שממתינה להחלטת הרו"ח,
  -- ואסור שאישור הלקוח יפרסם אותה בשמו.
  for s in
    select * from public.onboarding_steps
     where client_id = p_client_id
       and status <> 'cancelled'
       and published_at is null
       and coalesce((payload->>'heldUntilApproval')::boolean, false)
  loop
    update public.onboarding_steps
       set published_at = now(),
           payload = payload - 'published' - 'heldUntilApproval'
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, coalesce(s.engagement_id, v_eng),
      'status_changed', 'system',
      'הבקשה נפתחה ללקוח עם אישור ההצעה',
      jsonb_build_object('published', true, 'heldUntilApproval', true));
    v_pub := v_pub + 1;
  end loop;

  return jsonb_build_object('ok', true, 'published', v_pub, 'adopted', v_adopted);
end;
$function$;

-- ─────────────── 4. הקריאה מתוך אישור ההצעה ──────────────────────────────
-- ‼ עטוף ב-exception כמו הקריאה להתקשרות שמעליו: אישור הצעה הוא המסלול של
--   הלקוח, ואסור שכשל בפרסום ייכשל אותו. יש מסלול התאוששות ידני - אחרי
--   האישור החסימה על "עדכן את דף הלקוח" ממילא מוסרת.
do $mig$
declare
  v_src text := pg_get_functiondef('public.approve_quotation(text,text,text)'::regprocedure);
  v_new text;
begin
  if v_src like '%release_requests_held_until_approval%' then
    raise notice '135: approve_quotation כבר משחררת - מדלגים';
    return;
  end if;

  v_new := replace(v_src,
    '  begin' || E'\n' ||
    '    perform public.create_engagement_for_quotation(q.id, false);' || E'\n' ||
    '  exception when others then' || E'\n' ||
    '    null;' || E'\n' ||
    '  end;',
    '  begin' || E'\n' ||
    '    perform public.create_engagement_for_quotation(q.id, false);' || E'\n' ||
    '  exception when others then' || E'\n' ||
    '    null;' || E'\n' ||
    '  end;' || E'\n' || E'\n' ||
    '  begin' || E'\n' ||
    '    perform public.release_requests_held_until_approval(q.client_id);' || E'\n' ||
    '  exception when others then' || E'\n' ||
    '    null;' || E'\n' ||
    '  end;');
  if v_new = v_src then raise exception '135: עוגן ההתקשרות לא נמצא ב-approve_quotation'; end if;

  execute v_new;
end;
$mig$;

-- ─────────────── 5. שיוך יתומים גם כשההתקשרות נולדת בדרך אחרת ─────────────
-- הרחבה של הדפוס שכבר קיים כאן ל-representation (engagements_adopt_rep_step).
-- ‼ רק 'onboarding': התקשרות 'scheduled' היא חידוש ללקוח שכבר יש לו התקשרות
--   פעילה, ואסור שהיא תגנוב אליה את הבקשות של הקודמת.
create or replace function public.adopt_orphan_steps_to_engagement()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.onboarding_steps
     set engagement_id = new.id
   where client_id = new.client_id
     and engagement_id is null
     and status <> 'cancelled';
  return new;
end;
$function$;

drop trigger if exists engagements_adopt_orphan_steps on public.engagements;
create trigger engagements_adopt_orphan_steps
  after insert on public.engagements
  for each row when (new.status = 'onboarding')
  execute function public.adopt_orphan_steps_to_engagement();
