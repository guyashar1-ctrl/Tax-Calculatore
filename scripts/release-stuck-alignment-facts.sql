-- ─── שחרור חד-פעמי של הצעות יישור קו שנתקעו בגלל הבאג של 145 ────────────────
-- ‼ זה סקריפט נתונים, לא מיגרציה. מריצים אותו פעם אחת, אחרי ש-145 הוחלה.
--
-- מה הוא עושה, לכל הצעה pending ממקור institution_alignment:
--   • יש הצעה מאוחרת יותר לאותו לקוח+שדה ⇒ הישנה נדחית ככפילות.
--   • הערך המקובל תואם לתמונת המצב שבהצעה ⇒ מוחל על הלקוח ומסומן accepted.
--   • הערך המקובל שונה באמת ⇒ נשאר pending. זה בדיוק המקרה שהמנגנון נועד לו,
--     והוא מוצג לרו"ח ככרטיס "ממתין לאישורך".
--
-- ‼ לא מוחקים שום שורה. tax_fact_changes הוא יומן — רק הסטטוס משתנה,
-- ולכל שורה נרשמת הערה שמסבירה למה.
--
-- הרצה: דרך ה-Management API (אין Docker/psql במחשב). בתוך טרנזקציה אחת.

begin;

-- ① כפילויות: הצעה ישנה יותר לאותו לקוח+שדה נדחית לטובת המאוחרת
with ranked as (
  select id, row_number() over (partition by client_id, field_key
                                order by created_at desc, id desc) as rn
  from public.tax_fact_changes
  where status = 'pending' and source = 'institution_alignment'
)
update public.tax_fact_changes t
   set status = 'rejected',
       decided_at = now(),
       decided_by = t.user_id,
       note = 'הוחלף בריצה מאוחרת יותר של יישור קו - שוחרר בתיקון 145'
  from ranked r
 where t.id = r.id and r.rn > 1;

-- ② ההצעה העדכנית לכל שדה: מוחלת אם הערך המקובל לא זז מאז שנוצרה
do $do$
declare
  r record;
  k text;
  v_ok boolean;
  v_current jsonb;
  v_stale boolean;
  v_applied int := 0;
  v_kept int := 0;
begin
  for r in
    select * from public.tax_fact_changes
     where status = 'pending' and source = 'institution_alignment'
     order by created_at
  loop
    v_stale := false;

    -- בדיקת עדכניות — בדיוק כמו ב-145, כולל נרמול "ריק" בשני הצדדים
    if r.old_value -> 'patch' is not null then
      for k in select jsonb_object_keys(r.old_value -> 'patch') loop
        select f.out_current, f.out_ok into v_current, v_ok
          from public._tax_fact_field_op(r.client_id, k, false, null, null) f;
        if v_ok and coalesce(v_current, 'null'::jsonb)
                    is distinct from coalesce(r.old_value -> 'patch' -> k, 'null'::jsonb) then
          v_stale := true;
        end if;
      end loop;
    end if;

    if v_stale then
      v_kept := v_kept + 1;
      continue;  -- קונפליקט אמיתי — נשאר ממתין להכרעת הרו"ח
    end if;

    if r.new_value -> 'patch' is not null then
      for k in select jsonb_object_keys(r.new_value -> 'patch') loop
        select f.out_ok into v_ok
          from public._tax_fact_field_op(r.client_id, k, true,
                                         r.new_value -> 'patch' -> k, r.source) f;
        if not v_ok then
          raise exception 'unknown_field_key: % (change %)', k, r.id;
        end if;
      end loop;
    end if;

    update public.tax_fact_changes
       set status = 'accepted',
           decided_at = now(),
           decided_by = user_id,
           note = 'שוחרר בתיקון 145 - האישור נחסם בטעות כשהשדה בתיק היה ריק'
     where id = r.id;
    v_applied := v_applied + 1;
  end loop;

  raise notice 'שוחררו: %, נשארו ממתינים (קונפליקט אמיתי): %', v_applied, v_kept;
end
$do$;

commit;
