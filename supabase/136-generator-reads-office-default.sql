-- ─── 136 · המחולל קורא מברירת המחדל של המשרד ────────────────────────────────
--
-- 135 הוסיפה את שכבת הנתונים בלי לגעת בהתנהגות. כאן המחולל מתחיל לקרוא ממנה.
--
-- ‼ טלאי ולא כתיבה מחדש. `generate_onboarding_steps` ספגה שישה טלאים
--   (106·115·117·130·132) ואין לה הגדרה שלמה בריפו — הגדרה חדשה שנכתבת ביד
--   הייתה מאבדת בשקט את מה שלא הועתק. הדפוס כאן זהה ל-115/117/130/132:
--   קוראים את המקור מהמסד, מחליפים עוגנים יחידים, ונופלים בקול אם עוגן
--   לא נמצא. כל מה שלא נגענו בו נשאר בייט-בבייט כפי שהוא.
--
-- ═══ מה משתנה ═══
-- 1. **צילום** — התקשרות שאין לה עדיין שום שלב מקבלת עותק של ברירת המחדל
--    לפי סוג הלקוח. הרצה חוזרת קוראת מהעותק ולא מהטבלה החיה.
--    ‼ מסע שכבר התחיל אינו מקבל צילום ואינו משנה התנהגות: כל פונקציות 135
--    מחזירות את ברירת המחדל של הקוד כשהצילום ריק.
-- 2. **כיבוי** — בקשה שכובתה אינה נוצרת. היא גם אינה חוסמת סגירה, כי השער
--    סופר שורות קיימות בלבד; בקשה שלא נוצרה אינה שורה. אין שינוי בשער.
-- 3. **סדר** — `sort_order` מהמקום השמור בצילום במקום 0, כולל לבקשה
--    שתנאיה יתקיימו רק בהמשך. סידור ידני של המשרד גובר ואינו נדרס.
-- 4. **ווריאציות** — «מסמכים מהלקוח» ו«פרטי הרו״ח הקודם» לוקחים פריטים
--    ונוסח מהענף המתאים. אין ענף ⇒ בדיוק הקוד הישן.
-- 5. **«עסק חדש» מתוקן** — ראה 1.2.
--
-- ═══ מה לא משתנה ═══
--   התנאים · התלויות · הבעלות · הסטטוסים · הסכומים · מכונת המצבים של הייצוג ·
--   העבודה הפנימית · האינווריאנט של טיוטה־מול־פרסום · שער הסגירה.

-- ── 0 · גיבוי לרולבק ─────────────────────────────────────────────────────────
do $do$
declare v_src text;
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'generate_onboarding_steps_v1') then
    raise notice '136: גיבוי v1 כבר קיים - מדלגים';
    return;
  end if;
  v_src := pg_get_functiondef('public.generate_onboarding_steps(text,boolean)'::regprocedure);
  execute replace(v_src,
    'FUNCTION public.generate_onboarding_steps(',
    'FUNCTION public.generate_onboarding_steps_v1(');
  raise notice '136: גיבוי generate_onboarding_steps_v1 נוצר';
end $do$;

-- ── 1 · הטלאי ────────────────────────────────────────────────────────────────
do $do$
declare
  src    text := pg_get_functiondef('public.generate_onboarding_steps(text,boolean)'::regprocedure);
  prev   text;
  a      text;
  t      text;
  -- הסוגים שהמשרד יכול לכבות. השאר (ייצוג, הכרת לקוח, הקמה פנימית, ביקורת
  -- חודש ראשון, פתיחת תיקים) הם עבודת מערכת ואינם ניתנים לכיבוי — סיווג C.
  types  text[] := array['client_documents','prev_accountant_details','release_letter',
                         'materials_received','paperless_invite','paperless_connection',
                         'paperless_tax_authority'];
begin
  if position('journey_default_enabled' in src) > 0 then
    raise notice '136: המחולל כבר קורא מברירת המחדל - מדלגים';
    return;
  end if;

  -- ── 1.1 · משתנים חדשים ────────────────────────────────────────────────────
  a := '  v_licensed   boolean := false;';
  if position(a in src) = 0 then raise exception '136: עוגן ההצהרות לא נמצא'; end if;
  src := replace(src, a, a
    || E'\n  v_kind       text;'
    || E'\n  v_snap       jsonb;'
    || E'\n  v_facts      jsonb;'
    || E'\n  v_var        jsonb;'
    || E'\n  v_prev_known boolean;'
    || E'\n  v_fresh      boolean;'
    || E'\n  v_office     uuid;');

  -- ── 1.2 · «עסק חדש» — עובדה אמינה במקום שדה שלא מולא ──────────────────────
  --   הישן:  business_transfer = false (וגם is not null)
  --   בפועל: בפרודקשן 0 לקוחות ו-0 לידים עם הערך הזה. הענף לא רץ מעולם,
  --          ועסק חדש קיבל בשקט את רשימת הנופל־אחורה.
  --   הסיבה: הפקד היחיד בטופס הליד («עסק חדש או העברה?») כותב היום את שני
  --          השדות יחד, אבל רשומות היסטוריות נשמרו רק עם has_previous_accountant.
  --   החדש:  has_previous_accountant IS FALSE = "נשאל ונענה: אין רו״ח קודם".
  --          שלושה מצבים: true / false / null(לא נשאל). null ממשיך ליפול
  --          לענף ברירת המחדל, בדיוק כמו היום.
  --   ‼ business_transfer = false ממשיך להיחשב, כדי שלא תאבד התנהגות של מי
  --     שכן מילא אותו.
  --
  --   ‼‼ התיקון חל על מסע חדש בלבד. בבדיקת התאמה מול v1 על סביבת הבדיקות
  --   התגלה שהסמנטיקה החדשה מוסיפה «פתיחת תיקים ברשויות» לשלושה לקוחות
  --   קיימים (has_previous_accountant = false) בהרצה החוזרת הבאה, ומעבירה את
  --   «מסמכים מהלקוח» לענף «עסק חדש». זה בדיוק "לקוח קיים מקבל פתאום בקשה
  --   שלא ביקשנו" — ולכן התיקון נעול לאותו גבול מחזור חיים כמו הצילום:
  --   מסע שכבר יש בו שלבים ממשיך לחשב בדיוק כמו קודם.
  a := '  v_new_business := coalesce(v_client.business_transfer, not v_has_prev) = false and v_has_prev = false'
       || E'\n                    and v_client.business_transfer is not null;';
  if position(a in src) = 0 then raise exception '136: עוגן v_new_business לא נמצא'; end if;
  src := replace(src, a,
       '  v_prev_known := v_client.has_previous_accountant;'
    || E'\n  if v_prev_known is null then'
    || E'\n    select l.has_previous_accountant into v_prev_known'
    || E'\n      from public.leads l where l.converted_client_id = e.client_id limit 1;'
    || E'\n  end if;'
    || E'\n  if v_prev_known is null and q.lead_id is not null then'
    || E'\n    select l.has_previous_accountant into v_prev_known'
    || E'\n      from public.leads l where l.id = q.lead_id limit 1;'
    || E'\n  end if;'
    || E'\n  v_fresh := not exists (select 1 from public.onboarding_steps where engagement_id = e.id);'
    || E'\n  if v_fresh then'
    || E'\n    v_new_business := (v_prev_known is false) or (v_client.business_transfer is false);'
    || E'\n  else'
    || E'\n    v_new_business := coalesce(v_client.business_transfer, not v_has_prev) = false and v_has_prev = false'
    || E'\n                      and v_client.business_transfer is not null;'
    || E'\n  end if;');

  -- ── 1.3 · העובדות והצילום ─────────────────────────────────────────────────
  a := '  if v_has_rep then';
  if position(a in src) = 0 then raise exception '136: עוגן v_has_rep לא נמצא'; end if;
  src := replace(src, a,
       '  v_needs_prevdet := nullif(trim(coalesce(v_client.prev_accountant_email, '''')), '''') is null;'
    || E'\n'
    || E'\n  -- ‼ גבול מחזור החיים במפורש: רק התקשרות שאין לה עדיין שום שלב'
    || E'\n  -- מקבלת צילום. מסע שכבר התחיל ממשיך לפי מה שנולד איתו, ולכן עריכה'
    || E'\n  -- עתידית של ברירת המחדל אינה נוגעת בו (הכרעת גיא 2026-08-25).'
    || E'\n  v_facts := jsonb_build_object('
    || E'\n    ''monthly'', v_has_monthly, ''paperless'', v_has_paperless,'
    || E'\n    ''licensed'', v_licensed, ''rep'', v_has_rep, ''has_prev'', v_has_prev,'
    || E'\n    ''new_business'', v_new_business, ''no_prev_email'', v_needs_prevdet);'
    || E'\n'
    || E'\n  v_snap := e.journey_default_snapshot;'
    || E'\n  if v_snap is null and v_fresh then'
    || E'\n    v_kind := public.resolve_client_kind(e.quotation_id, e.client_id);'
    || E'\n    select office_id into v_office from public.profiles where id = e.user_id;'
    || E'\n    if v_kind is not null and v_office is not null then'
    || E'\n      select d.entries into v_snap from public.office_journey_defaults d'
    || E'\n       where d.office_id = v_office and d.client_kind = v_kind;'
    || E'\n      if v_snap is not null and not p_dry_run then'
    || E'\n        update public.engagements'
    || E'\n           set journey_default_snapshot = v_snap, journey_default_facts = v_facts'
    || E'\n         where id = e.id;'
    || E'\n      end if;'
    || E'\n    end if;'
    || E'\n  elsif e.journey_default_facts is not null then'
    || E'\n    v_facts := e.journey_default_facts;   -- הרצה חוזרת: דטרמיניזם'
    || E'\n  end if;'
    || E'\n'
    || a);

  -- ── 1.4 · ווריאציית «מסמכים מהלקוח» ───────────────────────────────────────
  a := '    if v_new_business then' || E'\n'
    || '      v_docs := jsonb_build_array(';
  if position(a in src) = 0 then raise exception '136: עוגן ווריאציית המסמכים לא נמצא'; end if;
  src := replace(src, a,
       '    v_var := public.journey_default_variant(v_snap, ''client_documents'', v_facts);'
    || E'\n    if v_var is not null then'
    || E'\n      v_docs := public.journey_default_checklist(v_var);'
    || E'\n    elsif v_new_business then'
    || E'\n      v_docs := jsonb_build_array(');

  -- ── 1.5 · ווריאציית «פרטי הרו״ח הקודם» (נוסח) ─────────────────────────────
  a := '                case when v_needs_prevdet then jsonb_build_object(';
  if position(a in src) = 0 then raise exception '136: עוגן נוסח הרו״ח הקודם לא נמצא'; end if;
  src := replace(src, a,
       '                coalesce('
    || E'\n                  public.journey_default_variant(v_snap, ''prev_accountant_details'', v_facts)->''copy'','
    || E'\n' || a);
  a := '''clientCta'', ''לאישור'') end)';
  if position(a in src) = 0 then raise exception '136: עוגן סגירת הנוסח לא נמצא'; end if;
  src := replace(src, a, '''clientCta'', ''לאישור'') end))');

  -- ── 1.6 · כיבוי · תוספת לתנאי הקיים, לכל סוג בנפרד ────────────────────────
  foreach t in array types loop
    prev := src;
    if t = 'retainer_authorization' then
      continue;
    end if;
    -- העוגן: הופעת סוג השלב, ואחריה בדיקת ה-null שכבר קיימת בקוד.
    src := regexp_replace(src,
      '(step_type = ''' || t || '''[^;]*;' || E'\n' || '\s*if\s+v_[a-z_]+\s+is null)(\s+then)',
      '\1 and public.journey_default_enabled(v_snap, ''' || t || ''')\2');
    if src = prev then
      raise exception '136: הכיבוי לסוג % לא הוחל - הדפוס לא נמצא', t;
    end if;
  end loop;

  -- הרשאת התשלום נבדקת ב-not exists ולא ב-null, ולכן עוגן משלה.
  a := 'where engagement_id = e.id and step_type = ''retainer_authorization'') then';
  if position(a in src) = 0 then raise exception '136: עוגן הרשאת התשלום לא נמצא'; end if;
  src := replace(src, a,
       'where engagement_id = e.id and step_type = ''retainer_authorization'')'
    || E'\n       and public.journey_default_enabled(v_snap, ''retainer_authorization'') then');

  -- ── 1.7 · הסדר השמור ──────────────────────────────────────────────────────
  -- ‼ בסוף, ובפעולה אחת: כל בקשה שיש לה מקום שמור בצילום ועדיין ב-0 מקבלת
  -- אותו. זה מכסה גם בקשה שנולדה מאוחר — היא נכנסת למקומה ולא לסוף הרשימה.
  -- ‼ `sort_order <> 0` פירושו שמישהו סידר ידנית; לא נוגעים.
  a := '  if not p_dry_run and v_created > 0 then';
  if position(a in src) = 0 then raise exception '136: עוגן היומן לא נמצא'; end if;
  src := replace(src, a,
       '  if not p_dry_run and v_snap is not null then'
    || E'\n    update public.onboarding_steps s'
    || E'\n       set sort_order = public.journey_default_order(v_snap, s.step_type)'
    || E'\n     where s.engagement_id = e.id'
    || E'\n       and coalesce(s.sort_order, 0) = 0'
    || E'\n       and public.journey_default_entry(v_snap, s.step_type) is not null;'
    || E'\n  end if;'
    || E'\n'
    || a);

  execute src;
  raise notice '136: המחולל עודכן (% תווים)', length(src);
end $do$;

-- ── 2 · אימות מבני ───────────────────────────────────────────────────────────
do $do$
declare
  src text := pg_get_functiondef('public.generate_onboarding_steps(text,boolean)'::regprocedure);
  t   text;
  n   int;
begin
  if position('journey_default_enabled' in src) = 0 then
    raise exception '136: הטלאי לא הוחל';
  end if;

  -- שמונה כיבויים בדיוק: שבעה מהלולאה + הרשאת התשלום.
  select count(*) into n from regexp_matches(src, 'journey_default_enabled', 'g');
  if n <> 8 then raise exception '136: ציפינו ל-8 בדיקות כיבוי, יש %', n; end if;

  foreach t in array array['client_documents','prev_accountant_details','release_letter',
                           'materials_received','paperless_invite','paperless_connection',
                           'paperless_tax_authority','retainer_authorization'] loop
    if position('journey_default_enabled(v_snap, ''' || t || ''')' in src) = 0 then
      raise exception '136: חסרה בדיקת כיבוי לסוג %', t;
    end if;
  end loop;

  if position('journey_default_variant(v_snap, ''client_documents''' in src) = 0
     or position('journey_default_variant(v_snap, ''prev_accountant_details''' in src) = 0 then
    raise exception '136: חסרה קריאת ווריאציה';
  end if;
  if position('journey_default_order' in src) = 0 then
    raise exception '136: חסר עדכון הסדר';
  end if;
  if position('v_prev_known is false' in src) = 0 then
    raise exception '136: תיקון «עסק חדש» לא הוחל';
  end if;

  raise notice '136: אומת - 8 כיבויים, 2 ווריאציות, סדר, ותיקון עסק חדש';
end $do$;
