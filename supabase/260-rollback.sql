-- חזרה מ-260: מסיר את שורת 'paperlessKind' מ-_portal_step_items (הדף חוזר להתנהגות הקודמת).
do $rb$
declare
  v_def text := pg_get_functiondef('public._portal_step_items'::regproc);
  v_line constant text := E'\n          -- 260 · מה לבחור ב«סוג עסק» בטופס ההרשמה של פייפרלס (\'\' = לא נקבע בכרטיס)\n          ''paperlessKind'', case when c.dealer_type = ''company'' then ''חברה''\n                                  when c.dealer_type = ''licensed'' or c.vat_status = ''authorizedDealer'' then ''מורשה''\n                                  when c.dealer_type = ''exempt'' or c.vat_status = ''exemptDealer'' then ''פטור''\n                                  else '''' end,';
begin
  if position(v_line in v_def) = 0 then
    raise notice '260 rollback: nothing to remove';
    return;
  end if;
  execute replace(v_def, v_line, '');
end
$rb$;
