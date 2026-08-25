-- ─── רולבק ל-136 · מחזיר את המחולל להגדרה שלפני הטלאי ───────────────────────
-- ‼ מחזיר את הגוף מהגיבוי `generate_onboarding_steps_v1` שנוצר ב-136 §0,
--   ואז מוחק את הגיבוי. אינו נוגע ב-135 (הטבלה והעמודות נשארות — הן אדישות
--   כל עוד המחולל אינו קורא מהן).
do $do$
declare v_src text;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'generate_onboarding_steps_v1') then
    raise exception 'רולבק 136: אין גיבוי v1 - לא מנחשים';
  end if;

  v_src := pg_get_functiondef('public.generate_onboarding_steps_v1(text,boolean)'::regprocedure);
  execute replace(v_src,
    'FUNCTION public.generate_onboarding_steps_v1(',
    'FUNCTION public.generate_onboarding_steps(');
  drop function public.generate_onboarding_steps_v1(text, boolean);

  if position('journey_default_enabled' in
      pg_get_functiondef('public.generate_onboarding_steps(text,boolean)'::regprocedure)) > 0 then
    raise exception 'רולבק 136: הטלאי עדיין שם';
  end if;
  raise notice 'רולבק 136: המחולל הוחזר להגדרה המקורית';
end $do$;
