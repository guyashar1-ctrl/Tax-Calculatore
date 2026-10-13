-- ════════════════════════════════════════════════════════════════════════════
-- 236 · קליטה והשלמת תיק המס — על תשתית שנת המס (229/230) — 12.10.2026
-- ════════════════════════════════════════════════════════════════════════════
-- הקוד שמקביל: src/features/taxYear/intakeCatalog.ts (פריטים), picture.ts / asks.ts (תכלית 'intake'),
-- src/lib/taxYearProcesses.ts (TAX_FILE_INTAKE_PROCESS — התהליך הידני).
--
-- ‼ מסלול שלם בפני עצמו, בלי דוח שנתי: תשובות → שאלות המשך → מסמכים → העלאה / «אין לי עדיין» → בדיקת
--   משרד → «החזר לתיקון» / אישור → עדכון התיק. אותם RPC של 229 («השלמת מידע» בדף האישי, ראיות, אישור).
-- ‼ עובדה = «נכון ליום הקליטה» (period_kind = as_of, period_to = payload.asOfDate) — לא שנה ולא יום הצהרה.
-- ‼ הכרטיס לא נכתב כאן. מה שאושר נכנס לכרטיס רק דרך הצעה (propose/apply_tax_facts, עם הערך הקודם והמקור).
-- ‼ בקשה פתוחה אחת ללקוח (אינדקס ייחודי + נעילה). פריט קליטה רק בקליטה; פריט שנה/הון — רק שם (חסום בשרת).
-- ‼ תלוי ב-229 ו-230, בסדר הזה: 229 → 230 → 236. החלה חוזרת של 229 מאפסת את ההזרקות של 230 ושל 236 —
--   להחיל שוב 230 ואחריה 236. החלה חוזרת של 236 לבדה — בטוחה (מזהה את הסימון ומדלגת).
-- ‼ אין כאן מחיקה או עדכון של נתונים קיימים. אינדקס, אילוץ, שתי פונקציות חדשות (פתיחה; «החלף את השאלון הישן»,
--   שמבטלת רק כשהמשרד בוחר) והזרקות מסומנות (כולל: המחולל לא יוצר שאלון ישן כשיש קליטה פתוחה;
--   והשאלון הישן שהוחלף נעצר בשרת — start_intake / save_intake_answer / reopen_intake, סעיף 6).
-- בידוד: scripts/sql/236/test-236-intake.pglite.mjs. התאוששות: scripts/sql/236/rollback-236.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. תנאי מוקדם: 229 ו-230 הוחלו (כולל ההזרקות של 230). נבדק לפני כל שינוי — כדי שלא תישאר החלה חלקית ──
do $pre236$
begin
  if to_regprocedure('public.add_tax_info_asks(text, jsonb)') is null or to_regprocedure('public.ensure_wealth_declaration(text, date, text)') is null then
    raise exception '236: חסרות 229/230 — להחיל 229 ואחריה 230 לפני 236';
  end if;
  if pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) not like '%230b · פריט לפי תכלית%'
     or pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) not like '%230 · הצהרת הון%' then
    raise exception '236: ההזרקות של 230 חסרות (כנראה 229 הוחלה מחדש) — להחיל 230 לפני 236';
  end if;
end
$pre236$;

-- ── 1. סוג בקשה ─────────────────────────────────────────────────────────────
alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;
alter table public.onboarding_steps add constraint onboarding_steps_step_type_check
  check (step_type = any (array[
    'representation', 'file_opening', 'representation_upgrade', 'release_letter', 'rep_client_approval',
    'materials_received', 'paperless_invite', 'paperless_connection', 'paperless_tax_authority',
    'data_import', 'data_verification', 'retainer_authorization', 'internal_setup', 'kyc_identification',
    'first_month_review', 'intake_questionnaire', 'client_documents', 'prev_accountant_details',
    'custom_request', 'institution_alignment_btl', 'institution_alignment_vat',
    'institution_alignment_income', 'opening_call', 'authority_representation',
    'business_details',
    'tax_estimate', 'annual_return', 'info_collection',
    'wealth_declaration',
    -- 236
    'tax_file_intake']));

drop index if exists public.onboarding_steps_person_type_idx;
create unique index onboarding_steps_person_type_idx on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status <> 'cancelled'
    and step_type <> all (array['custom_request', 'authority_representation', 'client_documents',
      'prev_accountant_details', 'release_letter', 'materials_received', 'intake_questionnaire',
      'retainer_authorization', 'business_details',
      'tax_estimate', 'annual_return', 'info_collection', 'wealth_declaration', 'tax_file_intake']);

-- קליטה פתוחה אחת לכל לקוח (קליטות שהושלמו — היסטוריה; קליטה חדשה אחרי סגירה מותרת)
create unique index if not exists onboarding_steps_tax_file_intake_open_idx
  on public.onboarding_steps (client_id)
  where step_type = 'tax_file_intake'
    and status <> all (array['completed', 'verified', 'skipped', 'cancelled', 'failed']);

-- ── 2. קטלוג הפריטים — 229 + 230 + פריטי הקליטה. נוצר מהקוד (scripts/sql/230/fill-items.mjs <items.json> 236) ──
-- ‼ 236 הוא הבעלים של הרשימה מעכשיו. החלה חוזרת של 229 או 230 אחרי 236 תמחק את פריטי הקליטה — להחיל 236 שוב.
create or replace function public._tax_year_items()
returns jsonb language sql immutable as $$
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
    "rent.properties":"confirm","rent.income":"amount","rent.incomeTotal":"amount","rent.expenses":"amount",
    "rent.contract":"document","rent.track":"detail","rent.singleApartment":"screener","rent.businessUse":"screener",
    "rent.businessUseDocs":"document","rent.businessUseAmounts":"amount","rent.coOwned":"screener","rent.coOwners":"detail",
    "rent.keyMoney":"screener","rent.keyMoneyDocs":"document","rent.ownRent":"screener","rent.ownRentDocs":"document",
    "rent.otherProperty":"screener","rent.otherPropertyDocs":"document","capital.accounts":"confirm","capital.form867":"document",
    "capital.amounts":"amount","capital.owner":"detail","capital.relatedParty":"screener","capital.totals":"amount",
    "capital.estimate":"amount","sales.sold":"screener","sales.transaction":"detail","sales.circumstances":"screener",
    "sales.buyer":"detail","sales.expenseDocs":"document","sales.specialDeal":"screener","sales.specialDocs":"document",
    "sales.officeChecks":"detail","sales.docs":"document","foreign.income":"screener","foreign.totals":"amount",
    "foreign.sourceDetails":"detail","foreign.statements":"document","foreign.securitiesSold":"screener","foreign.tradeReport":"document",
    "foreign.taxCert":"document","foreign.amounts":"amount","foreign.work":"screener","foreign.workDocs":"document",
    "foreign.rentalProperty":"screener","foreign.leaseDocs":"document","foreign.company":"screener","foreign.companyDocs":"document",
    "foreign.owner":"detail","foreign.taxRefund":"screener","savings.selfDeposits":"screener","savings.selfAmounts":"amount",
    "savings.fundDetails":"detail","savings.fundCerts":"document","savings.depositsEstimate":"amount","savings.insuranceAmounts":"amount",
    "savings.insuranceCert":"document","savings.insurance":"screener","donations.given":"screener","donations.amount":"amount",
    "donations.receipts":"document","companies.controlled":"screener","payments.advances":"amount","payments.withholding":"amount",
    "payments.niPaid":"amount","carryForward.balances":"amount","special.otherIncome":"amount","special.gambling":"amount",
    "special.reserveCombatDays":"amount","special.trust":"screener","special.kibbutz":"screener","special.reportablePosition":"screener",
    "special.partnership":"screener","special.nonResident":"screener","special.moneyAbroad":"screener","special.financialInstitution":"screener",
    "filing.refundAccount":"detail","filing.declarations":"detail","filing.identity":"detail","household.changesSince":"screener",
    "salary.changesSince":"screener","business.changesSince":"screener","niBenefits.changesSince":"screener","rent.changesSince":"screener",
    "capital.changesSince":"screener","sales.changesSince":"screener","foreign.changesSince":"screener","savings.changesSince":"screener",
    "donations.changesSince":"screener","wealth.household":"confirm","wealth.spouseSeparate":"detail","wealth.realEstate.list":"confirm",
    "wealth.realEstate.has":"screener","wealth.realEstate.details":"detail","wealth.realEstate.docs":"document","wealth.realEstate.total":"amount",
    "wealth.bank.accounts":"detail","wealth.bank.certs":"document","wealth.bank.foreign":"confirm","wealth.bank.total":"amount",
    "wealth.crypto.has":"screener","wealth.crypto.docs":"document","wealth.cash":"amount","wealth.funds.list":"confirm",
    "wealth.funds.has":"screener","wealth.funds.certs":"document","wealth.funds.total":"amount","wealth.securities.list":"confirm",
    "wealth.securities.has":"screener","wealth.securities.docs":"document","wealth.securities.total":"amount","wealth.loansGiven.has":"screener",
    "wealth.loansGiven.details":"detail","wealth.loansGiven.docs":"document","wealth.vehicles.has":"screener","wealth.vehicles.details":"detail",
    "wealth.vehicles.docs":"document","wealth.valuables.has":"screener","wealth.contents":"document","wealth.mortgage.has":"screener",
    "wealth.mortgage.docs":"document","wealth.loansReceived.has":"screener","wealth.loansReceived.details":"detail","wealth.liabilities.total":"amount",
    "wealth.business.books":"detail","wealth.companies.has":"screener","wealth.companies.docs":"document","wealth.business.total":"amount",
    "wealth.partD.has":"screener","wealth.partD.details":"detail","wealth.prevDeclaration":"document","wealth.since.sources":"detail",
    "wealth.since.uses":"detail","wealth.since.living":"detail","intake.family":"confirm","intake.children":"confirm",
    "intake.idCard":"document","intake.settlement":"confirm","intake.settlementCert":"document","intake.credits":"screener",
    "intake.creditDocs":"document","intake.special":"screener","intake.specialDocs":"document","intake.employers":"confirm",
    "intake.employed":"screener","intake.employerDetails":"detail","intake.payslip":"document","intake.business":"confirm",
    "intake.selfEmployed":"screener","intake.businessDetails":"detail","intake.businessCert":"document","intake.bookkeeping":"detail",
    "intake.rentals":"confirm","intake.rents":"screener","intake.propertyDetails":"detail","intake.rentalContract":"document",
    "intake.investments":"confirm","intake.hasInvestments":"screener","intake.accountDetails":"detail","intake.foreign":"screener",
    "intake.foreignDetails":"detail","intake.crypto":"screener","intake.funds":"confirm","intake.selfDeposits":"screener",
    "intake.fundDetails":"detail","intake.allowances":"screener","intake.allowanceDocs":"document","intake.insurance":"screener",
    "intake.insuranceDocs":"document","intake.prevReturns":"screener","intake.prevReturnDocs":"document","intake.openIssues":"screener",
    "intake.openIssueDocs":"document","intake.bankAccount":"confirm","intake.bankCert":"document","intake.authorityAlignment":"screener"}'::jsonb
$$;

-- ── 3. פתיחה (אידמפוטנטית) ──────────────────────────────────────────────────
create or replace function public.ensure_tax_file_intake(p_client_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c        public.clients%rowtype;
  v_id     text;
  v_as_of  date := current_date;
  v_legacy_step text;
  v_payload jsonb;
begin
  c := public._tax_year_client(p_client_id);
  -- שתי לשוניות / לחיצה כפולה: נעילה לזהות, ואחריה בדיקה
  perform pg_advisory_xact_lock(hashtext('tax_file_intake:' || p_client_id));
  select id into v_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'tax_file_intake'
     and status <> all (array['completed','verified','skipped','cancelled','failed'])
   limit 1;
  if v_id is not null then return jsonb_build_object('ok', true, 'stepId', v_id, 'created', false); end if;

  -- ‼ השאלון הישן («עדכון סטטוס מס») שעדיין פתוח — מקשרים, כדי לא לשאול פעמיים את הפרטים הקבועים
  select id into v_legacy_step from public.onboarding_steps
   where client_id = p_client_id and step_type = 'intake_questionnaire'
     and status <> all (array['completed','verified','skipped','cancelled','failed']) limit 1;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'purpose', 'intake', 'asOfDate', v_as_of, 'taxYear', extract(year from v_as_of)::int,
    'title', 'קליטה והשלמת תיק המס', 'legacyStepId', v_legacy_step,
    'history', jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'what', 'opened'))));
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (c.user_id, p_client_id, 'tax_file_intake', 'internal', 'person', 'in_progress', 'me', v_payload, now())
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.onboarding_steps
     where client_id = p_client_id and step_type = 'tax_file_intake'
       and status <> all (array['completed','verified','skipped','cancelled','failed']) limit 1;
    return jsonb_build_object('ok', true, 'stepId', v_id, 'created', false);
  end if;
  return jsonb_build_object('ok', true, 'stepId', v_id, 'created', true);
end $$;

revoke all on function public.ensure_tax_file_intake(text) from public, anon;
grant execute on function public.ensure_tax_file_intake(text) to authenticated;

-- ── 4. «השלמת מידע» לקליטה — הזרקה מבוקרת לגופי 229/230 ─────────────────────────
-- ‼ עוגן אחד בדיוק לכל החלפה, אחרת נכשל (לא מנחשים); החלה חוזרת מזהה את הסימון «236 · קליטה» ומדלגת.
do $p236$
declare
  v_def text;
  v_a text; v_n text;
begin
  -- add_tax_info_asks: בקשת־אב מסוג קליטה; כותרת לבקשת־הבת; פריט קליטה רק בקליטה (ופריט אחר — לא בקליטה)
  v_def := pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure);
  if v_def not like '%236 · קליטה%' then
    if v_def not like '%230 · הצהרת הון%' or v_def not like '%230b · פריט לפי תכלית%' then
      raise exception '236: add_tax_info_asks בלי ההזרקות של 230 — להחיל 230 לפני 236';
    end if;
    v_a := E'par.step_type not in (''tax_estimate'',''annual_return'',''wealth_declaration'') /* 230 · הצהרת הון */';
    v_n := E'par.step_type not in (''tax_estimate'',''annual_return'',''wealth_declaration'',''tax_file_intake'') /* 230 · הצהרת הון */ /* 236 · קליטה */';
    if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '236: עוגן סוג בקשת־האב ב-add_tax_info_asks'; end if;
    v_def := replace(v_def, v_a, v_n);
    v_a := E'''title'', case when par.step_type = ''wealth_declaration'' then ''השלמת מידע להצהרת הון'' else ''השלמת מידע לשנת '' || v_year end))';
    v_n := E'''title'', case when par.step_type = ''wealth_declaration'' then ''השלמת מידע להצהרת הון'' when par.step_type = ''tax_file_intake'' then ''השלמת פרטים לתיק המס'' else ''השלמת מידע לשנת '' || v_year end))';
    if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '236: עוגן הכותרת ב-add_tax_info_asks'; end if;
    v_def := replace(v_def, v_a, v_n);
    v_a := E'where ((z->>''itemKey'') like ''wealth.%'') <> (par.step_type = ''wealth_declaration'')) then';
    v_n := E'where ((z->>''itemKey'') like ''wealth.%'') <> (par.step_type = ''wealth_declaration'')\n                or ((z->>''itemKey'') like ''intake.%'') <> (par.step_type = ''tax_file_intake'')) then';
    if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '236: עוגן בדיקת התכלית ב-add_tax_info_asks'; end if;
    execute replace(v_def, v_a, v_n);
  end if;

  -- portal_submit_tax_info: תשובה לקליטה = «נכון ליום הקליטה» (אותו מבנה כמו הצהרת הון)
  v_def := pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure);
  if v_def not like '%236 · קליטה%' then
    v_a := E'v_per := case when v_ins->>''purpose'' = ''wealth'' /* 230 · הצהרת הון */';
    v_n := E'v_per := case when v_ins->>''purpose'' in (''wealth'', ''intake'') /* 230 · הצהרת הון */ /* 236 · קליטה */';
    if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '236: עוגן התקופה ב-portal_submit_tax_info (להחיל 230 לפני 236)'; end if;
    execute replace(v_def, v_a, v_n);
  end if;
end
$p236$;

-- ── 5. השאלון הישן («עדכון סטטוס מיסויי») מול הקליטה — בלי כפילות ─────────────────────
-- ‼ 12.10.2026 (גיא: «הסדר את החפיפה בתוך המערכת … שמור בקשות ותשובות קיימות»):
--   · «החלף בקליטה» — המשרד בוחר במפורש (לא אוטומטי). השאלון הישן מבוטל באותה דרך שבה «הסר» מבטל
--     (advance_onboarding_step 'cancel', עם הערה), ומסומן replacedBy. התשובות שכבר נתן הלקוח אינן נמחקות:
--     הן בסשן השאלון, והמסך קולט אותן כהצעות לאישור בתיק המס לפני הקריאה הזו (syncIntakeSession).
--   · ביטול = «הוסר בידי המשרד» גם בעיני המחולל (step_removed_by_office) — הוא לא ייצור אותו שוב להתקשרות.
--   · כל עוד יש קליטה פתוחה, המחולל לא יוצר שאלון ישן חדש (הזרקה ב-add_intake_questionnaire_step, למטה).
create or replace function public.replace_legacy_intake(p_intake_step_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  s        public.onboarding_steps%rowtype;
  v_legacy public.onboarding_steps%rowtype;
  v_res    jsonb;
begin
  select * into s from public.onboarding_steps where id = p_intake_step_id and step_type = 'tax_file_intake' for update;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  perform public._tax_year_client(s.client_id);   -- הרשאה: הלקוח של המשרד המחובר (אחרת חריגה)
  if s.status = any (array['completed','verified','skipped','cancelled','failed']) then
    return jsonb_build_object('ok', false, 'error', 'intake_closed');
  end if;
  select * into v_legacy from public.onboarding_steps
   where client_id = s.client_id and step_type = 'intake_questionnaire'
     and status <> all (array['completed','verified','skipped','cancelled','failed'])
   order by created_at desc limit 1 for update;
  if v_legacy.id is null then return jsonb_build_object('ok', true, 'replaced', false); end if;

  v_res := public.advance_onboarding_step(v_legacy.id, 'cancel', jsonb_build_object('note', 'הוחלף בקליטה והשלמת תיק המס'));
  if coalesce((v_res->>'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'error', 'cancel_failed', 'detail', v_res);
  end if;
  update public.onboarding_steps
     set payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('replacedBy', s.id, 'replacedAt', now())
   where id = v_legacy.id;
  update public.onboarding_steps
     set payload = payload
       || jsonb_build_object('legacyReplaced', jsonb_build_object('stepId', v_legacy.id, 'at', now(), 'by', auth.uid()))
       || jsonb_build_object('history', coalesce(payload->'history', '[]'::jsonb)
            || jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'what', 'legacy_replaced', 'stepId', v_legacy.id)))
   where id = s.id;
  return jsonb_build_object('ok', true, 'replaced', true, 'legacyStepId', v_legacy.id);
end $$;

revoke all on function public.replace_legacy_intake(text) from public, anon;
grant execute on function public.replace_legacy_intake(text) to authenticated;

-- המחולל: קליטה פתוחה מכסה את השאלון הישן — לא יוצרים שני מסלולים לאותו לקוח.
-- ‼ עוגן אחד בדיוק, אחרת נכשל; סביבה בלי הפונקציה (בידוד) — מדלג בהודעה.
do $p236b$
declare
  v_def text;
  v_a text; v_n text;
begin
  if to_regprocedure('public.add_intake_questionnaire_step(text)') is null then
    raise notice '236/5: add_intake_questionnaire_step חסרה — מדלג (סביבת בידוד)';
    return;
  end if;
  v_def := pg_get_functiondef('public.add_intake_questionnaire_step(text)'::regprocedure);
  if v_def like '%236 · קליטה פתוחה%' then return; end if;
  v_a := E'  if public.step_removed_by_office(e.client_id, ''intake_questionnaire'', e.id) then';
  v_n := E'  -- 236 · קליטה פתוחה מכסה את השאלון הישן\n  if exists (select 1 from public.onboarding_steps t where t.client_id = e.client_id and t.step_type = ''tax_file_intake''\n             and t.status <> all (array[''completed'',''verified'',''skipped'',''cancelled'',''failed''])) then\n    return jsonb_build_object(''ok'', true, ''skipped'', ''covered_by_tax_file_intake'');\n  end if;\n  if public.step_removed_by_office(e.client_id, ''intake_questionnaire'', e.id) then';
  if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '236/5: עוגן ב-add_intake_questionnaire_step'; end if;
  execute replace(v_def, v_a, v_n);
end
$p236b$;

-- ── 6. קישור השאלון הישן אחרי «החלף בקליטה» — בלי מילוי כפול, אכיפה בשרת ──────────────
-- ‼ 12.10.2026 (גיא): «הקישור הישן צריך להציג שהשאלון הוחלף ולהוביל למסלול הפעיל … האכיפה גם בשרת».
--   · מצב «הוחלף» = לשאלון הישן האחרון של הלקוח יש replacedBy ואין שאלון ישן פתוח שנוצר אחריו
--     (שאלון ישן חדש שהמשרד יוצר אחר כך — עובד כרגיל).
--   · start_intake / save_intake_answer / reopen_intake — נעצרים בשרת (גם מלשונית שכבר פתוחה בדפדפן).
--     התשובות הקודמות וההיסטוריה (annual_report_answers, הסשן) לא נוגעות: שום דבר לא נמחק.
--   · intake_replaced_state(token) — לדף הישן: «הוחלף», ומה הקישור לדף האישי (רק טוקן בתוקף; לא נוצר טוקן חדש מכאן).
create or replace function public._legacy_intake_replaced(p_client_id text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('stepId', s.id, 'replacedBy', s.payload->>'replacedBy', 'at', s.payload->>'replacedAt')
    from public.onboarding_steps s
   where s.client_id = p_client_id and s.step_type = 'intake_questionnaire' and s.status = 'cancelled'
     and s.payload ? 'replacedBy'
     and not exists (select 1 from public.onboarding_steps o
                      where o.client_id = p_client_id and o.step_type = 'intake_questionnaire'
                        and o.status <> 'cancelled' and o.created_at > s.created_at)
   order by s.created_at desc limit 1;
$$;
revoke all on function public._legacy_intake_replaced(text) from public, anon, authenticated;

create or replace function public.intake_replaced_state(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  t record;
  r jsonb;
  c public.clients%rowtype;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  r := public._legacy_intake_replaced(t.client_id);
  if r is null then return jsonb_build_object('ok', true, 'replaced', false); end if;
  select * into c from public.clients where id = t.client_id;
  return jsonb_build_object('ok', true, 'replaced', true, 'at', r->>'at',
    'portalToken', case when c.portal_token is not null and (c.portal_token_expires_at is null or c.portal_token_expires_at > now())
                        then c.portal_token end);
end $$;
revoke all on function public.intake_replaced_state(text) from public;
grant execute on function public.intake_replaced_state(text) to anon, authenticated;

-- הזרקה מבוקרת: שורת העוגן — זו שאחרי פתרון הטוקן, פעם אחת בדיוק בכל פונקציה; החלה חוזרת מזהה את הסימון.
do $p236c$
declare
  v_def text;
  v_a text; v_n text;
begin
  if to_regprocedure('public.start_intake(text)') is null then
    raise notice '236/6: start_intake חסרה — מדלג (סביבת בידוד)';
  else
    v_def := pg_get_functiondef('public.start_intake(text)'::regprocedure);
    if v_def not like '%236 · שאלון שהוחלף%' then
      v_a := E'  if t.client_id is null then\n    raise exception ''invalid token'';\n  end if;';
      v_n := E'  if t.client_id is null then\n    raise exception ''invalid token'';\n  end if;\n  -- 236 · שאלון שהוחלף בקליטה: לא נפתח שוב — ההמשך בדף האישי\n  if public._legacy_intake_replaced(t.client_id) is not null then\n    raise exception ''intake_replaced'';\n  end if;';
      if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '236/6: עוגן ב-start_intake'; end if;
      execute replace(v_def, v_a, v_n);
    end if;
  end if;

  if to_regprocedure('public.save_intake_answer(text, uuid, text, jsonb, jsonb, text, boolean)') is null then
    raise notice '236/6: save_intake_answer חסרה — מדלג (סביבת בידוד)';
  else
    v_def := pg_get_functiondef('public.save_intake_answer(text, uuid, text, jsonb, jsonb, text, boolean)'::regprocedure);
    if v_def not like '%236 · שאלון שהוחלף%' then
      v_a := E'  if t.client_id is null then return false; end if;';
      v_n := E'  if t.client_id is null then return false; end if;\n  if public._legacy_intake_replaced(t.client_id) is not null then return false; end if; -- 236 · שאלון שהוחלף בקליטה';
      if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '236/6: עוגן ב-save_intake_answer'; end if;
      execute replace(v_def, v_a, v_n);
    end if;
  end if;

  if to_regprocedure('public.reopen_intake(text)') is null then
    raise notice '236/6: reopen_intake חסרה — מדלג (סביבת בידוד)';
  else
    v_def := pg_get_functiondef('public.reopen_intake(text)'::regprocedure);
    if v_def not like '%236 · שאלון שהוחלף%' then
      v_a := E'  if t.client_id is null then return false; end if;';
      v_n := E'  if t.client_id is null then return false; end if;\n  if public._legacy_intake_replaced(t.client_id) is not null then return false; end if; -- 236 · שאלון שהוחלף בקליטה';
      if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '236/6: עוגן ב-reopen_intake'; end if;
      execute replace(v_def, v_a, v_n);
    end if;
  end if;
end
$p236c$;
