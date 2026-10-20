-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 267 · שאלון הדוח השנתי — מחדש (20.10.2026; ההמחשה המאושרת: docs/proposals/2026-10-20-annual-questionnaire-v2.html)
-- ‼ נוצר ב-scripts/sql/267/build.mjs. לא לערוך ביד. חזרה: scripts/sql/267/rollback-267.sql.
-- ‼ מה כאן (רק השרת; השאר — בקוד האתר):
--   1. _tax_year_items: 293 פריטים (287 ב-265; חדשים: 6): niBenefits.kinds, niBenefits.kindUnemployment, niBenefits.kindReserve, niBenefits.kindInjury, niBenefits.kindDisability, niBenefits.kindOther.
--      «מה שולם מביטוח לאומי?» — בחירה לכל אדם במקום «האם מתוך זה קיבל/ה דמי לידה?» (גיא: אלמן נשאל «דמי לידה»).
--   2. portal_submit_tax_info: (א) הערה «משהו לא נכון?» עם התשובה לריבועים ⇒ office_note; (ב) אחרי שם מעסיק חדש — המסמך
--      נקרא «טופס 106 מ{השם}» (גיא: «שהשמות יהיו יותר ברורים — 106 מ-X»). החלפת גוף בשני עוגנים, בלי סכמה ובלי נתונים.
-- ‼ «הכול נשמר כטיוטה עד שליחה» — בדף עצמו (TaxInfoFlow); השרת לא משתנה בזה: התשובות נשלחות בלחיצה «שליחה למשרד».
-- ════════════════════════════════════════════════════════════════════════════════════════════════
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
    "wealth.period.property":"detail","wealth.period.account":"detail","annual.whatHappened":"screener","niBenefits.kinds":"detail",
    "niBenefits.kindUnemployment":"screener","niBenefits.kindReserve":"screener","niBenefits.kindInjury":"screener","niBenefits.kindDisability":"screener",
    "niBenefits.kindOther":"screener","salary.equity":"screener","salary.equityDocs":"document","pension.received":"screener",
    "pension.certs":"document","special.disability":"screener","special.disabilityCert":"document","rent.newRental":"screener",
    "capital.newAccount":"screener","household.familyChange":"screener","household.familyEvent":"detail","family.eventDeath":"screener",
    "family.eventDivorce":"screener","family.eventMarriage":"screener","family.death":"detail","family.deathIncome":"detail",
    "family.deathGotSalary":"screener","family.deathGotPension":"screener","family.deathGotNi":"screener","family.deathGotDisabilityIns":"screener",
    "family.disabilityInsDocs":"document","family.deathPayouts":"detail","family.payoutSeverance":"screener","family.payoutLifeIns":"screener",
    "family.payoutFund":"screener","family.payoutMortgage":"screener","family.payoutSickDays":"screener","family.sickPayDocs":"document",
    "family.pensionCapitalized":"detail","family.capitalizationDocs":"document","family.survivorPaidWhen":"detail","family.survivorDocsState":"document",
    "family.survivorDocsBtl":"document","family.severanceDocs":"document","family.payoutDocs":"document","family.survivorPensions":"detail",
    "family.survivorFromFund":"screener","family.survivorFromState":"screener","family.survivorFromBtl":"screener","family.deathDocs":"document",
    "family.survivorDocs":"document","family.divorce":"detail","family.divorceDocs":"document","family.marriage":"detail",
    "family.marriageSpouseDocs":"document","annual.officeDecision":"detail","wealth.household":"confirm","wealth.spouseSeparate":"detail",
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
    "wealth.since.sources":"detail","wealth.since.uses":"detail","wealth.since.living":"detail","intake.whatYouHave":"screener",
    "intake.family":"confirm","intake.marriageYear":"detail","intake.divorceYear":"detail","intake.widowhoodYear":"detail",
    "intake.children":"confirm","intake.address":"confirm","intake.idCard":"document","intake.settlement":"confirm",
    "intake.settlementCert":"document","intake.credits":"screener","intake.creditDocs":"document","intake.special":"screener",
    "intake.specialDocs":"document","intake.employers":"confirm","intake.employed":"screener","intake.employerDetails":"detail",
    "intake.payslip":"document","intake.business":"confirm","intake.selfEmployed":"screener","intake.businessDetails":"detail",
    "intake.businessCert":"document","intake.bookkeeping":"detail","intake.rentals":"confirm","intake.rents":"screener",
    "intake.propertyDetails":"detail","intake.rentalContract":"document","intake.investments":"confirm","intake.hasInvestments":"screener",
    "intake.accountDetails":"detail","intake.foreign":"screener","intake.foreignDetails":"detail","intake.crypto":"screener",
    "intake.cryptoDetails":"detail","intake.funds":"confirm","intake.selfDeposits":"screener","intake.fundDetails":"detail",
    "intake.allowances":"screener","intake.allowanceDetails":"detail","intake.allowanceDocs":"document","intake.insurance":"screener",
    "intake.insuranceDetails":"detail","intake.insuranceDocs":"document","intake.prevReturns":"screener","intake.prevReturnDocs":"document",
    "intake.openIssues":"screener","intake.openIssueDocs":"document","intake.bankAccount":"confirm","intake.bankCert":"document",
    "intake.authorityAlignment":"screener"}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;

do $p1$
declare
  v_def text; v_nl text;
  a1 text := $blk$    return jsonb_build_object('ok', true, 'state', 'answered', 'opened', v_opened);
$blk$;
  n1 text := $blk$    -- 267 · «משהו לא נכון?» במסך «מה כבר ידוע לנו» — הערה למשרד על התשובה לריבועים, בלי לשנות את הכרטיס
    if nullif(btrim(coalesce(p_answer->>'note', '')), '') is not null then
      update public.tax_info_asks set office_note = left(btrim(p_answer->>'note'), 2000) where id = a.id;
    end if;
    return jsonb_build_object('ok', true, 'state', 'answered', 'opened', v_opened);
$blk$;
  a2 text := $blk$  -- 264 · «סבב אחד»: תשובה חיובית פותחת מיד את ההמשך שהוכן בתוך השאלה (prompt.onYes). קודם פותחים, ואז בודקים אם נשאר משהו פתוח.
$blk$;
  n2 text := $blk$  -- 267 · «טופס 106 מהמדינה»: כשהלקוח כתב את שם המעסיק החדש — המסמך שלו באותו שאלון נקרא בשמו (גיא, 20.10.2026).
  --   רק שאלה שעוד פתוחה; אותו אדם; אותה ישות (או מעסיק חדש בלי מזהה קבוע). השם — מה שהלקוח עצמו כתב.
  if a.item_key = 'salary.employerDetails' and v_kind = 'record' and jsonb_typeof(p_answer->'value'->'items') = 'array' then
    select string_agg(left(btrim(x->>'name'), 80), ' ומ') into v_txt from jsonb_array_elements(p_answer->'value'->'items') x
     where jsonb_typeof(x) = 'object' and nullif(btrim(coalesce(x->>'name', '')), '') is not null;
    if v_txt is not null then
      update public.tax_info_asks set prompt = jsonb_set(prompt, '{title}', to_jsonb('טופס 106 מ' || v_txt))
       where step_id = a.step_id and item_key = 'salary.form106' and state in ('published', 'unavailable')
         and (entity_ref is not distinct from a.entity_ref or (subject_role = a.subject_role and coalesce(entity_ref, '') ~ '-new-'));
    end if;
    v_txt := null;
  end if;
  -- 264 · «סבב אחד»: תשובה חיובית פותחת מיד את ההמשך שהוכן בתוך השאלה (prompt.onYes). קודם פותחים, ואז בודקים אם נשאר משהו פתוח.
$blk$;
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  if position('267 · «טופס 106 מהמדינה»' in v_def) > 0 then raise notice '267: portal_submit_tax_info — כבר הוחל'; return; end if;
  if position('264 · «סבב אחד»' in v_def) = 0 then raise exception '267: 264 לא הוחלה — להחיל 264 לפני 267'; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl); a2 := replace(a2, E'\n', v_nl); n2 := replace(n2, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '267: עוגן 1 לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then raise exception '267: עוגן 2 לא נמצא פעם אחת'; end if;
  execute replace(replace(v_def, a1, n1), a2, n2);
end
$p1$;

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select prosrc like '%267 · «טופס 106 מהמדינה»%' and prosrc like '%267 · «משהו לא נכון?»%' from pg_proc where proname = 'portal_submit_tax_info';
--   select public._tax_year_items() ? 'niBenefits.kinds';
