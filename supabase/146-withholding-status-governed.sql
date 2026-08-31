-- ─── 146: "מצב ניכוי במקור" הופך לעובדה מקצועית מנוהלת ──────────────────────
-- עד היום הבחירה במסך יישור הקו (פטור מניכוי / שיעורים לפי פעילות / אין אישור
-- תקף) נשמרה רק ב-payload של השלב, ומתוכה נגזר בלבד hasExemptFromWithholding.
-- לכן "אין אישור תקף" לא היה ניתן להבחנה מ"שיעורים לפי פעילות" בלי פירוט:
-- שניהם hasExemptFromWithholding=false. מחולל הדגלים של "תמונת מצב מול
-- הרשויות" חייב להבחין ביניהם — האחד תקין והשני דורש טיפול.
--
-- ‼ הענף מוזרק ל-_tax_fact_field_op בתיקון טקסטואלי ולא בהגדרה מחדש של כל
-- הפונקציה: היא כ-20KB של ענפי CASE, והעתקתה ידנית לצורך תוספת של שלוש שורות
-- מסכנת השמטה שקטה של ענף קיים. התיקון מאמת את עצמו בשני הכיוונים — האורך
-- גדל בדיוק בגודל התוספת, ומספר הענפים גדל בדיוק באחד.
-- ‼ אידמפוטנטי: ריצה חוזרת מדלגת.

alter table public.clients
  add column if not exists withholding_status text;

comment on column public.clients.withholding_status is
  'מצב ניכוי מס במקור: exempt (פטור) / rates (שיעורים לפי פעילות) / none (אין אישור תקף). נאסף ביישור קו מול הרשויות.';

do $do$
declare
  v_def text;
  v_new text;
  v_anchor constant text := E'    when ''withholdingRate'' then\n';
  v_branch constant text :=
    E'    when ''withholdingStatus'' then\n'
    '      select to_jsonb(withholding_status) into out_current from public.clients where id = p_client_id;\n'
    '      if p_write then update public.clients set withholding_status = p_value #>> ''{}'', field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n';
  v_branches_before int;
  v_branches_after int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tax_fact_field_op';

  if v_def is null then
    raise exception '146: _tax_fact_field_op לא נמצאה';
  end if;

  -- כבר הוחל — לא נוגעים
  if position('withholdingStatus' in v_def) > 0 then
    raise notice '146: הענף כבר קיים, מדלג';
    return;
  end if;

  -- העוגן חייב להופיע בדיוק פעם אחת
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception '146: העוגן withholdingRate אינו יחיד — התיקון נעצר';
  end if;

  v_branches_before := (length(v_def) - length(replace(v_def, E'\n    when ''', ''))) / length(E'\n    when ''');

  v_new := replace(v_def, v_anchor, v_branch || v_anchor);

  -- אימות דו-כיווני: האורך גדל בדיוק בתוספת, ומספר הענפים גדל בדיוק באחד
  if length(v_new) <> length(v_def) + length(v_branch) then
    raise exception '146: אורך לא תואם אחרי ההזרקה';
  end if;
  v_branches_after := (length(v_new) - length(replace(v_new, E'\n    when ''', ''))) / length(E'\n    when ''');
  if v_branches_after <> v_branches_before + 1 then
    raise exception '146: מספר הענפים השתנה ב-% במקום ב-1', v_branches_after - v_branches_before;
  end if;

  execute v_new;
  raise notice '146: הענף הוזרק (% ענפים)', v_branches_after;
end
$do$;
