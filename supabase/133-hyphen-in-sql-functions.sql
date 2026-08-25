-- ─── 133 · מקף רגיל גם בטקסט שנולד בתוך פונקציות המסד ───────────────────────
-- 6b2ebcb החליף "—" ב-"-" בכל מחרוזת גלויה בקוד ה-TS, ו-128/129 יישרו את מה
-- שכבר נשמר במסד. נשאר פער אחד: טקסט שנוצר **בתוך פונקציות ה-SQL** מעולם לא
-- נסרק — הוא לא יושב בקוד ולא בטבלה, אלא בהגדרת הפונקציה עצמה.
--
-- ‼ זה לא פער תיאורטי. build_client_portal מייצרת "נחתם והוגש לרשויות המס
-- — ממתינים לאישור", וזה בדיוק מה שכל לקוח שהייצוג שלו הוגש רואה בדף האישי
-- שלו. 40 מחרוזות כאלה בפרודקשן, ב-21 פונקציות: הדף האישי, יומן הפעילות,
-- כותרות משימות שנוצרות אוטומטית, והודעות שגיאה שהרו"ח רואה.
--
-- ‼ הערות SQL אינן נגעות — אותה הכרעה בדיוק כמו ב-codemod המקורי, שנגע רק
-- ב-string literals ולא בהערות קוד. 36 מופעים בפרודקשן נשארים כפי שהם.
--
-- ‼ שני מקרים שאינם פיסוק בתוך משפט, ובכל זאת מוחלפים — כי הם טקסט גלוי:
--   · release_portal_respond: הקו המפריד בין תשובה לתשובה של הרו"ח הקודם
--     ("— — —") הופך ל-"- - -".
--   · open_quotation_representation: coalesce(v_labels, '—') הוא הסימן ל"אין
--     ערך". הופך ל-"-", בדיוק כמו ב-ClientList וב-DocumentsWorkspace.
--
-- ‼ מה שנשלח כבר נשלח. המיגרציה הזאת נוגעת בהגדרות הפונקציות בלבד, כלומר
-- בטקסט שייווצר מכאן והלאה. אף גוף מכתב, אף עותק מייל שמור ואף שורת יומן
-- קיימת אינם משוכתבים כאן.
--
-- ‼ למה codemod ולא רשימת עוגנים: 40 עוגנים בעברית, שכל אחד מהם צריך להיות
-- זהה תו-בתו למה שיושב במסד, הם 40 הזדמנויות לטעות העתקה שתעבור בשקט. במקום
-- זה — סורק שיודע להבחין בין מחרוזת להערה, ושלוש בדיקות שנופלות בקול:
--   1. מקף ארוך בקוד חשוף (לא במחרוזת ולא בהערה) — עוצר. אין דבר כזה היום,
--      ואם יופיע פירושו שהסורק טועה ולא שהנתון חריג.
--   2. ההגדרה החדשה חייבת להיות זהה לישנה בכל תו שאינו מקף, באותם מיקומים.
--   3. אחרי ההחלה קוראים את ההגדרה מחדש מהמסד: אפס מקפים ארוכים במחרוזות,
--      ומספר המקפים בהערות זהה לזה שהיה לפני.

do $do$
declare
  r          record;
  v_def      text;      -- ההגדרה כפי שהיא במסד לפני הנגיעה
  v_src      text;      -- מה שנסרק בסבב הנוכחי
  v_new      text;
  v_pass     int;
  v_pos      int[];
  v_cmt      int;
  v_cmt_pre  int;
  v_bare     int;
  i          int;
  n          int;
  ch         text;
  in_str     boolean;
  in_cmt     boolean;
  v_funcs    int := 0;
  v_changes  int := 0;
  v_kept     int := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind in ('f', 'p')
       and pg_get_functiondef(p.oid) like '%—%'
     order by p.proname
  loop
    v_def := pg_get_functiondef(r.oid);
    v_src := v_def;

    <<passes>>
    for v_pass in 1..2 loop
      -- ── הסורק ─────────────────────────────────────────────────────────────
      -- שלושה מצבים בלבד: מחרוזת ב-'...' (עם '' ככפילות), הערת -- עד סוף
      -- השורה, ושאר הקוד. $function$ הוא תוחם הגוף ולא מחרוזת — בלעדיו כל
      -- הגוף היה נראה כמחרוזת אחת ארוכה ושום דבר לא היה מזוהה כהערה.
      -- אין הערות /* */ ואין נטוי-גרש באף הגדרה במסד (נבדק), ולכן אינם מטופלים.
      v_pos := '{}'::int[];
      v_cmt := 0;
      v_bare := 0;
      i := 1;
      n := length(v_src);
      in_str := false;
      in_cmt := false;

      while i <= n loop
        ch := substr(v_src, i, 1);

        if in_cmt then
          if ch = '—' then v_cmt := v_cmt + 1; end if;
          if ch = chr(10) then in_cmt := false; end if;
          i := i + 1;

        elsif in_str then
          if ch = '—' then v_pos := v_pos || i; end if;
          if ch = '''' then
            if substr(v_src, i + 1, 1) = '''' then
              i := i + 2;
              continue;
            end if;
            in_str := false;
          end if;
          i := i + 1;

        else
          if substr(v_src, i, 10) = '$function$' then
            i := i + 10;
          elsif ch = '''' then
            in_str := true;
            i := i + 1;
          elsif substr(v_src, i, 2) = '--' then
            in_cmt := true;
            i := i + 2;
          else
            if ch = '—' then v_bare := v_bare + 1; end if;
            i := i + 1;
          end if;
        end if;
      end loop;

      if v_bare > 0 then
        raise exception '133: % - % מקפים ארוכים מחוץ למחרוזת ומחוץ להערה. הסורק אינו מבין את ההגדרה; עוצרים.',
          r.proname, v_bare;
      end if;

      -- ── סבב 1: מחליפים ומחילים ────────────────────────────────────────────
      if v_pass = 1 then
        v_funcs := v_funcs + 1;

        if coalesce(array_length(v_pos, 1), 0) = 0 then
          raise notice '133: % - % מקפים, כולם בהערות. לא נוגעים.', r.proname, v_cmt;
          v_kept := v_kept + v_cmt;
          exit passes;
        end if;

        v_cmt_pre := v_cmt;
        v_new := v_src;
        -- מקף ארוך ומקף רגיל הם תו אחד כל אחד, ולכן המיקומים אינם זזים.
        foreach i in array v_pos loop
          v_new := overlay(v_new placing '-' from i for 1);
        end loop;

        -- שום דבר מלבד תווי מקף לא זז: שני הצדדים ממופים לאותו מקף, וכל
        -- הפרש אחר - תו, אורך או מיקום - ייראה כאן.
        if replace(v_new, '-', '—') <> replace(v_def, '-', '—') then
          raise exception '133: % - ההגדרה השתנתה מעבר להחלפת המקפים. עוצרים.', r.proname;
        end if;

        execute v_new;
        v_changes := v_changes + array_length(v_pos, 1);
        v_kept := v_kept + v_cmt;
        raise notice '133: % - % מחרוזות תוקנו, % הערות נשמרו.',
          r.proname, array_length(v_pos, 1), v_cmt;

        -- קוראים מהמסד ולא מהמשתנה: מה שנבדק בסבב 2 הוא מה שבאמת הוחל.
        v_src := pg_get_functiondef(r.oid);

      -- ── סבב 2: אימות מול מה שיושב עכשיו במסד ──────────────────────────────
      else
        if coalesce(array_length(v_pos, 1), 0) > 0 then
          raise exception '133: % - נשארו % מקפים ארוכים בטקסט גלוי אחרי ההחלה.',
            r.proname, array_length(v_pos, 1);
        end if;
        if v_cmt <> v_cmt_pre then
          raise exception '133: % - מספר המקפים בהערות השתנה (% למול %). ההחלפה נגעה בהערות.',
            r.proname, v_cmt_pre, v_cmt;
        end if;
      end if;
    end loop;
  end loop;

  raise notice '133: % פונקציות נסרקו · % מחרוזות תוקנו · % מקפים בהערות נשארו כפי שהם.',
    v_funcs, v_changes, v_kept;
end $do$;

-- ─── אימות סופי · אין פונקציה בסכימה עם מקף ארוך בטקסט גלוי ─────────────────
-- ‼ סריקה שנייה ובלתי תלויה, על כל הסכימה ולא רק על מה שנגענו בו. אם ה-DO
-- שלמעלה לא רץ כלל (וזה קרה בעבר דרך apply_migration) - הבדיקה הזאת תצעק.
do $do$
declare
  r      record;
  v_src  text;
  i      int;
  n      int;
  ch     text;
  in_str boolean;
  in_cmt boolean;
  v_bad  int;
  v_tot  int := 0;
  v_list text := '';
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind in ('f', 'p')
       and pg_get_functiondef(p.oid) like '%—%'
  loop
    v_src := pg_get_functiondef(r.oid);
    v_bad := 0; i := 1; n := length(v_src); in_str := false; in_cmt := false;

    while i <= n loop
      ch := substr(v_src, i, 1);
      if in_cmt then
        if ch = chr(10) then in_cmt := false; end if;
        i := i + 1;
      elsif in_str then
        if ch = '—' then v_bad := v_bad + 1; end if;
        if ch = '''' then
          if substr(v_src, i + 1, 1) = '''' then i := i + 2; continue; end if;
          in_str := false;
        end if;
        i := i + 1;
      else
        if substr(v_src, i, 10) = '$function$' then i := i + 10;
        elsif ch = '''' then in_str := true; i := i + 1;
        elsif substr(v_src, i, 2) = '--' then in_cmt := true; i := i + 2;
        else
          if ch = '—' then v_bad := v_bad + 1; end if;
          i := i + 1;
        end if;
      end if;
    end loop;

    if v_bad > 0 then
      v_tot := v_tot + v_bad;
      v_list := v_list || r.proname || ' (' || v_bad || ') ';
    end if;
  end loop;

  if v_tot > 0 then
    raise exception '133: נשארו % מקפים ארוכים בטקסט גלוי: %', v_tot, v_list;
  end if;
  raise notice '133: אימות סופי עבר - אין מקף ארוך בטקסט גלוי באף פונקציה בסכימה.';
end $do$;
