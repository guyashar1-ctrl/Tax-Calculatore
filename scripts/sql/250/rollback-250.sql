-- החזרה של 250 (חובות הגשה מרשימות שע״ם). ‼ מוחק את הנתונים שנקלטו ואת רשומות המקור; לא נוגע בבקשות שנפתחו
-- מהן (onboarding_steps), באירועים שנרשמו עליהן או בקבצים שבדלי office-imports (נשארים, פרטיים למשרד).
drop function if exists public.confirm_shaam_group_empty(text, text);
drop function if exists public.request_shaam_filing_copy(uuid);
drop function if exists public.link_shaam_obligation_step(uuid, text);
drop function if exists public.resolve_shaam_obligation(uuid, text, text);
drop function if exists public.shaam_filing_list(text);
drop function if exists public._shaam_after_change(uuid);
drop function if exists public.shaam_filing_import(jsonb);
drop function if exists public.shaam_filing_preview(jsonb);
drop function if exists public._shaam_plan_names(uuid, jsonb);
drop function if exists public._shaam_plan(uuid, jsonb);
drop function if exists public._shaam_in_values(jsonb, text);
drop function if exists public._shaam_values(public.shaam_filing_obligations);
drop function if exists public._shaam_status(text, jsonb, text);
drop function if exists public._shaam_match(uuid, text, text);
drop function if exists public._shaam_name_words(text);
drop function if exists public._shaam_file9(text);
drop table if exists public.shaam_filing_obligations;
drop table if exists public.shaam_filing_sources;
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists office_imports_select_own on storage.objects;
    drop policy if exists office_imports_insert_own on storage.objects;
  end if;
end $$;
