-- ═══════════════════════════════════════════════════════════════════════════
--  162 — P0-C · «סיים יישור»: הצלחה רק אם באמת נכתב
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ מה נמצא: propose_tax_facts מחזירה {ok, proposed} — ספירה בלבד, בלי
--  מזהי השורות שיצרה. שני הקוראים שמנסים להציע-ולאשר-מיד כתובים כך:
--
--      const propose = await proposeTaxFacts(...);
--      if (!propose.ok || !propose.change?.id) return ...;   ← תמיד יוצא כאן
--      const accept  = await acceptTaxFactChange(propose.change.id);
--
--  `propose.change` לעולם אינו מוגדר, ולכן שורת האישור **מעולם לא רצה**.
--  התוצאה: «סיים יישור» מסמן את השלב כהושלם ומדווח הצלחה, העובדות נערמות
--  כ-pending ואף אחת מהן לא נכתבת לתיק הלקוח. בקליטת השאלון זה חמור עוד
--  יותר: facts_synced_at נכתב בכל מקרה, ולכן הסשן נחשב "נקלט" ולא ייקלט שוב.
--
--  ‼ למה זה לא נתפס: הבדיקות הקיימות שולפות את המזהה מהטבלה ולא מהערך
--  המוחזר, ולכן הן עוברות בדיוק על המסלול שהממשק אינו הולך בו.
--
--  ── התיקון ────────────────────────────────────────────────────────────────
--  ① propose_tax_facts מחזירה מעכשיו גם את השורות שיצרה (changes[] + change
--     כשיש פריט אחד). זה סוגר את פער החוזה עצמו.
--  ② apply_tax_facts — פונקציה אחת שמציעה ומחילה באותה טרנזקציה, עם גבול
--     הצלחה אחד ותוצאה מפורשת לכל פריט. זה מה ש«סיים יישור» וקליטת השאלון
--     קוראים מעכשיו, במקום שתי קריאות רשת שאפשר להיתקע ביניהן.
--
--  ‼ שלוש תוצאות אפשריות לפריט, וכולן מפורשות:
--     applied         — הערך נכתב לתיק. השורה נרשמת כ-accepted.
--     already_applied — הערך בתיק כבר זהה למבוקש. אין כתיבה, אין שורה חדשה.
--                       ‼ זה מה שהופך ניסיון חוזר לבטוח: בלי הענף הזה, ריצה
--                       שנייה הייתה מסמנת את עצמה כ"סתירה" רק מפני שהערך
--                       שהיא עצמה כתבה כבר נמצא שם.
--     pending_conflict— הערך בתיק השתנה מאז שהמסך נטען. לא נדרס. נשאר
--                       ממתין להכרעת הרו"ח. זה המקרה שהמנגנון נועד לו.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① החוזה של propose_tax_facts: מחזירה את מה שיצרה ───────────────────────
create or replace function public.propose_tax_facts(
  p_client_id text, p_source text, p_source_ref text, p_items jsonb
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
  v_id text;
  v_rows jsonb := '[]'::jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  select user_id into v_owner from public.clients where id = p_client_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_source not in ('questionnaire', 'institution_alignment', 'import', 'automation') then
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
      created_at = now()
    returning id into v_id;

    -- ‼ זה מה שחסר היה. בלי המזהה, כל קורא שמנסה להציע-ולאשר תקוע.
    v_rows := v_rows || jsonb_build_object('id', v_id, 'fieldKey', it->>'field_key');
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'proposed', v_count,
    'changes', v_rows,
    -- נוחות לקורא של פריט בודד, שזה הרוב המכריע של הקריאות.
    'change', case when jsonb_array_length(v_rows) = 1 then v_rows->0 end
  );
end;
$function$;

-- ── ② החלה אטומית: הצעה + כתיבה בקריאה אחת ─────────────────────────────────
create or replace function public.apply_tax_facts(
  p_client_id text, p_source text, p_source_ref text, p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_owner   uuid;
  it        jsonb;
  k         text;
  v_current jsonb;
  v_ok      boolean;
  v_stale   boolean;
  v_same    boolean;
  v_id      text;
  v_results jsonb := '[]'::jsonb;
  v_applied int := 0;
  v_pending int := 0;
  v_client  jsonb;
  v_new     jsonb;
  v_old     jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  -- ‼ בעלות: אותה בדיקה בדיוק כמו ב-propose. משתמש מחובר אינו רשאי לגעת
  -- בתיק של מישהו אחר, גם אם הוא יודע את המזהה.
  select user_id into v_owner from public.clients where id = p_client_id for update;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_source not in ('questionnaire', 'institution_alignment', 'import', 'automation') then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    if coalesce(it->>'field_key', '') = '' then continue; end if;
    v_new := it->'new_value'->'patch';
    v_old := it->'old_value'->'patch';

    -- ── כבר מוחל? אין מה לעשות, וזה לא כישלון ולא סתירה ──────────────────
    v_same := v_new is not null;
    if v_same then
      for k in select jsonb_object_keys(v_new) loop
        select f.out_current, f.out_ok into v_current, v_ok
          from public._tax_fact_field_op(p_client_id, k, false, null, null) f;
        if not v_ok or coalesce(v_current, 'null'::jsonb)
                       is distinct from coalesce(v_new -> k, 'null'::jsonb) then
          v_same := false;
        end if;
      end loop;
    end if;

    if v_same then
      v_results := v_results || jsonb_build_object(
        'fieldKey', it->>'field_key', 'outcome', 'already_applied');
      continue;
    end if;

    -- ── עדכניות: האם הערך בתיק זז מאז שהמסך נטען? ────────────────────────
    v_stale := false;
    if v_old is not null then
      for k in select jsonb_object_keys(v_old) loop
        select f.out_current, f.out_ok into v_current, v_ok
          from public._tax_fact_field_op(p_client_id, k, false, null, null) f;
        if v_ok and coalesce(v_current, 'null'::jsonb)
                    is distinct from coalesce(v_old -> k, 'null'::jsonb) then
          v_stale := true;
        end if;
      end loop;
    end if;

    -- השורה נרשמת בכל מקרה — tax_fact_changes הוא יומן.
    insert into public.tax_fact_changes
      (user_id, client_id, field_key, label, old_value, new_value, source, source_ref, note)
    values
      (v_uid, p_client_id, it->>'field_key', coalesce(it->>'label', it->>'field_key'),
       it->'old_value', it->'new_value', p_source, p_source_ref, it->>'note')
    on conflict (client_id, field_key) where status = 'pending'
    do update set
      new_value = excluded.new_value, old_value = excluded.old_value,
      label = excluded.label, source = excluded.source,
      source_ref = excluded.source_ref, note = excluded.note, created_at = now()
    returning id into v_id;

    if v_stale then
      v_pending := v_pending + 1;
      v_results := v_results || jsonb_build_object(
        'fieldKey', it->>'field_key', 'outcome', 'pending_conflict', 'changeId', v_id);
      continue;
    end if;

    -- ── הכתיבה עצמה. מפתח לא מוכר = חריגה, לא "הצלחה חלקית". ─────────────
    if v_new is not null then
      for k in select jsonb_object_keys(v_new) loop
        select f.out_ok into v_ok
          from public._tax_fact_field_op(p_client_id, k, true, v_new -> k, p_source) f;
        if not v_ok then
          raise exception 'unknown_field_key: %', k using errcode = 'data_exception';
        end if;
      end loop;
    end if;

    update public.tax_fact_changes
       set status = 'accepted', decided_by = v_uid, decided_at = now()
     where id = v_id;

    v_applied := v_applied + 1;
    v_results := v_results || jsonb_build_object(
      'fieldKey', it->>'field_key', 'outcome', 'applied', 'changeId', v_id);
  end loop;

  select to_jsonb(c) into v_client from public.clients c where c.id = p_client_id;

  return jsonb_build_object(
    'ok', true, 'applied', v_applied, 'pending', v_pending,
    'results', v_results, 'client', v_client);
end;
$function$;

comment on function public.apply_tax_facts(text, text, text, jsonb) is
  'מציעה ומחילה עובדות מס בטרנזקציה אחת, עם תוצאה מפורשת לכל פריט (applied / already_applied / pending_conflict). מחליפה את הצמד propose+accept משני צדי הרשת, שבו האישור מעולם לא רץ — ראה מיגרציה 162. אידמפוטנטית: ערך שכבר מוחל מדווח already_applied ואינו נחשב סתירה.';

-- ‼ שתיהן למשתמש מחובר בלבד. אין להן שום מסלול ציבורי, ובדיקת הבעלות
-- שבתוכן היא השכבה השנייה מעל ההרשאה הזו.
revoke execute on function public.apply_tax_facts(text, text, text, jsonb) from public, anon;
revoke execute on function public.propose_tax_facts(text, text, text, jsonb) from public, anon;
grant execute on function public.apply_tax_facts(text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.propose_tax_facts(text, text, text, jsonb) to authenticated, service_role;
