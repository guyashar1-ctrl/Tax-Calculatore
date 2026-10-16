-- ═══════════════════════════════════════════════════════════════════════════
-- 249 · «פרסם בדף» מפרסם גם את שאלות תיק המס (16.10.2026) · פריטים חדשים ברשימת הפריטים (249ב) ·
--       שנות המצב המשפחתי כעובדות מנוהלות (249ג, בסוף)
--
-- נמצא ב-staging (מסלול ב׳, «כל עבודה היא בקשה»): «פרסם בדף» בכרטיס «הדף של …» (publish_case_changes)
-- סימן את בקשת «השלמת מידע» (info_collection) כמפורסמת — published_at — אבל לא פרסם את טיוטת השאלות
-- (tax_info_asks.state = 'draft'). הלקוח קיבל שאלון בלי שאלות, והמשרד ראה שני «פרסם בדף» שעושים דברים שונים.
--
-- התיקון: publish_case_changes קורא לאותה פונקציה של «פרסם את השאלות בדף» — publish_tax_info (229), לכל
-- שאלון פתוח שיש בו טיוטת שאלות; ושאלון בלי שאלות אינו נחשף בשלב 5 הכללי. כל השאר — מילה במילה כמו 216.
-- ‼ publish_tax_info בודקת בעלות (_tax_year_client) — הקורא הוא אותו משתמש משרד, כמו בכל פרסום.
-- ‼ בלי מייל. בלי שינוי בטבלאות. חזרה: scripts/sql/249/rollback-249.sql (הגוף של 216).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.publish_case_changes(p_client_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.clients%rowtype;
  v_uid    uuid := auth.uid();
  e        record;
  s        record;
  v_opened  int := 0;
  v_ordered int := 0;
  v_edits   int := 0;
  v_removed int := 0;
  v_exposed int := 0;
  v_auto    int := 0;
  v_asks    int := 0;
  r        jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  -- 135: עוד לא נמכר כלום - הבקשות מוכנות ומחכות לאישור ההצעה, לא לכפתור.
  -- ‼ 217 (D2): אותו פרדיקט שמחזיק אותן — גם לקוח שחוזר שנשלחה לו הצעה חדשה.
  if public.requests_held_until_approval(c.id) then
    return jsonb_build_object('ok', false, 'error', 'quotation_not_approved');
  end if;

  -- 1. פתיחת תהליך שטרם נפתח — דרך הפונקציה הקיימת (יומן + אידמפוטנטיות שלה)
  for e in
    select id from public.engagements
     where client_id = c.id and status = 'onboarding' and process_published_at is null
  loop
    r := public.publish_onboarding_process(e.id);
    if coalesce((r->>'ok')::boolean, false) and not coalesce((r->>'alreadyPublished')::boolean, false) then
      v_opened := v_opened + 1;
    end if;
  end loop;

  -- 2. סידור ממתין (מיגרציה 101)
  update public.onboarding_steps
     set sort_order = pending_sort_order,
         pending_sort_order = null
   where client_id = c.id and pending_sort_order is not null;
  get diagnostics v_ordered = row_count;

  -- 3. עריכות ממתינות על בקשות קיימות
  for s in
    select * from public.onboarding_steps
     where client_id = c.id and draft_payload is not null and status <> 'cancelled'
  loop
    update public.onboarding_steps
       set payload = public.merge_step_draft(payload, draft_payload) - 'published',
           draft_payload = null
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
      'נוסח הבקשה עודכן ופורסם', jsonb_build_object('editApplied', true));
    v_edits := v_edits + 1;
  end loop;

  -- 4. הסרות ממתינות (מיגרציה 101) — אותה סמנטיקה כמו advance_onboarding_step('cancel'),
  --    כולל פתיחת התלויים ורישום ביומן (167).
  for s in
    select * from public.onboarding_steps
     where client_id = c.id and pending_cancel = true and status <> 'cancelled'
  loop
    update public.onboarding_steps set pending_cancel = false where id = s.id;
    perform public._set_step_status(s.id, 'cancelled', 'accountant',
      'הבקשה הוסרה בעדכון דף הלקוח', jsonb_build_object('pendingCancel', true));
    v_removed := v_removed + 1;
  end loop;

  -- 5א. 249 · שאלון תיק המס («השלמת מידע»): אותו נתיב כמו «פרסם את השאלות בדף» — publish_tax_info מפרסם את
  --     טיוטת השאלות ומסמן את הבקשה. כך «פרסם בדף» לא חושף שאלון בלי שאלות, ושאלות שנוספו לשאלון שכבר בדף
  --     (טיוטה) יוצאות באותה לחיצה. ‼ שאלון בלי שאלה אחת — לא נחשף (הכרטיס היה ריק). בלי מייל, כמו תמיד.
  for s in
    select st.id, st.user_id, st.engagement_id, st.published_at from public.onboarding_steps st
     where st.client_id = c.id and st.step_type = 'info_collection'
       and st.status not in ('completed', 'verified', 'skipped', 'cancelled', 'failed')
       and exists (select 1 from public.tax_info_asks a where a.step_id = st.id and a.state = 'draft')
  loop
    r := public.publish_tax_info(s.id);
    if coalesce((r->>'ok')::boolean, false) then
      v_asks := v_asks + coalesce((r->>'published')::int, 0);
      if s.published_at is null then
        perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
          'הבקשה נפתחה ללקוח', jsonb_build_object('published', true, 'taxQuestions', (r->>'published')::int));
        v_exposed := v_exposed + 1;
      end if;
    end if;
  end loop;

  -- 5. חשיפת טיוטות
  for s in
    select * from public.onboarding_steps
     where client_id = c.id and published_at is null and status <> 'cancelled'
       -- 216: שלב «הכול באישורך» שעוד לא נפתח - מתפרסם כשהשלב נפתח, לא לפני.
       and not (status = 'locked' and coalesce(payload->>'delivery', '') = 'hold')
       -- 249: שאלון תיק המס — רק דרך 5א (עם השאלות שלו). בלי שאלות — נשאר טיוטה.
       and step_type <> 'info_collection'
  loop
    update public.onboarding_steps
       set published_at = now(),
           payload = payload - 'published'
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
      'הבקשה נפתחה ללקוח', jsonb_build_object('published', true));
    v_exposed := v_exposed + 1;
  end loop;

  -- 6. הערכה-מחדש אחרי חימוש (D3 §5, מיגרציה 83) — תצורה אוטומטית שפורסמה
  -- עכשיו, ושכל תנאיה כבר מולאו, מתבצעת בדיוק פעם אחת (התביעה בפונקציית השליחה).
  for s in
    select id from public.onboarding_steps
     where client_id = c.id
       and status in ('pending', 'in_progress')
       and payload->'autoAction'->>'kind' = 'email'
       and payload->>'autoExecutedAt' is null
  loop
    r := public.execute_automatic_step(s.id);
    if coalesce((r->>'ok')::boolean, false) then v_auto := v_auto + 1; end if;
  end loop;

  return jsonb_build_object('ok', true,
    'processOpened', v_opened, 'ordered', v_ordered, 'editsApplied', v_edits,
    'removed', v_removed, 'draftsExposed', v_exposed, 'autoQueued', v_auto, 'taxQuestionsPublished', v_asks);
end;
$function$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 249ב · פריטים חדשים בשאלון (16.10.2026) — שמונה מפתחות חדשים ברשימת הפריטים (בלי שינוי בקיימים):
--   דמי לידה: niBenefits.maternity · maternityPeriod · maternityAmounts · maternityNotice · maternitySpread (פריט משרד).
--   ממתי המצב המשפחתי (קליטה): intake.marriageYear · intake.divorceYear · intake.widowhoodYear.
-- ‼ הרשימה נוצרת מהקטלוג בקוד: node scripts/sql/230/fill-items.mjs <items.json> 249. לא לערוך ידנית.
-- ‼ חזרה: scripts/sql/249/rollback-249.sql מחזיר את הרשימה של 241.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '{
    "household.maritalAtYearEnd":"confirm","household.children":"confirm","household.childDeferral":"detail","household.settlement":"confirm",
    "household.degree":"confirm","household.release":"confirm","household.creditChanges":"screener","household.degreeDocs":"document",
    "household.creditEmployer":"detail","household.alimonyPaid":"amount","salary.worked":"screener","salary.employers":"confirm",
    "salary.spouseIncomeEstimate":"amount","salary.form106":"document","salary.employerDetails":"detail","salary.payslipToDate":"document",
    "salary.amounts":"amount","business.active":"confirm","business.books":"document","business.profit":"amount",
    "business.selfDeposits":"amount","business.assetsChanged":"screener","business.assetDocs":"document","business.depreciation":"document",
    "business.inventory":"screener","business.inventoryCount":"document","business.employees":"screener","business.payrollReport":"document",
    "business.badDebts":"screener","business.badDebtDocs":"document","business.vehicle":"screener","business.vehicleDetails":"detail",
    "business.vehicleLicense":"document","business.vehicleExpenses":"amount","business.partnership":"screener","business.partnershipDocs":"document",
    "business.partners":"detail","business.rentsPremises":"screener","business.premisesLease":"document","business.priorDepreciation":"document",
    "business.microRegistration":"document","business.microTrack":"amount","business.microExclusions":"screener","business.microCoordination":"document",
    "business.forecast":"amount","business.oneOffs":"amount","niBenefits.received":"screener","niBenefits.cert":"document",
    "niBenefits.maternity":"screener","niBenefits.maternityPeriod":"detail","niBenefits.maternityAmounts":"amount","niBenefits.maternityNotice":"document",
    "niBenefits.maternitySpread":"detail","rent.properties":"confirm","rent.income":"amount","rent.incomeTotal":"amount",
    "rent.expenses":"amount","rent.contract":"document","rent.track":"detail","rent.singleApartment":"screener",
    "rent.businessUse":"screener","rent.businessUseDocs":"document","rent.businessUseAmounts":"amount","rent.coOwned":"screener",
    "rent.coOwners":"detail","rent.keyMoney":"screener","rent.keyMoneyDocs":"document","rent.ownRent":"screener",
    "rent.ownRentDocs":"document","rent.otherProperty":"screener","rent.otherPropertyDocs":"document","capital.accounts":"confirm",
    "capital.form867":"document","capital.amounts":"amount","capital.owner":"detail","capital.relatedParty":"screener",
    "capital.totals":"amount","capital.estimate":"amount","sales.sold":"screener","sales.transaction":"detail",
    "sales.circumstances":"screener","sales.buyer":"detail","sales.expenseDocs":"document","sales.specialDeal":"screener",
    "sales.specialDocs":"document","sales.officeChecks":"detail","sales.docs":"document","foreign.income":"screener",
    "foreign.totals":"amount","foreign.sourceDetails":"detail","foreign.statements":"document","foreign.securitiesSold":"screener",
    "foreign.tradeReport":"document","foreign.taxCert":"document","foreign.amounts":"amount","foreign.work":"screener",
    "foreign.workDocs":"document","foreign.rentalProperty":"screener","foreign.leaseDocs":"document","foreign.company":"screener",
    "foreign.companyDocs":"document","foreign.owner":"detail","foreign.taxRefund":"screener","savings.selfDeposits":"screener",
    "savings.selfAmounts":"amount","savings.fundDetails":"detail","savings.fundCerts":"document","savings.depositsEstimate":"amount",
    "savings.insuranceAmounts":"amount","savings.insuranceCert":"document","savings.insurance":"screener","donations.given":"screener",
    "donations.amount":"amount","donations.receipts":"document","companies.controlled":"screener","payments.advances":"amount",
    "payments.withholding":"amount","payments.niPaid":"amount","carryForward.balances":"amount","special.otherIncome":"amount",
    "special.gambling":"amount","special.reserveCombatDays":"amount","special.trust":"screener","special.kibbutz":"screener",
    "special.reportablePosition":"screener","special.partnership":"screener","special.nonResident":"screener","special.moneyAbroad":"screener",
    "special.financialInstitution":"screener","filing.refundAccount":"detail","filing.declarations":"detail","filing.identity":"detail",
    "household.changesSince":"screener","salary.changesSince":"screener","business.changesSince":"screener","niBenefits.changesSince":"screener",
    "rent.changesSince":"screener","capital.changesSince":"screener","sales.changesSince":"screener","foreign.changesSince":"screener",
    "savings.changesSince":"screener","donations.changesSince":"screener","period.property":"detail","period.account":"detail",
    "wealth.period.property":"detail","wealth.period.account":"detail","wealth.household":"confirm","wealth.spouseSeparate":"detail",
    "wealth.realEstate.list":"confirm","wealth.realEstate.has":"screener","wealth.realEstate.details":"detail","wealth.realEstate.docs":"document",
    "wealth.realEstate.total":"amount","wealth.bank.accounts":"detail","wealth.bank.certs":"document","wealth.bank.foreign":"confirm",
    "wealth.bank.total":"amount","wealth.crypto.has":"screener","wealth.crypto.docs":"document","wealth.cash":"amount",
    "wealth.funds.list":"confirm","wealth.funds.has":"screener","wealth.funds.certs":"document","wealth.funds.total":"amount",
    "wealth.securities.list":"confirm","wealth.securities.has":"screener","wealth.securities.docs":"document","wealth.securities.total":"amount",
    "wealth.loansGiven.has":"screener","wealth.loansGiven.details":"detail","wealth.loansGiven.docs":"document","wealth.vehicles.has":"screener",
    "wealth.vehicles.details":"detail","wealth.vehicles.docs":"document","wealth.valuables.has":"screener","wealth.contents":"document",
    "wealth.mortgage.has":"screener","wealth.mortgage.docs":"document","wealth.loansReceived.has":"screener","wealth.loansReceived.details":"detail",
    "wealth.liabilities.total":"amount","wealth.business.books":"detail","wealth.companies.has":"screener","wealth.companies.docs":"document",
    "wealth.business.total":"amount","wealth.partD.has":"screener","wealth.partD.details":"detail","wealth.prevDeclaration":"document",
    "wealth.since.sources":"detail","wealth.since.uses":"detail","wealth.since.living":"detail","intake.family":"confirm",
    "intake.marriageYear":"detail","intake.divorceYear":"detail","intake.widowhoodYear":"detail","intake.children":"confirm",
    "intake.address":"confirm","intake.idCard":"document","intake.settlement":"confirm","intake.settlementCert":"document",
    "intake.credits":"screener","intake.creditDocs":"document","intake.special":"screener","intake.specialDocs":"document",
    "intake.employers":"confirm","intake.employed":"screener","intake.employerDetails":"detail","intake.payslip":"document",
    "intake.business":"confirm","intake.selfEmployed":"screener","intake.businessDetails":"detail","intake.businessCert":"document",
    "intake.bookkeeping":"detail","intake.rentals":"confirm","intake.rents":"screener","intake.propertyDetails":"detail",
    "intake.rentalContract":"document","intake.investments":"confirm","intake.hasInvestments":"screener","intake.accountDetails":"detail",
    "intake.foreign":"screener","intake.foreignDetails":"detail","intake.crypto":"screener","intake.funds":"confirm",
    "intake.selfDeposits":"screener","intake.fundDetails":"detail","intake.allowances":"screener","intake.allowanceDocs":"document",
    "intake.insurance":"screener","intake.insuranceDocs":"document","intake.prevReturns":"screener","intake.prevReturnDocs":"document",
    "intake.openIssues":"screener","intake.openIssueDocs":"document","intake.bankAccount":"confirm","intake.bankCert":"document",
    "intake.authorityAlignment":"screener"}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 249ג · שנת הנישואין / הגירושין / הפטירה — עובדות מנוהלות (16.10.2026)
-- «באיזו שנה התחתנתם?» (וכו׳) — תשובה מאושרת ⇒ «אשר ועדכן בתיק» (apply_tax_facts), עם הערך הקודם, המקור וההיסטוריה,
-- כמו המצב המשפחתי עצמו. נוספים שלושה ענפים ל-_tax_fact_field_op, באותה צורה כמו aliyahYear (94); ריק ⇒ NULL.
-- ‼ _governed_client_columns (182) נגזר מהגוף הזה ⇒ שלוש העמודות נעשות «מנוהלות», ו-update_client_fields דוחה אותן ב-p_patch.
--   לכן באותו שינוי הן נכנסות ל-GOVERNED_FACT_KEYS בדפדפן (types/taxFacts.ts) — כל עריכה רגילה עוברת ב-p_facts
--   (record_manual_fact_change), עם היסטוריה. בלי השינוי בדפדפן — עריכה רגילה של השנה נכשלת.
-- חזרה: scripts/sql/249/rollback-249.sql מוציא את הענפים.
-- ═══════════════════════════════════════════════════════════════════════════
do $p249c$
declare
  v_def text;
  v_nl text;
  a1 text := E'    when ''taxFiles'' then\n';
  n1 text := E'    -- 249 · שנות המצב המשפחתי מתשובה מאושרת בקליטה\n'
    || E'    when ''marriageYear'' then\n'
    || E'      select to_jsonb(marriage_year) into out_current from public.clients where id = p_client_id;\n'
    || E'      if p_write then update public.clients set marriage_year = nullif(p_value #>> ''{}'', '''')::integer, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    || E'    when ''divorceYear'' then\n'
    || E'      select to_jsonb(divorce_year) into out_current from public.clients where id = p_client_id;\n'
    || E'      if p_write then update public.clients set divorce_year = nullif(p_value #>> ''{}'', '''')::integer, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    || E'    when ''widowhoodYear'' then\n'
    || E'      select to_jsonb(widowhood_year) into out_current from public.clients where id = p_client_id;\n'
    || E'      if p_write then update public.clients set widowhood_year = nullif(p_value #>> ''{}'', '''')::integer, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tax_fact_field_op';
  if v_def is null then raise exception '249ג: _tax_fact_field_op לא נמצאה'; end if;
  if position('249 · שנות המצב המשפחתי' in v_def) > 0 then raise notice '249ג: _tax_fact_field_op — כבר הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '249ג: עוגן taxFiles ב-_tax_fact_field_op לא נמצא פעם אחת'; end if;
  if v_def ~ E'when ''(marriageYear|divorceYear|widowhoodYear)'' then' then raise exception '249ג: ענף שנה כבר קיים בגרסה לא מוכרת'; end if;
  execute replace(v_def, a1, n1 || a1);
end
$p249c$;
revoke all on function public._tax_fact_field_op(text, text, boolean, jsonb, text) from public, anon, authenticated;
