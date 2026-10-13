-- ════════════════════════════════════════════════════════════════════════════
-- 230 · הכנה להצהרת הון — תהליך איסוף על תשתית שנת המס (229) — 11.10.2026
-- ════════════════════════════════════════════════════════════════════════════
-- הקוד שמקביל: src/features/taxYear/wealthCatalog.ts (פריטים), picture.ts / asks.ts (תכלית 'wealth'),
-- src/lib/taxYearProcesses.ts (התהליך הידני). מחקר: docs/tax-foundation/wealth/.
--
-- ‼ איסוף בלבד: בקשה «הכנה להצהרת הון» ליום הצהרה, עם «השלמת מידע» בדף האישי, ראיות ואישור
--   המשרד — אותם RPC של 229. זה לא מילוי של טופס 1219, לא חישוב השוואת הון ולא הגשה.
-- ‼ עובדה = «נכון ליום ההצהרה» (period_kind = as_of, period_to = יום ההצהרה).
-- ‼ דרישה — שלושה מצבים: אין (הכנה בלי דרישה) · «reported» (מידע שטרם אומת — לא חוסם איסוף,
--   לא מוצג כמאומת) · «verified» (מקושר לאסמכתה: מסמך בתיק או רשומה שנקראה מהרשות, עם מי אישר
--   ומתי). המועדים נפרדים: «מועד בדרישה» (נקרא; המחייב, רק בדרישה מאומתת), «ארכה» (רשומה נפרדת),
--   «רצפה חוקית» (המערכת, _wealth_min_due — בקרה בלבד) ו«יעד פנימי» (של המשרד, בלי ברירת מחדל).
--   שינוי בדרישה מאומתת מבטל את האימות.
-- ‼ בסיס הרישום (קופות, רכוש עסקי, מט״ח) נשמר על הבקשה. שינוי מול ההצהרה הקודמת מחייב הסבר
--   ואישור מקצועי (מי ומתי) — נשמר בהיסטוריה; ההצהרה הקודמת נשמרת כפי שהוגשה.
-- ‼ תלוי ב-229. לא הוחל על שום סביבה. בידוד: scripts/sql/230/test-230-wealth.pglite.mjs.
-- ════════════════════════════════════════════════════════════════════════════

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
    -- 230
    'wealth_declaration',
    -- ‼ 12.10.2026: גם הסוג של 236 — כדי שהחלה חוזרת של 230 אחריה לא תיכשל על שורות קליטה קיימות
    'tax_file_intake']));

drop index if exists public.onboarding_steps_person_type_idx;
create unique index onboarding_steps_person_type_idx on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status <> 'cancelled'
    and step_type <> all (array['custom_request', 'authority_representation', 'client_documents',
      'prev_accountant_details', 'release_letter', 'materials_received', 'intake_questionnaire',
      'retainer_authorization', 'business_details',
      'tax_estimate', 'annual_return', 'info_collection', 'wealth_declaration', 'tax_file_intake']);

-- הכנה פתוחה אחת לכל לקוח + יום הצהרה
create unique index if not exists onboarding_steps_wealth_open_idx
  on public.onboarding_steps (client_id, (payload->>'asOfDate'))
  where step_type = 'wealth_declaration'
    and status <> all (array['completed', 'verified', 'skipped', 'cancelled', 'failed']);

-- ── 2. קטלוג הפריטים — 229 ועוד פריטי ההון. נוצר מהקוד (catalog.ts + wealthCatalog.ts) ──
-- ‼ 230 הוא הבעלים של הרשימה מעכשיו. החלה חוזרת של 229 אחרי 230 תמחק את פריטי ההון — להחיל 230 שוב.
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
    "wealth.since.uses":"detail","wealth.since.living":"detail"}'::jsonb
$$;

-- ── 3. פתיחה (אידמפוטנטית) ──────────────────────────────────────────────────
create or replace function public.ensure_wealth_declaration(p_client_id text, p_as_of date, p_kind text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  c       public.clients%rowtype;
  v_id    text;
  v_kind  text;
  v_prev_id text;
  v_prev_as_of text;
  v_payload jsonb;
begin
  c := public._tax_year_client(p_client_id);
  if p_as_of is null or extract(year from p_as_of) < 2000 or extract(year from p_as_of) > 2100 then
    return jsonb_build_object('ok', false, 'error', 'bad_date');
  end if;
  if p_kind is not null and p_kind not in ('first', 'followup') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  perform pg_advisory_xact_lock(hashtext('wealth_declaration:' || p_client_id || ':' || p_as_of::text));
  select id into v_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'wealth_declaration' and payload->>'asOfDate' = p_as_of::text
     and status <> all (array['completed','verified','skipped','cancelled','failed']) limit 1;
  if v_id is not null then return jsonb_build_object('ok', true, 'stepId', v_id, 'created', false); end if;

  -- הצהרה קודמת במערכת (ליום מוקדם יותר) ⇒ המשך; אחרת — ראשונה, אלא אם המשרד אמר אחרת
  select s.id, s.payload->>'asOfDate' into v_prev_id, v_prev_as_of from public.onboarding_steps s
   where s.client_id = p_client_id and s.step_type = 'wealth_declaration' and s.status <> 'cancelled'
     and (s.payload->>'asOfDate')::date < p_as_of
   order by (s.payload->>'asOfDate')::date desc limit 1;
  v_kind := coalesce(p_kind, case when v_prev_id is not null then 'followup' else 'first' end);

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'purpose', 'wealth', 'asOfDate', p_as_of, 'taxYear', extract(year from p_as_of)::int, 'kind', v_kind,
    'title', 'הצהרת הון ליום ' || to_char(p_as_of, 'DD.MM.YYYY'),
    'previous', case when v_prev_id is not null then jsonb_build_object('fromStepId', v_prev_id, 'asOfDate', v_prev_as_of) end,
    'history', jsonb_build_array(jsonb_build_object('at', now(), 'by', auth.uid(), 'what', 'opened', 'kind', v_kind))));
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (c.user_id, p_client_id, 'wealth_declaration', 'internal', 'person', 'in_progress', 'me', v_payload, now())
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.onboarding_steps
     where client_id = p_client_id and step_type = 'wealth_declaration' and payload->>'asOfDate' = p_as_of::text
       and status <> all (array['completed','verified','skipped','cancelled','failed']) limit 1;
    return jsonb_build_object('ok', true, 'stepId', v_id, 'created', false);
  end if;
  return jsonb_build_object('ok', true, 'stepId', v_id, 'created', true, 'kind', v_kind);
end $$;

-- ── 4א. המועד המחושב — הכלל היחיד שהמערכת מחשבת בעצמה ──
-- ‼ מחקר: docs/tax-foundation/wealth/deadline-rule-2026-10-11.md. סעיף 135(1)(א): המועד הוא זה שפורש
--   בהודעה, ופקיד השומה לא רשאי לקבוע מועד לפני תום 120 יום מהמאוחר מבין יום הדרישה והיום שההצהרה
--   מתייחסת אליו. ⇒ זו רצפה לבקרה («המועד שבמכתב לא אמור להיות מוקדם ממנה»), לא מועד הגשה.
--   הבסיס הוא תאריך הדרישה (המכתב), לא תאריך הקבלה. לא מזיזים לשבת/חג (לא אומת).
create or replace function public._wealth_min_due(p_base date, p_as_of date)
returns date language sql immutable as $$
  select case when p_base is null then null else greatest(p_base, p_as_of) + 120 end
$$;

-- ── 4. פרטי ההצהרה: דרישה, יעד פנימי, הצהרה קודמת, בסיס רישום — עם היסטוריה ──
-- ‼ שינוי בסיס מול ההצהרה הקודמת: נשמר עם הסבר, מי אישר ומתי. בלי הסבר — נדחה.
create or replace function public.update_wealth_declaration(p_step_id text, p_patch jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  s        public.onboarding_steps%rowtype;
  c        public.clients%rowtype;
  v_as_of  date;
  v_p      jsonb;
  v_demand jsonb;
  v_prev   jsonb;
  v_basis  jsonb;
  v_old    jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_just   jsonb;
  k        text;
  v_ok_basis constant jsonb := '{"funds":["allDeposits","employeeOnly","notDecided"],"businessAssets":["cost","depreciatedCost","notDecided"],"fxBalances":["declarationDateRate","notDecided"],"securities":["cost","marketValueOldForm"]}';
  -- ‼ אפשרות שאינה לשון הטופס (פתוח / פרשנות) אינה בחירה חופשית: נשמרת רק עם ביסוס מתועד,
  --   ועד אז אינה נכנסת לחישוב. notDecided — מותר, בלי חישוב.
  v_needs_basis constant jsonb := '{"funds":["employeeOnly"],"businessAssets":["depreciatedCost"],"fxBalances":["declarationDateRate"]}';
begin
  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null or s.step_type <> 'wealth_declaration' then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  c := public._tax_year_client(s.client_id);
  if s.status in ('completed','verified','skipped','cancelled','failed') then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if exists (select 1 from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) x where x not in ('demand','demandVerify','demandExtension','internalTarget','previous','basis','basisChange','basisJustification','omission')) then
    return jsonb_build_object('ok', false, 'error', 'bad_field');
  end if;
  v_as_of := (s.payload->>'asOfDate')::date;
  v_p := s.payload;

  if p_patch ? 'demand' then
    if jsonb_typeof(p_patch->'demand') = 'null' then
      v_p := v_p - 'demand';
    else
      -- ‼ מידע על דרישה — תמיד «טרם אומת». שדות חלקיים מותרים; אימות קודם מתבטל (נרשם בהיסטוריה).
      v_demand := jsonb_strip_nulls(jsonb_build_object(
        'status', 'reported',
        'source', coalesce(nullif(p_patch->'demand'->>'source', ''), 'other'),
        'letterDate', nullif(p_patch->'demand'->>'letterDate', '')::date,
        'receivedOn', nullif(p_patch->'demand'->>'receivedOn', '')::date,
        'dueInLetter', nullif(p_patch->'demand'->>'dueInLetter', '')::date,
        'note', nullif(btrim(coalesce(p_patch->'demand'->>'note', '')), ''),
        'reportedBy', auth.uid(), 'reportedAt', now(),
        'unverifiedFrom', case when v_p->'demand'->>'status' = 'verified' then v_p->'demand'->'verifiedAt' end));
      if v_demand->>'source' not in ('letter','portal','client','alignment','other') then
        return jsonb_build_object('ok', false, 'error', 'bad_source');
      end if;
      if (v_demand ? 'dueInLetter') and (v_demand->>'dueInLetter')::date < coalesce((v_demand->>'letterDate')::date, (v_demand->>'receivedOn')::date, '1900-01-01'::date) then
        return jsonb_build_object('ok', false, 'error', 'due_before_letter');
      end if;
      v_p := v_p || jsonb_build_object('demand', v_demand);
    end if;
  end if;
  if p_patch ? 'demandVerify' then
    -- ‼ אימות = אסמכתה שקיימת אצל אותו לקוח: מסמך בתיק, או רשומה מאושרת שנקראה מהרשות
    --   (יישור קו / בדיקה אוטומטית — לא «עריכה ידנית»). בלי תאריך בסיס אין אימות.
    v_demand := v_p->'demand';
    if v_demand is null then return jsonb_build_object('ok', false, 'error', 'no_demand'); end if;
    if (v_demand->>'letterDate') is null and (v_demand->>'receivedOn') is null then
      return jsonb_build_object('ok', false, 'error', 'demand_date_required');
    end if;
    if p_patch->'demandVerify'->>'kind' = 'document' then
      if not exists (select 1 from public.documents d where d.id = p_patch->'demandVerify'->>'documentId' and d.client_id = s.client_id) then
        return jsonb_build_object('ok', false, 'error', 'evidence_not_found');
      end if;
    elsif p_patch->'demandVerify'->>'kind' = 'authority_record' then
      if not exists (select 1 from public.tax_fact_changes t where t.id::text = p_patch->'demandVerify'->>'recordId' and t.client_id = s.client_id
                       and t.status = 'accepted' and t.source in ('institution_alignment', 'automation')
                       and t.field_key in ('capitalDeclarationRequired', 'capitalDeclarationDeadline')) then
        return jsonb_build_object('ok', false, 'error', 'evidence_not_found');
      end if;
    else
      return jsonb_build_object('ok', false, 'error', 'evidence_required');
    end if;
    v_demand := v_demand || jsonb_strip_nulls(jsonb_build_object(
      'status', 'verified',
      'evidence', jsonb_strip_nulls(jsonb_build_object('kind', p_patch->'demandVerify'->>'kind',
        'documentId', p_patch->'demandVerify'->>'documentId', 'recordId', p_patch->'demandVerify'->>'recordId',
        'label', nullif(btrim(coalesce(p_patch->'demandVerify'->>'label', '')), ''))),
      'verifiedBy', auth.uid(), 'verifiedAt', now()));
    v_p := v_p || jsonb_build_object('demand', v_demand);
  end if;
  if p_patch ? 'demandExtension' then
    -- ‼ ארכה — רשומה נפרדת, לא עריכה של המועד שבדרישה. עם מסמך בתיק — «מתועדת»; בלי — «נמסרה».
    if v_p->'demand' is null then return jsonb_build_object('ok', false, 'error', 'no_demand'); end if;
    if jsonb_typeof(p_patch->'demandExtension') = 'null' then
      v_p := jsonb_set(v_p, '{demand}', (v_p->'demand') - 'extension');
    else
      if nullif(p_patch->'demandExtension'->>'until', '') is null then return jsonb_build_object('ok', false, 'error', 'extension_date_required'); end if;
      if coalesce(p_patch->'demandExtension'->>'kind', '') not in ('personal', 'general') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
      if nullif(p_patch->'demandExtension'->>'documentId', '') is not null
         and not exists (select 1 from public.documents d where d.id = p_patch->'demandExtension'->>'documentId' and d.client_id = s.client_id) then
        return jsonb_build_object('ok', false, 'error', 'evidence_not_found');
      end if;
      v_p := jsonb_set(v_p, '{demand,extension}', jsonb_strip_nulls(jsonb_build_object(
        'until', (p_patch->'demandExtension'->>'until')::date, 'kind', p_patch->'demandExtension'->>'kind',
        'documentId', nullif(p_patch->'demandExtension'->>'documentId', ''),
        'status', case when nullif(p_patch->'demandExtension'->>'documentId', '') is null then 'reported' else 'documented' end,
        'note', nullif(btrim(coalesce(p_patch->'demandExtension'->>'note', '')), ''), 'by', auth.uid(), 'at', now())));
    end if;
  end if;
  -- הרצפה החוקית נגזרת תמיד מחדש מתאריך הדרישה, ונשמרת בנפרד מהמועד שבאסמכתה
  if v_p ? 'demand' then
    v_p := jsonb_set(v_p, '{demand}', ((v_p->'demand') - 'minDue' - 'computedDue') || jsonb_strip_nulls(jsonb_build_object(
      'computedDue', public._wealth_min_due((v_p->'demand'->>'letterDate')::date, v_as_of))));
  end if;
  if p_patch ? 'internalTarget' then
    v_p := case when jsonb_typeof(p_patch->'internalTarget') = 'null' then v_p - 'internalTarget'
                else v_p || jsonb_build_object('internalTarget', ((p_patch->>'internalTarget')::date)) end;
  end if;
  if p_patch ? 'previous' then
    v_prev := coalesce(v_p->'previous', '{}'::jsonb) || (p_patch->'previous');
    if nullif(v_prev->>'asOfDate', '') is not null and (v_prev->>'asOfDate')::date >= v_as_of then
      return jsonb_build_object('ok', false, 'error', 'previous_not_before');
    end if;
    if v_prev ? 'netWorth' and jsonb_typeof(v_prev->'netWorth') not in ('number', 'null') then return jsonb_build_object('ok', false, 'error', 'bad_amount'); end if;
    v_p := v_p || jsonb_build_object('previous', v_prev, 'kind', 'followup');
  end if;
  if p_patch ? 'basis' then
    v_basis := coalesce(v_p->'basis', '{}'::jsonb);
    for k in select jsonb_object_keys(p_patch->'basis') loop
      if not (v_ok_basis ? k) or not ((v_ok_basis->k) ? (p_patch->'basis'->>k)) then
        return jsonb_build_object('ok', false, 'error', 'bad_basis', 'field', k);
      end if;
      v_old := coalesce(v_p->'previous'->'basis'->k, 'null'::jsonb);
      -- ‼ שונה מבסיס ההצהרה הקודמת (כשהוא ידוע, ואף צד אינו «לא הוכרע») — חייב הסבר ואישור.
      -- אותו שינוי שכבר אושר (אותו שדה, מאותו בסיס לאותו בסיס) אינו נרשם ואינו נדרש שוב.
      if v_old <> 'null'::jsonb and v_old <> to_jsonb(p_patch->'basis'->>k)
         and p_patch->'basis'->>k <> 'notDecided' and v_old <> '"notDecided"'::jsonb
         and not exists (select 1 from jsonb_array_elements(coalesce(v_p->'basisChanges', '[]'::jsonb)) bc(e)
                         where bc.e->>'field' = k and bc.e->'from' = v_old and bc.e->>'to' = p_patch->'basis'->>k) then
        if nullif(btrim(coalesce(p_patch->'basisChange'->>'explanation', '')), '') is null then
          return jsonb_build_object('ok', false, 'error', 'basis_change_needs_explanation', 'field', k);
        end if;
        v_changes := v_changes || jsonb_build_object('field', k, 'from', v_old, 'to', p_patch->'basis'->>k,
          'explanation', btrim(p_patch->'basisChange'->>'explanation'), 'approvedBy', auth.uid(), 'approvedAt', now());
      end if;
      if (v_needs_basis ? k) and ((v_needs_basis->k) ? (p_patch->'basis'->>k)) then
        if nullif(btrim(coalesce(p_patch->'basisJustification'->k->>'text', '')), '') is null
           and coalesce(v_p->'basisJustification'->k->>'value', '') <> p_patch->'basis'->>k then
          return jsonb_build_object('ok', false, 'error', 'basis_needs_justification', 'field', k);
        end if;
        if nullif(btrim(coalesce(p_patch->'basisJustification'->k->>'text', '')), '') is not null then
          v_just := coalesce(v_p->'basisJustification', '{}'::jsonb) || jsonb_build_object(k, jsonb_strip_nulls(jsonb_build_object(
            'value', p_patch->'basis'->>k, 'text', btrim(p_patch->'basisJustification'->k->>'text'),
            'source', nullif(btrim(coalesce(p_patch->'basisJustification'->k->>'source', '')), ''),
            'by', auth.uid(), 'at', now())));
          v_p := v_p || jsonb_build_object('basisJustification', v_just);
        end if;
      end if;
      v_basis := v_basis || jsonb_build_object(k, p_patch->'basis'->>k);
    end loop;
    v_p := v_p || jsonb_build_object('basis', v_basis);
    if jsonb_array_length(v_changes) > 0 then
      v_p := v_p || jsonb_build_object('basisChanges', coalesce(v_p->'basisChanges', '[]'::jsonb) || v_changes);
    end if;
  end if;
  if p_patch ? 'omission' then
    -- ‼ השמטה בהצהרה הקודמת: נרשמת כממצא פתוח (חוסם סגירה — _wealth_omission_guard), נסגרת רק עם הכרעה כתובה
    if p_patch->'omission' ? 'add' then
      if nullif(btrim(coalesce(p_patch->'omission'->'add'->>'description', '')), '') is null then
        return jsonb_build_object('ok', false, 'error', 'omission_description_required');
      end if;
      v_p := v_p || jsonb_build_object('omissions', coalesce(v_p->'omissions', '[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', replace(gen_random_uuid()::text, '-', ''), 'status', 'open',
        'area', nullif(p_patch->'omission'->'add'->>'area', ''), 'description', btrim(p_patch->'omission'->'add'->>'description'),
        'foundBy', auth.uid(), 'foundAt', now()))));
    elsif p_patch->'omission' ? 'resolve' then
      if nullif(btrim(coalesce(p_patch->'omission'->'resolve'->>'resolution', '')), '') is null then
        return jsonb_build_object('ok', false, 'error', 'omission_resolution_required');
      end if;
      if not exists (select 1 from jsonb_array_elements(coalesce(v_p->'omissions', '[]'::jsonb)) o
                     where o->>'id' = p_patch->'omission'->'resolve'->>'id' and o->>'status' = 'open') then
        return jsonb_build_object('ok', false, 'error', 'omission_not_found');
      end if;
      v_p := v_p || jsonb_build_object('omissions', (select jsonb_agg(case when o->>'id' = p_patch->'omission'->'resolve'->>'id'
          then o || jsonb_build_object('status', 'resolved', 'resolution', btrim(p_patch->'omission'->'resolve'->>'resolution'), 'resolvedBy', auth.uid(), 'resolvedAt', now())
          else o end) from jsonb_array_elements(v_p->'omissions') o));
    else
      return jsonb_build_object('ok', false, 'error', 'bad_field');
    end if;
  end if;
  v_p := v_p || jsonb_build_object('history', coalesce(v_p->'history', '[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'at', now(), 'by', auth.uid(), 'what', 'updated', 'fields', (select jsonb_agg(x) from jsonb_object_keys(p_patch) x), 'note', nullif(btrim(coalesce(p_note, '')), '')))));
  update public.onboarding_steps set payload = v_p, updated_at = now() where id = s.id;
  return jsonb_build_object('ok', true, 'basisChanges', jsonb_array_length(v_changes));
end $$;

revoke all on function public.ensure_wealth_declaration(text, date, text) from public, anon;
revoke all on function public.update_wealth_declaration(text, jsonb, text) from public, anon;
revoke all on function public._wealth_min_due(date, date) from public, anon, authenticated;
grant execute on function public.ensure_wealth_declaration(text, date, text) to authenticated;
grant execute on function public.update_wealth_declaration(text, jsonb, text) to authenticated;

-- ── 5. «השלמת מידע» ושליחת תשובות להצהרת הון — הזרקה מבוקרת לגופי 229 ───────────
-- ‼ עוגן אחד בדיוק לכל החלפה, אחרת נכשל; החלה חוזרת מזהה את הסימון ומדלגת.
do $p230$
declare
  v_def text;
  v_a text; v_n text;
begin
  -- add_tax_info_asks: בקשת־אב מסוג הצהרת הון; כותרת ויום ההצהרה לבקשת־הבת
  v_def := pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure);
  if v_def not like '%230 · הצהרת הון%' then
    v_a := E'par.step_type not in (''tax_estimate'',''annual_return'')';
    v_n := E'par.step_type not in (''tax_estimate'',''annual_return'',''wealth_declaration'') /* 230 · הצהרת הון */';
    if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '230: עוגן סוג בקשת־האב ב-add_tax_info_asks'; end if;
    v_def := replace(v_def, v_a, v_n);
    v_a := E'''cutoffMonth'', par.payload->''cutoffMonth'', ''title'', ''השלמת מידע לשנת '' || v_year))';
    v_n := E'''cutoffMonth'', par.payload->''cutoffMonth'', ''asOfDate'', par.payload->''asOfDate'',\n        ''title'', case when par.step_type = ''wealth_declaration'' then ''השלמת מידע להצהרת הון'' else ''השלמת מידע לשנת '' || v_year end))';
    if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '230: עוגן הכותרת ב-add_tax_info_asks'; end if;
    execute replace(v_def, v_a, v_n);
  end if;

  -- portal_submit_tax_info: תשובה להצהרת הון = «נכון ליום ההצהרה»
  v_def := pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure);
  if v_def not like '%230 · הצהרת הון%' then
    v_a := E'v_per := public._tax_answer_period(v_ins->>''purpose'', (v_ins->>''cutoffMonth'')::int, a.tax_year, a.item_key, a.item_kind);';
    v_n := E'v_per := case when v_ins->>''purpose'' = ''wealth'' /* 230 · הצהרת הון */\n    then jsonb_build_object(''periodKind'', ''as_of'', ''from'', null, ''to'', (v_ins->>''asOfDate'')::date, ''basis'', case when a.item_kind = ''amount'' then ''declared'' else ''actual'' end)\n    else public._tax_answer_period(v_ins->>''purpose'', (v_ins->>''cutoffMonth'')::int, a.tax_year, a.item_key, a.item_kind) end;';
    if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '230: עוגן התקופה ב-portal_submit_tax_info'; end if;
    execute replace(v_def, v_a, v_n);
  end if;
end
$p230$;

-- ── 6. פריט לפי תכלית — שאלת הון רק בהצהרת הון, ושאלת שנת מס רק בשנת מס ──
-- ‼ בלי זה אפשר היה לשאול «מזומן ליום ההצהרה» בתוך דוח שנתי (או להפך), והעובדות היו מתערבבות.
--   נבדק לפני יצירת בקשת־הבת, כדי שדחייה לא תשאיר «השלמת מידע» ריקה.
do $p230b$
declare
  v_def text;
  v_a text; v_n text;
begin
  v_def := pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure);
  if v_def not like '%230b · פריט לפי תכלית%' then
    v_a := E'v_year := (par.payload->>''taxYear'')::int;';
    v_n := E'v_year := (par.payload->>''taxYear'')::int;\n  if exists (select 1 from jsonb_array_elements(coalesce(p_asks, ''[]''::jsonb)) z /* 230b · פריט לפי תכלית */\n             where ((z->>''itemKey'') like ''wealth.%'') <> (par.step_type = ''wealth_declaration'')) then\n    return jsonb_build_object(''ok'', false, ''error'', ''item_purpose_mismatch'');\n  end if;';
    if (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a) <> 1 then raise exception '230b: עוגן השנה ב-add_tax_info_asks'; end if;
    execute replace(v_def, v_a, v_n);
  end if;
end
$p230b$;

-- ── 7. השמטה בהצהרה הקודמת — ממצא פתוח שחוסם סגירה עד בירור ──
-- ‼ נכס שהיה קיים ביום ההצהרה הקודמת ולא הוצהר אינו «שינוי בסיס» (professional-rules §7.6). נרשם כממצא
--   עם מי ומתי; נסגר רק עם הכרעה כתובה. בקשה עם ממצא פתוח אינה יכולה להיסגר כ«הושלמה».
create or replace function public._wealth_omission_guard()
returns trigger language plpgsql as $$
begin
  if new.step_type = 'wealth_declaration' and new.status in ('completed', 'verified')
     and old.status is distinct from new.status
     and exists (select 1 from jsonb_array_elements(coalesce(new.payload->'omissions', '[]'::jsonb)) o where o->>'status' = 'open') then
    raise exception 'wealth_omission_open: יש ממצא השמטה פתוח בהצהרה הקודמת — לברר ולתעד הכרעה לפני סגירה';
  end if;
  return new;
end $$;
drop trigger if exists onboarding_steps_wealth_omission_guard on public.onboarding_steps;
create trigger onboarding_steps_wealth_omission_guard before update of status on public.onboarding_steps
  for each row when (new.step_type = 'wealth_declaration') execute function public._wealth_omission_guard();
revoke all on function public._wealth_omission_guard() from public, anon, authenticated;
