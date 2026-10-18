-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 253 · «בקשה אחת לתיק המס» שלב 2 — השאלון מהתיק: רשימות סגורות, מסך הרשת, «של מי / איפה» (16.10.2026)
-- ‼ נוצר ב-scripts/sql/253/build-items.mjs מהקטלוג בקוד (catalog.ts, intakeCatalog.ts, src/data/institutions.ts). לא לערוך ביד.
-- ‼ חזרה: scripts/sql/253/rollback-253.sql (נוצר באותו סקריפט). בדיקה בבידוד: scripts/sql/253/test-253.pglite.mjs.
-- ‼ תלויות: 229, 230, 236, 241 (ההזרקות מזוהות לפי הסימון «241 · רשומה»). עצמאי מ-252 (שלב 1 — פתיחת היכרות ופרסום).
--
-- מה כאן:
--   1. _tax_year_items — הרשימה המלאה מהקטלוג (חדשים: intake.whatYouHave, intake.cryptoDetails, intake.allowanceDetails, intake.insuranceDetails).
--      ‼ אף מפתח לא הוסר: פריטי המסמך של ההיכרות נשארים (זהות ראיות שנשמרו) — הם רק לא נשאלים יותר (purposes בקוד).
--   2. _tax_institutions — הרשימות הסגורות (מזהה ← שם) שהשרת מאמת מולן את «איפה».
--   3. add_tax_info_asks — סוגי קלט חדשים 'multi' (מסך הרשת) ו-'entity' («של מי / איפה»).
--   4. portal_submit_tax_info — תשובת 'multi': עובדה כן/לא לכל אריח בתפקיד שלו + פתיחת שאלות ההמשך (צילום שנשמר בשאלה);
--      תשובת 'entity': אימות כל שדה (איפה — מהרשימה; של מי; בחירה; שם עד 120) ושמירת {items} עם שם הגוף לצד המזהה.
-- ‼ הזרקות לגוף החי — כל עוגן שורה אחת, פעם אחת בדיוק; החלה חוזרת מדלגת לפי הסימון «253 ·».
-- ════════════════════════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if not exists (select 1 from pg_proc where proname = 'portal_submit_tax_info' and prosrc like '%241 · רשומה%')
     or not exists (select 1 from pg_proc where proname = 'add_tax_info_asks' and prosrc like '%241 · רשומה%') then
    raise exception '253: 241 לא הוחלה — להחיל 229, 230, 236, 241 לפני 253';
  end if;
end
$guard$;

-- ── 1. רשימת הפריטים — מהקטלוג בקוד ──
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

-- ── 2. הרשימות הסגורות (src/data/institutions.ts) — מזהה ← שם, לכל רשימה ──
create or replace function public._tax_institutions()
returns jsonb language sql immutable set search_path = public as $$
  select '{
    "accounts":{"bank-12":"בנק הפועלים","bank-10":"בנק לאומי","bank-20":"בנק מזרחי טפחות","bank-11":"בנק דיסקונט","bank-31":"הבנק הבינלאומי","bank-04":"בנק יהב","bank-14":"בנק אוצר החייל","bank-17":"בנק מרכנתיל דיסקונט","bank-18":"One Zero — הבנק הדיגיטלי","bank-46":"בנק מסד","bank-52":"בנק פועלי אגודת ישראל","bank-54":"בנק ירושלים","bank-26":"יו-בנק","bank-03":"בנק אש ישראל","bank-22":"Citibank","bank-23":"HSBC","bank-39":"SBI State Bank of India","ih-ibi":"IBI בית השקעות","ih-meitav":"מיטב","ih-altshuler":"אלטשולר שחם","ih-psagot":"פסגות","ih-more":"מור","ih-analyst":"אנליסט","ih-harel-fin":"הראל פיננסים","ih-excellence":"אקסלנס (הפניקס)","ih-yelin":"ילין לפידות","ih-infinity":"אינפיניטי","ih-ibkr":"Interactive Brokers","ih-etoro":"eToro","other":"אחר (לא ברשימה)"},
    "funds":{"fund-menora":"מנורה מבטחים","fund-harel":"הראל","fund-clal":"כלל ביטוח ופנסיה","fund-migdal":"מגדל","fund-phoenix":"הפניקס","fund-altshuler":"אלטשולר שחם גמל ופנסיה","fund-meitav":"מיטב גמל ופנסיה","fund-more":"מור גמל ופנסיה","fund-analyst":"אנליסט","fund-yelin":"ילין לפידות","fund-infinity":"אינפיניטי","fund-hachshara":"הכשרה","fund-ayalon":"איילון","fund-slice":"סלייס גמל","fund-amitim":"עמיתים (קרנות פנסיה ותיקות)","other":"אחר (לא ברשימה)"},
    "insurers":{"ins-harel":"הראל","ins-migdal":"מגדל","ins-clal":"כלל ביטוח","ins-phoenix":"הפניקס","ins-menora":"מנורה מבטחים","ins-ayalon":"איילון","ins-hachshara":"הכשרה","ins-direct":"ביטוח ישיר (איי.די.איי)","ins-shlomo":"שלמה ביטוח","ins-wesure":"ווישור","ins-libra":"ליברה","ins-aig":"AIG ישראל","other":"אחר (לא ברשימה)"},
    "crypto":{"cx-bit2c":"Bit2C","cx-bitsofgold":"Bits of Gold","cx-binance":"Binance","cx-coinbase":"Coinbase","cx-kraken":"Kraken","cx-etoro":"eToro","cx-bybit":"Bybit","cx-okx":"OKX","cx-wallet":"ארנק פרטי (לא בזירה)","other":"אחר (לא ברשימה)"},
    "countries":{"us":"ארצות הברית","gb":"בריטניה","de":"גרמניה","fr":"צרפת","cy":"קפריסין","gr":"יוון","pt":"פורטוגל","es":"ספרד","it":"איטליה","nl":"הולנד","be":"בלגיה","ch":"שווייץ","at":"אוסטריה","se":"שוודיה","no":"נורווגיה","dk":"דנמרק","fi":"פינלנד","ie":"אירלנד","pl":"פולין","cz":"צ׳כיה","hu":"הונגריה","ro":"רומניה","bg":"בולגריה","ru":"רוסיה","ua":"אוקראינה","ge":"גאורגיה","tr":"טורקיה","ae":"איחוד האמירויות","ca":"קנדה","au":"אוסטרליה","nz":"ניו זילנד","br":"ברזיל","ar":"ארגנטינה","mx":"מקסיקו","za":"דרום אפריקה","in":"הודו","cn":"סין","hk":"הונג קונג","sg":"סינגפור","jp":"יפן","kr":"דרום קוריאה","th":"תאילנד","ph":"הפיליפינים","vn":"וייטנאם","other":"אחר (לא ברשימה)"},
    "allowancePayers":{"ap-btl":"ביטוח לאומי","ap-pension":"קרן פנסיה","ap-insurer":"חברת ביטוח","ap-mod":"משרד הביטחון","ap-employer":"מעסיק קודם (פנסיה תקציבית)","ap-treasury":"משרד האוצר (גמלאות)","other":"אחר (לא ברשימה)"},
    "bookkeepers":{"bk-self":"אני בעצמי","bk-external":"מנהל/ת חשבונות חיצוני/ת","bk-prev-cpa":"רואה החשבון הקודם","bk-family":"בן/בת משפחה","bk-none":"עוד לא התחלתי","bk-unsure":"לא יודע/ת"},
    "software":{"sw-greeninvoice":"חשבונית ירוקה","sw-icount":"iCount","sw-morning":"Morning","sw-rivhit":"ריווחית","sw-sumit":"SUMIT","sw-ezcount":"EZcount","sw-hashavshevet":"חשבשבת","sw-priority":"פריוריטי","sw-invoice4u":"Invoice4U","sw-manual":"אקסל או פנקס ידני","sw-none":"אין עדיין","other":"אחר (לא ברשימה)"}}'::jsonb
$$;
revoke all on function public._tax_institutions() from public, anon, authenticated;

-- ── 3. add_tax_info_asks — סוגי קלט ──
do $p1$
declare v_def text;
begin
  select pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) into v_def;
  if position('253 · רשת ושל מי' in v_def) > 0 then raise notice '253: add_tax_info_asks — כבר הוחל'; return; end if;
  if (length(v_def) - length(replace(v_def, $blk$'record' /* 241 · רשומה */)$blk$, ''))) / length($blk$'record' /* 241 · רשומה */)$blk$) <> 1 then raise exception '253: עוגן סוגי הקלט ב-add_tax_info_asks לא נמצא פעם אחת'; end if;
  execute replace(v_def, $blk$'record' /* 241 · רשומה */)$blk$, $blk$'record' /* 241 · רשומה */,'multi','entity' /* 253 · רשת ושל מי */)$blk$);
end
$p1$;

-- ── 4. portal_submit_tax_info — multi ו-entity ──
do $p2$
declare
  v_def text; v_nl text;
  a1 text := $blk$  v_ins  jsonb;
$blk$;
  n1 text := $blk$  v_ins  jsonb;
  -- 253 · רשת ושל מי: הצהרות
  v_items jsonb := public._tax_year_items();
  v_sel  jsonb; v_o jsonb; v_yes boolean; v_per2 jsonb; v_n int; v_opened int := 0;
  v_out  jsonb; v_it jsonb; v_f jsonb; v_val text; v_list jsonb; v_clean jsonb;
$blk$;
  a2 text := $blk$  -- 241 · רשומה מובנית (ילדים, בנק, כתובת, מעסיקים, תחולה…) — עובדה ממתינה, לא כתיבה לכרטיס
$blk$;
  n2 text := $blk$  -- 253 · מסך הרשת «סמנו מה יש לכם»: עובדה כן/לא לכל אריח (בתפקיד שלו), ושאלות ההמשך של מה שסומן נפתחות מיד (מפורסמות)
  if v_kind = 'multi' then
    if coalesce(a.prompt->'input'->>'kind', '') <> 'multi' or jsonb_typeof(p_answer->'selected') is distinct from 'array' then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
    v_sel := p_answer->'selected';
    if exists (select 1 from jsonb_array_elements(v_sel) z where jsonb_typeof(z) <> 'string'
                  or not exists (select 1 from jsonb_array_elements(a.prompt->'input'->'options') o where o->>'key' = z #>> '{}')) then
      return jsonb_build_object('ok', false, 'error', 'bad_option');
    end if;
    for v_o in select value from jsonb_array_elements(a.prompt->'input'->'options') loop
      if not (v_items ? (v_o->>'key')) or coalesce(v_o->>'role', '') not in ('client','spouse','couple') then return jsonb_build_object('ok', false, 'error', 'bad_option'); end if;
      v_yes := v_sel ? (v_o->>'key');
      v_per2 := case when v_ins->>'purpose' in ('wealth', 'intake')
        then jsonb_build_object('periodKind', 'as_of', 'from', null, 'to', (v_ins->>'asOfDate')::date, 'basis', 'actual')
        else public._tax_answer_period(v_ins->>'purpose', (v_ins->>'cutoffMonth')::int, a.tax_year, v_o->>'key', v_items->>(v_o->>'key')) end;
      insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, period_kind, period_from, period_to, answer, value, basis, source, request_id, ask_id, status)
      values (a.user_id, c.id, a.tax_year, v_o->>'key', v_o->>'role', v_per2->>'periodKind', (v_per2->>'from')::date, (v_per2->>'to')::date,
              case when v_yes then 'value' else 'no' end, case when v_yes then 'true'::jsonb end, v_per2->>'basis', 'portal', a.parent_step_id, a.id, 'pending');
      -- שאלת ההמשך היא צילום שנשמר בשאלה בזמן הכנתה במשרד — לא נוסח מהדפדפן; פעם אחת לזהות (האינדקס של 229)
      if v_yes and (v_o ? 'followUp') and (v_items ? (v_o->'followUp'->>'itemKey')) then
        insert into public.tax_info_asks (user_id, client_id, tax_year, step_id, parent_step_id, item_key, item_kind, subject_role, entity_kind, entity_ref, prompt, state)
        values (a.user_id, c.id, a.tax_year, a.step_id, a.parent_step_id, v_o->'followUp'->>'itemKey', v_items->>(v_o->'followUp'->>'itemKey'),
                v_o->'followUp'->>'subjectRole', nullif(v_o->'followUp'->>'entityKind', ''), nullif(v_o->'followUp'->>'entityRef', ''), v_o->'followUp'->'prompt', 'published')
        on conflict do nothing;
        get diagnostics v_n = row_count;
        v_opened := v_opened + v_n;
      end if;
    end loop;
    update public.tax_info_asks set state = 'answered', answered_at = now(), saved_draft = null where id = a.id;
    if not exists (select 1 from public.tax_info_asks where step_id = a.step_id and state = 'published') then
      update public.onboarding_steps set status = 'in_progress', ball = 'me', updated_at = now() where id = a.step_id;
    end if;
    return jsonb_build_object('ok', true, 'state', 'answered', 'opened', v_opened);
  end if;
  -- 253 · «של מי / איפה»: שדות סגורים — «איפה» רק מתוך הרשימה (_tax_institutions), «של מי» client/spouse/both, בחירה מהאפשרויות; שם — עד 120 תווים
  if v_kind = 'entity' then
    if coalesce(a.prompt->'input'->>'kind', '') <> 'entity' or jsonb_typeof(p_answer->'items') is distinct from 'array'
       or jsonb_array_length(p_answer->'items') not between 1 and 20 then return jsonb_build_object('ok', false, 'error', 'bad_entity'); end if;
    v_out := '[]'::jsonb;
    for v_it in select value from jsonb_array_elements(p_answer->'items') loop
      if jsonb_typeof(v_it) <> 'object' then return jsonb_build_object('ok', false, 'error', 'bad_entity'); end if;
      v_clean := '{}'::jsonb;
      for v_f in select value from jsonb_array_elements(coalesce(a.prompt->'input'->'spec'->'fields', '[]'::jsonb)) loop
        v_val := nullif(btrim(coalesce(v_it->>(v_f->>'key'), '')), '');
        if v_val is null then
          if coalesce((v_f->>'required')::boolean, false) then return jsonb_build_object('ok', false, 'error', 'bad_entity', 'field', v_f->>'key'); end if;
          continue;
        end if;
        if v_f->>'type' = 'who' then
          if v_val not in ('client', 'spouse', 'both') then return jsonb_build_object('ok', false, 'error', 'bad_entity', 'field', v_f->>'key'); end if;
        elsif v_f->>'type' = 'list' then
          v_list := public._tax_institutions()->(v_f->>'list');
          if v_list is null or not (v_list ? v_val) then return jsonb_build_object('ok', false, 'error', 'not_in_list', 'field', v_f->>'key'); end if;
          v_clean := v_clean || jsonb_build_object((v_f->>'key') || 'Label', v_list->>v_val);
        elsif v_f->>'type' = 'choice' then
          if not exists (select 1 from jsonb_array_elements(coalesce(v_f->'options', '[]'::jsonb)) o where o->>'value' = v_val) then return jsonb_build_object('ok', false, 'error', 'bad_entity', 'field', v_f->>'key'); end if;
        elsif v_f->>'type' = 'name' then
          if length(v_val) > 120 then return jsonb_build_object('ok', false, 'error', 'bad_entity', 'field', v_f->>'key'); end if;
        else
          return jsonb_build_object('ok', false, 'error', 'bad_entity', 'field', v_f->>'key');
        end if;
        v_clean := v_clean || jsonb_build_object(v_f->>'key', v_val);
      end loop;
      v_out := v_out || jsonb_build_array(v_clean);
    end loop;
    insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, entity_kind, entity_ref, period_kind, period_from, period_to, answer, value, basis, source, request_id, ask_id, status)
    values (a.user_id, c.id, a.tax_year, a.item_key, a.subject_role, a.entity_kind, a.entity_ref, v_per->>'periodKind', (v_per->>'from')::date, (v_per->>'to')::date,
            'value', jsonb_build_object('items', v_out), v_per->>'basis', 'portal', a.parent_step_id, a.id, 'pending');
    update public.tax_info_asks set state = 'answered', answered_at = now(), saved_draft = null where id = a.id;
    if not exists (select 1 from public.tax_info_asks where step_id = a.step_id and state = 'published') then
      update public.onboarding_steps set status = 'in_progress', ball = 'me', updated_at = now() where id = a.step_id;
    end if;
    return jsonb_build_object('ok', true, 'state', 'answered');
  end if;

$blk$;
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  if position('253 · מסך הרשת' in v_def) > 0 then raise notice '253: portal_submit_tax_info — כבר הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl); a2 := replace(a2, E'\n', v_nl); n2 := replace(n2, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '253: עוגן ההצהרות (v_ins) לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then raise exception '253: עוגן הבלוק של 241 לא נמצא פעם אחת'; end if;
  execute replace(replace(v_def, a1, n1), a2, n2 || a2);
end
$p2$;

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select proname, prosrc like '%253 ·%' from pg_proc where proname in ('add_tax_info_asks','portal_submit_tax_info');
--   select count(*) from jsonb_object_keys(public._tax_year_items());  -- = 241
