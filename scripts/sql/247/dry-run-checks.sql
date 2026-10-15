-- בדיקות בתוך החזרה של 247 (prod-dryrun-6101-migrations --files supabase/247-smart-client-forms.sql,scripts/sql/247/dry-run-checks.sql): נכשל ⇒ CHECK_FAILED
do $chk$
declare n int; f text;
begin
  foreach f in array array['_portal_step_items','_smart_form_sync_step','smart_form_start','assert_domain_function_invariants'] loop
    select (length(prosrc) - length(replace(prosrc, '247 ·', ''))) / length('247 ·') into n from pg_proc where proname = f;
    if n <> 1 then raise exception 'CHECK_FAILED: % has % markers', f, n; end if;
  end loop;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'
    and (proname like '\_scf\_%' or proname like 'portal\_smart\_form\_%' or proname like 'smart\_form\_client\_%' or proname in ('_smart_form_portal_item','_smart_form_sync_client_step'));
  if n <> 20 then raise exception 'CHECK_FAILED: % new functions', n; end if;
  if not has_function_privilege('anon', 'public.portal_smart_form_get(text,text)', 'EXECUTE') or has_function_privilege('anon', 'public._scf_apply(text,jsonb,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._scf_apply(text,jsonb,text)', 'EXECUTE') or has_function_privilege('anon', 'public.smart_form_client_start(text,text,boolean)', 'EXECUTE') then
    raise exception 'CHECK_FAILED: grants';
  end if;
  if (public._smart_form_template('vat-821')->>'mappingVersion')::int <> 1 or (public._smart_form_template('btl-6101')->>'mappingVersion') is null then raise exception 'CHECK_FAILED: templates'; end if;
  raise notice 'CHECKS_OK';
end
$chk$;
