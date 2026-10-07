-- ─── 224: אישור ייפוי הכוח בביטוח הלאומי — פעולה של אדם, לא «הודעה מהמשרד» ────
-- גיא, 7.10.2026, על הדף של הדסה סלע: «מהתמונה לא ברור שיאיר צריך לעשות את
-- הפעולה הזאת». הזוג חולק את הדף ואת תיבת המייל. הפריט ישב תחת «הודעה מהמשרד»
-- (מילה שנקראת כ«לידיעה» ומדולגת), בלי לומר של מי האישור, ובלי לומר שהאישור
-- של הדסה כבר התקבל — ולכן יאיר יכול לחשוב שהדסה צריכה לאשר שוב.
--
-- מה משתנה בפריט של שלב authority_representation במצב waiting_client
-- (ההוראות נמסרו, ממתינים לאישור האדם בב"ל):
--   · bucket 'action', kind 'ni_approval' — במקום office/message.
--   · בעל הדף ⇒ «מה צריך ממך». בן/בת הזוג ⇒ forPerson = השם הפרטי, והדף מציג
--     קטע משלו «מה צריך מ{שם}» — לא נספר ב«ממתין לך» ולא נבלע בקבוצת הייצוג.
--   · assurance — אם השלב של השני כבר הושלם (ראיה מ-sync, לא ניחוש): «האישור של
--     הדסה כבר התקבל. האישור הזה הוא של יאיר, במספר נפרד.»; אם השני עוד בתהליך:
--     «לכל אחד מבני הזוג מספר אסמכתא נפרד ואישור נפרד.»
--   · refs — «מספר האסמכתא של יאיר» / «שלך», ו«לאשר עד».
--   · noteAfter — איך מאשרים, בשם האדם (ת״ז וכרטיס אשראי של יאיר), בלי
--     «אם ההודעה לא הגיעה - אפשר להעביר את ההוראות» שבלבל.
-- ‼ ניסוח בלי מין דקדוקי («של יאיר», «שלך») — בכרטיס אין מין לבן/בת הזוג.
-- ‼ הטלפון עטוף ב-LRI…PDI עם מקף שאינו נשבר: בלי זה, בשורה צרה בטלפון,
--   «02-» נשאר בסוף שורה והנקודה קפצה לצד השני.
-- ‼ עדיין אין פקד שסוגר — ההשלמה נגזרת מהבדיקה מול ב"ל (157), לא מהצהרה.
--
-- עוגן: הענף מ-157 (זהה תו-בתו ב-staging ובייצור, נבדק 7.10). עוגני שורה בודדת
-- — בלי תלות בסוף שורה של הקובץ (CRLF/LF).

do $do$
declare
  v_def   text;
  v_new   text;
  v_a     int;
  v_s     int;
  v_e     int;
  v_start constant text := $m$elsif s.status = 'waiting_client' then$m$;
  v_end   constant text := $m$'linkLabel', 'לאתר הביטוח הלאומי'));$m$;
  v_branch constant text := $branch$elsif s.status = 'waiting_client' then
        -- ‼ 224 · אישור ייפוי הכוח בב"ל הוא פעולה של האדם עצמו — ראה ראש 224.
        declare
          v_sp     boolean := coalesce(s.payload->>'subjectRole', '') = 'spouse';
          v_trk    jsonb := coalesce(req.execution -> (case when s.payload->>'subjectRole' = 'spouse'
                                                           then 'nationalInsuranceSpouse' else 'nationalInsurance' end), '{}'::jsonb);
          v_me     text := nullif(trim(coalesce(c.first_name, '')), '');
          v_sp1    text := coalesce(nullif(trim(coalesce(c.spouse_first_name, '')), ''),
                                    nullif(split_part(trim(coalesce(c.spouse_name, '')), ' ', 1), ''));
          v_who    text;
          v_whose  text;
          v_other  text;
          v_assure text;
          v_dl     text;
        begin
          v_who := case when v_sp then coalesce(v_sp1,
                     nullif(split_part(trim(coalesce(s.payload->>'subjectName', '')), ' ', 1), ''), 'בן/בת הזוג') end;
          v_whose := case when v_sp then 'של ' || v_who else 'שלך' end;
          v_dl := case when nullif(v_trk->>'deadline', '') is not null
                       then to_char((v_trk->>'deadline')::date, 'DD.MM.YYYY') end;
          select o.status into v_other
            from public.onboarding_steps o
           where o.client_id = s.client_id and o.id <> s.id
             and o.step_type = 'authority_representation'
             and o.payload->>'authority' = 'national_insurance'
             and o.payload->>'subjectRole' = (case when v_sp then 'client' else 'spouse' end)
             and o.status not in ('cancelled', 'skipped')
           order by o.created_at desc
           limit 1;
          v_assure := case
            when v_other in ('completed', 'verified') and v_sp and v_me is not null
              then 'האישור של ' || v_me || ' כבר התקבל. האישור הזה הוא של ' || v_who || ', במספר נפרד.'
            when v_other in ('completed', 'verified') and not v_sp and v_sp1 is not null
              then 'האישור של ' || v_sp1 || ' כבר התקבל. האישור הזה הוא שלך, במספר נפרד.'
            when v_other is not null
              then 'לכל אחד מבני הזוג מספר אסמכתא נפרד ואישור נפרד.'
          end;
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket', 'action', 'key', 'authrep_' || s.id, 'kind', 'ni_approval',
            'forPerson', v_who,
            'label', case when v_sp then v_who || ' — אישור ייפוי הכוח בביטוח הלאומי'
                          else 'אישור ייפוי הכוח בביטוח הלאומי' end,
            'assurance', v_assure,
            'refs', jsonb_build_array(jsonb_build_object(
                      'label', 'מספר האסמכתא ' || v_whose,
                      'value', coalesce(nullif(v_trk->>'referenceNumber', ''), '—')))
                    || case when v_dl is not null
                            then jsonb_build_array(jsonb_build_object('label', 'לאשר עד', 'value', v_dl))
                            else '[]'::jsonb end,
            'noteAfter', 'באתר: תעודת הזהות ' || v_whose || ' ומספר האסמכתא, והזדהות בכרטיס אשראי ' || v_whose
                         || ' (או בטלפון/מייל המעודכנים בביטוח הלאומי).' || chr(10)
                         || 'בטלפון: ' || chr(8294) || '02' || chr(8209) || '5393740' || chr(8297)
                         || ' (מענה קולי), עם מספר האסמכתא.',
            'linkUrl', 'https://b2b.btl.gov.il/BTL.ILG.PAYMENTS/IshurIpuyKoachInfo.aspx',
            'linkLabel', 'לאישור באתר הביטוח הלאומי'));
        end;$branch$;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_portal_step_items';
  if v_def is null then
    raise exception '224: _portal_step_items לא נמצאה';
  end if;

  if position($m$'kind', 'ni_approval'$m$ in v_def) > 0 then
    raise notice '224: _portal_step_items כבר מתוקנת, מדלג';
    return;
  end if;

  v_a := position($m$when 'authority_representation' then$m$ in v_def);
  if v_a = 0 then raise exception '224: הענף authority_representation לא נמצא'; end if;
  if (length(v_def) - length(replace(v_def, v_start, ''))) / length(v_start) <> 1
     or (length(v_def) - length(replace(v_def, v_end, ''))) / length(v_end) <> 1 then
    raise exception '224: העוגנים אינם יחידים — התיקון נעצר';
  end if;
  v_s := position(v_start in v_def);
  v_e := position(v_end in v_def);
  if not (v_a < v_s and v_s < v_e) then
    raise exception '224: סדר העוגנים לא צפוי (% / % / %) — התיקון נעצר', v_a, v_s, v_e;
  end if;
  if position($m$'kind','message'$m$ in substr(v_def, v_s, v_e - v_s)) = 0 then
    raise exception '224: הענף אינו הענף של 157 — התיקון נעצר';
  end if;

  v_new := substr(v_def, 1, v_s - 1) || v_branch || substr(v_def, v_e + length(v_end));
  execute v_new;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_portal_step_items';
  if position($m$'kind', 'ni_approval'$m$ in v_def) = 0
     or position('אם ההודעה לא הגיעה' in v_def) > 0 then
    raise exception '224: האימות אחרי ההחלה נכשל';
  end if;
  raise notice '224: _portal_step_items תוקנה';
end
$do$;
