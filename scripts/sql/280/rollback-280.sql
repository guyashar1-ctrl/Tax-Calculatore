-- החזרה של 280 («הדוחות שלך» בדף האישי). ‼ קריאה בלבד היו — אין נתונים למחוק.
-- מסיר את שלוש הפונקציות ואת 'portal_filings' מרשימת v_anon_ok (ההזרקה של 280 בלבד, בעוגן שלה).
drop function if exists public.portal_filings_preview(text);
drop function if exists public.portal_filings(text);
drop function if exists public._portal_filings(text);

do $unpatch$
declare
  v_inv text;
  v_nl  text := E'\r\n';
  a_inv text := E'\n  ];\nbegin';
  n_inv text := E',\n    -- 280 · «הדוחות שלך» בדף האישי — טוקן הדף בלבד (_portal_client), קריאה בלבד\n    ''portal_filings''\n  ];\nbegin';
begin
  select pg_get_functiondef(p.oid) into v_inv from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'assert_domain_function_invariants';
  if v_inv is null or position('''portal_filings''' in v_inv) = 0 then raise notice '280 rollback: הרשימה כבר בלי portal_filings'; return; end if;
  if position(replace(n_inv, E'\n', v_nl) in v_inv) > 0 then a_inv := replace(a_inv, E'\n', v_nl); n_inv := replace(n_inv, E'\n', v_nl); end if;
  if position(n_inv in v_inv) = 0 then raise exception '280 rollback: ההזרקה של 280 לא נמצאה כפי שנכתבה — לבדוק ידנית'; end if;
  execute replace(v_inv, n_inv, a_inv);
end
$unpatch$;
