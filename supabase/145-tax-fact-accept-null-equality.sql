-- ─── 145: אישור עובדה מקצועית — "ריק" אחד, לא שניים ────────────────────────
-- תיקון נקודתי ל-accept_tax_fact_change מ-91-tax-fact-transactions.sql.
-- כל השאר בפונקציה זהה; רק שורת בדיקת העדכניות שונתה.
--
-- ‼ הבאג: בדיקת העדכניות משווה את תמונת המצב שנשמרה בהצעה (old_value.patch)
-- מול הערך המקובל עכשיו. שני הצדדים מייצגים "אין ערך" בשתי צורות שונות:
--   • _tax_fact_field_op מחזירה out_current = NULL של SQL, כי to_jsonb(NULL)
--     הוא NULL ולא 'null'::jsonb.
--   • old_value.patch נשמר כ-JSON, ולכן "ריק" בתוכו הוא 'null'::jsonb.
-- `NULL is distinct from 'null'::jsonb` מחזיר true, ולכן כל שדה שהיה ריק
-- בתיק נחשב "השתנה מאז ההצעה" ⇒ stale_conflict. אצל לקוח חדש כל השדות ריקים,
-- ולכן שום ערך מיישור קו מול הרשויות לא נכנס לתיק — לא באישור האוטומטי
-- שבסוף המסך, וגם לא בלחיצה ידנית על "אשר ועדכן בתיק". המנגנון שנועד למנוע
-- דריסה בשקט חסם בפועל את המסלול התקין כולו.
--
-- ‼ התיקון: מנרמלים את שני הצדדים ל-'null'::jsonb לפני ההשוואה. הבחנה בין
-- "העמודה ריקה" ל"ההצעה ראתה ריק" היא הבחנה בלי משמעות עסקית — בשני המקרים
-- לא היה ערך, ואין מה לדרוס. ההגנה האמיתית נשמרת: ערך מקובל שקיים ושונה
-- מהתמונה שבהצעה עדיין מחזיר stale_conflict.

create or replace function public.accept_tax_fact_change(p_change_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  r public.tax_fact_changes%rowtype;
  v_patch jsonb;
  v_old_patch jsonb;
  k text;
  v_current jsonb;
  v_ok boolean;
  v_stale text[] := '{}';
  v_client jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  select * into r from public.tax_fact_changes
   where id = p_change_id and user_id = v_uid and status = 'pending'
   for update;

  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_pending_or_not_found');
  end if;

  perform 1 from public.clients where id = r.client_id and user_id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
  end if;

  v_patch     := r.new_value -> 'patch';
  v_old_patch := r.old_value -> 'patch';

  -- ── בדיקת עדכניות (שמרנית) ──
  -- הערך המקובל היום מול תמונת המצב שנלקחה כשההצעה נוצרה. שונה ⇒ מישהו כבר
  -- שינה אותו בינתיים, וההצעה נשארת pending במקום לדרוס בשקט.
  -- ‼ coalesce על שני הצדדים: NULL של SQL ו-'null' של JSON הם אותו "אין ערך".
  if v_old_patch is not null then
    for k in select jsonb_object_keys(v_old_patch) loop
      select f.out_current, f.out_ok into v_current, v_ok
        from public._tax_fact_field_op(r.client_id, k, false, null, null) f;
      if v_ok and coalesce(v_current, 'null'::jsonb)
                  is distinct from coalesce(v_old_patch -> k, 'null'::jsonb) then
        v_stale := array_append(v_stale, k);
      end if;
    end loop;
  end if;

  if array_length(v_stale, 1) > 0 then
    return jsonb_build_object('ok', false, 'error', 'stale_conflict', 'staleFields', to_jsonb(v_stale));
  end if;

  -- ── כתיבה בפועל — allowlist בלבד, fail-closed על מפתח לא מוכר ──
  if v_patch is not null then
    for k in select jsonb_object_keys(v_patch) loop
      select f.out_ok into v_ok
        from public._tax_fact_field_op(r.client_id, k, true, v_patch -> k, r.source) f;
      if not v_ok then
        raise exception 'unknown_field_key: %', k;
      end if;
    end loop;
  end if;

  update public.tax_fact_changes
     set status = 'accepted', decided_by = v_uid, decided_at = now()
   where id = p_change_id;

  select * into r from public.tax_fact_changes where id = p_change_id;
  select to_jsonb(c) into v_client from public.clients c where c.id = r.client_id;

  return jsonb_build_object('ok', true, 'change', to_jsonb(r), 'client', v_client);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$;

revoke all on function public.accept_tax_fact_change(text) from public, anon;
grant execute on function public.accept_tax_fact_change(text) to authenticated;
