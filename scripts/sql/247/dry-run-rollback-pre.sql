-- חזרה על ההחזרה (pre): טביעת הגופים לפני 247 — בטבלה זמנית באותה טרנזקציה
create temp table _pre247 on commit drop as
  select p.proname, md5(pg_get_functiondef(p.oid)) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('_portal_step_items','_smart_form_sync_step','smart_form_start','assert_domain_function_invariants','_smart_form_template');
