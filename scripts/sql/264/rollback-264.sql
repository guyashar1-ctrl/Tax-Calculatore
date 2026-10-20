-- התאוששות מ-264 («סבב אחד»): מסיר את הבלוק שהוזרק ל-portal_submit_tax_info — הגוף חוזר לזה שלפני 264 (md5 f2d84536…).
-- ‼ שאלות שכבר נפתחו מ-onYes נשארות (הן שאלות רגילות של הלקוח); רק פתיחה חדשה נפסקת. הדפדפן ימשיך לשלוח onYes — השרת יתעלם.
do $r1$
declare
  v_def text; v_nl text; v_from int; v_to int;
  m_start text := '  -- 264 · «סבב אחד»';
  m_end text := '  -- כשאין עוד שאלות פתוחות — הכדור חוזר למשרד (לבדיקה). מסמך «אין עדיין» אינו חוסם.';
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  v_from := position(m_start in v_def);
  if v_from = 0 then raise notice '264: לא הוחלה — אין מה להחזיר'; return; end if;
  v_to := position(m_end in v_def);
  if v_to < v_from then raise exception '264: סדר הסימונים לא צפוי — לא נוגעים'; end if;
  execute substr(v_def, 1, v_from - 1) || substr(v_def, v_to);
end
$r1$;
-- אימות: select md5(prosrc) from pg_proc where proname = 'portal_submit_tax_info';  -- = f2d845361cc3c2d6f2b7c29c11571b1a
