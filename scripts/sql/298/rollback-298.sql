-- 298 (סימוני הגוף — 297) · חזרה: הפריט בדף, הפונקציות והטבלה. ‼ החתימות שבטבלה נמחקות איתה — לגבות לפני (prod-backup-before-migration.mjs ... annual_return_signings).
do $r297$
declare
  v_def text; v_start int; v_end int;
begin
  select pg_get_functiondef('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure) into v_def;
  v_start := position('    when ''annual_return'' then' in v_def);
  if v_start = 0 then raise notice '297 rollback: הענף כבר לא קיים'; else
    v_end := position('    when ''tax_estimate'' then' in v_def);
    if v_end <= v_start then raise exception '297 rollback: סדר הענפים לא צפוי'; end if;
    execute substr(v_def, 1, v_start - 1) || substr(v_def, v_end);
  end if;
  select pg_get_functiondef('public.assert_domain_function_invariants()'::regprocedure) into v_def;
  if position('''portal_annual_return_sign''' in v_def) > 0 then
    v_def := regexp_replace(v_def, E',\r?\n    -- 297 ·[^\r\n]*\r?\n    ''portal_annual_return_get'', ''portal_annual_return_sign''', '');
    execute v_def;
  end if;
end
$r297$;
drop function if exists public.portal_annual_return_sign(text, text, text, text, text, boolean);
drop function if exists public.portal_annual_return_get(text, text);
drop function if exists public._annual_sign_resolve(text, text);
drop function if exists public.annual_return_store_signed(text, text, int, text);
drop function if exists public.annual_return_send_for_signing(text, jsonb, jsonb);
drop table if exists public.annual_return_signings;
