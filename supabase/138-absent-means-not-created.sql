-- ─── 138 · בקשה שהוסרה מברירת המחדל לא נוצרת ────────────────────────────────
--
-- ‼ תיקון סמנטיקה, ובעקבותיו תיקון UX.
--
-- 135 הגדירה: רשומה שחסרה מהצילום ⇒ הבקשה **כן** נוצרת. ההיגיון היה תאימות
-- לאחור — צילום ריק מתנהג כמו הקוד הישן. אבל בפועל זה הפך את «הסרה» לפעולה
-- שעושה את ההפך מכוונתה: להוציא בקשה מהרשימה היה מחזיר אותה ללקוח.
--
-- כדי לעקוף את זה נבנתה במסך מגירת «כבויות» — בקשה שכובתה נשארה ברשומות
-- ורק הוסתרה. גיא צדק שזה מסורבל: אין «כבוי», יש «יש ברשימה» או «אין».
--
-- ═══ הסמנטיקה החדשה ═══
--   צילום null            ⇒ true   (מסע שנולד לפני 135 — בדיוק כמו קודם)
--   רשומה קיימת           ⇒ enabled שלה
--   צילום קיים, אין רשומה ⇒ **false**
--
-- ‼ מה זה לא שובר: סוג שאינו רלוונטי לסוג הלקוח ממילא אינו נוצר בגלל תנאי
-- המערכת (למשל «חיבור פייפרלס לרשות המסים» לעוסק פטור — v_licensed חוסם).
-- לכן היעדרו מהזריעה נתן את אותה תוצאה גם קודם, ורק עכשיו הוא גם אומר אותה.
--
-- ‼ מה זה כן משנה, ובכוונה: סוג בקשה שייווסף למוצר בעתיד לא ייווצר רטרואקטיבית
-- ללקוח שהצילום שלו נולד לפניו. זו ההתנהגות הנכונה לצילום.
--
-- ‼ בפרודקשן אין כרגע אף התקשרות עם צילום (נבדק), ולכן אין השפעה על אף מסע קיים.

create or replace function public.journey_default_enabled(p_snapshot jsonb, p_step_type text)
returns boolean language sql immutable as $function$
  select case
    -- אין צילום ⇒ התנהגות הקוד, כמו לפני 135
    when p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array' then true
    -- יש רשומה ⇒ מה שכתוב בה
    when public.journey_default_entry(p_snapshot, p_step_type) is not null then
      coalesce((public.journey_default_entry(p_snapshot, p_step_type)->>'enabled')::boolean, true)
    -- יש צילום ואין רשומה ⇒ הוסרה מברירת המחדל
    else false
  end;
$function$;

revoke all on function public.journey_default_enabled(jsonb, text) from public, anon;
grant execute on function public.journey_default_enabled(jsonb, text) to authenticated;

-- ── אימות ────────────────────────────────────────────────────────────────────
do $do$
declare
  v_snap jsonb := jsonb_build_array(
    jsonb_build_object('key','client_documents','stepType','client_documents','enabled',true),
    jsonb_build_object('key','paperless_invite','stepType','paperless_invite','enabled',false));
begin
  if public.journey_default_enabled(null, 'client_documents') is not true then
    raise exception '138: צילום ריק חייב להישאר "נוצר"';
  end if;
  if public.journey_default_enabled(v_snap, 'client_documents') is not true then
    raise exception '138: רשומה דלוקה חייבת להיווצר';
  end if;
  if public.journey_default_enabled(v_snap, 'paperless_invite') is not false then
    raise exception '138: רשומה כבויה חייבת לא להיווצר';
  end if;
  if public.journey_default_enabled(v_snap, 'retainer_authorization') is not false then
    raise exception '138: רשומה שהוסרה חייבת לא להיווצר';
  end if;
  raise notice '138: אומת - היעדר מהצילום = לא נוצר';
end $do$;
