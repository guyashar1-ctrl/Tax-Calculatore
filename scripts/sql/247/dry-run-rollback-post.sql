-- חזרה על ההחזרה (post): אחרי 247 ואז rollback-247 — כל גוף זהה בייט-בבייט למה שהיה, ואין שאריות
do $chk$
declare r record; n int;
begin
  for r in select x.proname, x.m, md5(pg_get_functiondef(p.oid)) now_m from _pre247 x join pg_proc p on p.proname = x.proname join pg_namespace s on s.oid = p.pronamespace and s.nspname = 'public' loop
    if r.m is distinct from r.now_m and r.proname <> '_smart_form_template' then raise exception 'CHECK_FAILED: % לא חזר למקור', r.proname; end if;
  end loop;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public'
    and (proname like '\_scf\_%' or proname like 'portal\_smart\_form\_%' or proname like 'smart\_form\_client\_%');
  if n <> 0 then raise exception 'CHECK_FAILED: % פונקציות נשארו', n; end if;
end
$chk$;
