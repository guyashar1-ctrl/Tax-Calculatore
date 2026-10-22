-- ═══════════════════════════════════════════════════════════════════════════
-- 285 · שתי פונקציות הרשימות לרשימת ההיתר של anon (22.10.2026)
-- il_localities_list / il_streets_for פתוחות ל-anon בכוונה: דף הקליטה של הלקוח (בלי התחברות)
-- בוחר מהן יישוב ורחוב. הן מחזירות רק את הרשימות הציבוריות של רשות האוכלוסין, בלי שום נתון
-- של משרד או לקוח, ולא כותבות. (אותה תבנית כמו 284 — מוסיפים לסוף הרשימה.)
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_def  text := pg_get_functiondef('public.assert_domain_function_invariants()'::regprocedure);
  v_head int  := position('v_anon_ok text[] := array[' in v_def);
  v_pos  int;
begin
  if position('''il_streets_for''' in v_def) > 0 then return; end if;
  if v_head = 0 then raise exception '285: v_anon_ok not found'; end if;
  v_pos := v_head + position(E'\n  ];' in substr(v_def, v_head)) - 1;
  if v_pos < v_head then raise exception '285: end of v_anon_ok not found'; end if;
  execute substr(v_def, 1, v_pos - 1)
    || E',\n    -- 285 · רשימות היישובים והרחובות הציבוריות לדף הקליטה — בלי נתוני משרד'
    || E'\n    ''il_localities_list'', ''il_streets_for'''
    || substr(v_def, v_pos);
end;
$$;

do $$
begin
  if position('''il_streets_for''' in pg_get_functiondef('public.assert_domain_function_invariants()'::regprocedure)) = 0 then
    raise exception '285: allowlist not updated';
  end if;
end;
$$;
