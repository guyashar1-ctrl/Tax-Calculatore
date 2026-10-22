-- ═══════════════════════════════════════════════════════════════════════════
-- 284 · assert_domain_function_invariants חוזרת לירוק — שש פונקציות דף לקוח לרשימת ההיתר (22.10.2026)
--
-- הבדיקה נכשלה בייצור ובכל בדיקות ה-staging שקוראות לה (flows-notices, flow-conditions,
-- notices-edge, lifecycle-205) על שש פונקציות שנפתחו ל-anon בלי שנוספו לרשימה. בדיקה שתמיד אדומה
-- היא רעש — ולכן גם הפרה אמיתית הייתה נבלעת בה. נבדק (22.10): כל השש מקבלות טוקן ופותחות אותו
-- בשער של הדף (_portal_client(p_token)) או של השאלון (resolve_intake_token) — בדיוק כמו
-- portal_submit_step שכבר ברשימה. ‼ פונקציה חדשה ל-anon בלי שורה כאן ⇒ הבדיקה נכשלת שוב.
-- ‼ מוסיפים לסוף הרשימה (לפני «];» הראשון) ולא אחרי שורה מסוימת — סשנים מקבילים מוסיפים גם הם.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_def  text := pg_get_functiondef('public.assert_domain_function_invariants()'::regprocedure);
  v_head int  := position('v_anon_ok text[] := array[' in v_def);
  v_pos  int;
begin
  if position('''intake_replaced_state''' in v_def) > 0 then return; end if;
  if v_head = 0 then raise exception '284: v_anon_ok not found'; end if;
  v_pos := v_head + position(E'\n  ];' in substr(v_def, v_head)) - 1;
  if v_pos < v_head then raise exception '284: end of v_anon_ok not found'; end if;
  execute substr(v_def, 1, v_pos - 1)
    || E',\n    -- 284 · «מס» בדף האישי ושאלון שהוחלף — טוקן הדף (_portal_client) / טוקן השאלון בלבד'
    || E'\n    ''portal_tax_estimate'', ''portal_tax_info'', ''portal_save_tax_info_draft'', ''portal_submit_tax_info'','
    || E'\n    ''portal_note_tax_evidence_parts'', ''intake_replaced_state'''
    || substr(v_def, v_pos);
end;
$$;

-- ‼ אחרי ההחלה הרשימה של 284 חייבת להיות בפנים.
do $$
begin
  if position('''portal_note_tax_evidence_parts''' in pg_get_functiondef('public.assert_domain_function_invariants()'::regprocedure)) = 0 then
    raise exception '284: allowlist not updated';
  end if;
end;
$$;
