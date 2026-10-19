-- ═══════════════════════════════════════════════════════════════════════════
-- 260 · «הרשמה לפייפרלס» אומרת ללקוח מה לבחור ב«סוג עסק» (19.10.2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- ‼ גיא: «שבבקשות הם צריכים להירשם לפייפרלס צריך לומר להם מה לבחור — עוסק מורשה או עוסק פטור».
--   נצפה חי 19.10.2026 (קישור ההזמנה של המשרד, צפייה בלבד): בטופס ההרשמה של פייפרלס יש
--   «סוג עסק» עם פטור · מורשה · חברה · עמותה · שותפות מורשה · שותפות פטור, וברירת המחדל
--   היא «מורשה» — עוסק פטור שלא שם לב נרשם כמורשה.
--
-- מה משתנה: רק פריט ההרשמה (הענף של חשבון חדש) ב-_portal_step_items — המקום היחיד שממנו
-- הדף האישי והצפייה בספרייה קוראים. נוסף 'paperlessKind': השם של האפשרות בפייפרלס לפי
-- הכרטיס, או '' כשהסוג לא נקבע (הדף מראה הוראה כללית, והמשרד רואה שחסר).
-- הכלל = cardDealerKind (src/features/taxFile/editModel.ts) = 215 (_flow_facts):
--   חברה ⇐ dealer_type='company'; מורשה ⇐ licensed או authorizedDealer; פטור ⇐ exempt או exemptDealer.
--
-- ‼ הזרקה לגוף החי (כמו 239): הגוף ב-staging וב-ייצור שונה, ועוגן של שורה אחת קיים פעם
--   אחת בשניהם. ריצה חוזרת לא עושה כלום. חזרה: 260-rollback (מסיר את השורה).
-- ═══════════════════════════════════════════════════════════════════════════

do $mig$
declare
  v_def text := pg_get_functiondef('public._portal_step_items'::regproc);
  v_anchor constant text := '''linkUrl'', v_invite_url,';
  v_line constant text := E'\n          -- 260 · מה לבחור ב«סוג עסק» בטופס ההרשמה של פייפרלס (\'\' = לא נקבע בכרטיס)\n          ''paperlessKind'', case when c.dealer_type = ''company'' then ''חברה''\n                                  when c.dealer_type = ''licensed'' or c.vat_status = ''authorizedDealer'' then ''מורשה''\n                                  when c.dealer_type = ''exempt'' or c.vat_status = ''exemptDealer'' then ''פטור''\n                                  else '''' end,';
  v_n int;
begin
  if position('''paperlessKind''' in v_def) > 0 then
    raise notice '260: already applied';
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then
    raise exception '260: anchor found % times (expected 1)', v_n;
  end if;
  execute replace(v_def, v_anchor, v_anchor || v_line);
end
$mig$;
