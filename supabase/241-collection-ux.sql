-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 241 · סבב האיסוף אחרי שימוש אמיתי (13.10.2026) — docs/COLLECTION-UX-ROUND-2026-10-13.md
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- מה נוסף:
--   1. רשומה מובנית בשאלון (ילדים, כתובת, בנק, מעסיקים, נכסים, חשבונות, תחולה…): add_tax_info_asks מקבל
--      input מסוג 'record'; portal_submit_tax_info שומר את הרשומה כעובדה ממתינה (לא כותב לכרטיס).
--   2. סיבה למסמך שאין: «אעלה בהמשך» / «עוד לא קיבלתי» / «צריך עזרה» — קוד ב-unavailable. «אין לי עדיין» הישן
--      נשאר בלי קוד ובלי משמעות חדשה.
--   3. הדף האישי: מסמך שהלקוח עוד יעלה — «נשארו N מסמכים להשלמה» (פעולה שלו); «צריך עזרה» — אצל המשרד.
--   4. עבודות מס: upsert_tax_work / update_tax_work — דוח שנתי או הצהרת הון עם מקור, מועדים ובדיקה אחרונה, על
--      אותה בקשה (payload.work). «רשמי» רק עם בסיס. יצירה ≠ פרסום ≠ מייל.
--   5. מסמך מכמה תמונות: portal_note_tax_evidence_parts — עקיבות לקבצי המקור (tax_evidence.parts).
--   6. אישור תשובת כתובת מעדכן את הכרטיס דרך apply_tax_facts (עם ערך קודם והיסטוריה): city / address / zipCode
--      בענפי _tax_fact_field_op. ‼ לא נכנסים ל-GOVERNED_FACT_KEYS בדפדפן — עריכה רגילה של הכתובת נשארת ישירה.
--   7. _tax_year_items — הרשימה המלאה מהקטלוג בקוד (scripts/sql/230/fill-items.mjs <items.json> 241).
--
-- ‼ תלויות: 229, 230, 236 (בייצור מ-13.10). לא תלוי ב-231/232 (הערכת מס, הצ'אט המקביל) ולא נוגע במה שהן משנות:
--   232 מוסיפה ענף 'tax_estimate' ב-_portal_step_items לפני `else exit step_body;` — 241 משנה רק שורות בתוך ענף
--   'info_collection' של 229. נבדק על הגוף החי בייצור (בלי 232) וב-staging (עם 232), ובשני סדרי ההחלה.
-- ‼ הזרקות לגוף החי — כל עוגן שורה אחת, פעם אחת בדיוק; כל העוגנים נבדקים לפני כל שינוי (הכול או כלום).
--   החלה חוזרת — דילוג לפי סימון «241 ·». ‼ apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל — לאמת אחרי.
-- ‼ החזרה: scripts/sql/241/rollback-241.sql.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if to_regclass('public.tax_info_asks') is null or to_regclass('public.tax_evidence') is null then
    raise exception '241: חסרות טבלאות 229 — להחיל 229, 230, 236 לפני 241';
  end if;
  if not exists (select 1 from pg_proc where proname = 'add_tax_info_asks' and prosrc like '%236 · קליטה%')
     or not exists (select 1 from pg_proc where proname = 'portal_submit_tax_info' and prosrc like '%236 · קליטה%') then
    raise exception '241: 236 לא הוחלה — להחיל 236 לפני 241';
  end if;
  if not exists (select 1 from pg_proc where proname = '_portal_step_items' and prosrc like '%229 · «השלמת מידע»%') then
    raise exception '241: הענף של 229 ב-_portal_step_items חסר';
  end if;
end
$guard$;

-- ── 5. עקיבות למסמך שנבנה מכמה קבצים ─────────────────────────────────────────────────────
alter table public.tax_evidence add column if not exists parts jsonb;
comment on column public.tax_evidence.parts is '241 · מסמך מכמה קבצים: [{page, part, name, type, size, rotation?}] — מה צורף, באיזה סדר ולאיזה חלק. בלי תוכן.';

-- ── 7. רשימת הפריטים — מהקטלוג בקוד ──────────────────────────────────────────────────────
-- ‼ נוצר: node scripts/sql/230/fill-items.mjs <items.json> 241. לא לערוך ידנית.
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
    "donations.changesSince":"screener","period.property":"detail","period.account":"detail","wealth.period.property":"detail",
    "wealth.period.account":"detail","wealth.household":"confirm","wealth.spouseSeparate":"detail","wealth.realEstate.list":"confirm",
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

-- ── 1–2. השאלון: 'record' וסיבת «אין מסמך» ───────────────────────────────────────────────
do $p1$
declare
  v_def text;
  -- add_tax_info_asks — סוג קלט חדש
  a1 text := $a$('yesno','amount','date','text','choice','confirm','file','who')$a$;
  n1 text := $a$('yesno','amount','date','text','choice','confirm','file','who','record' /* 241 · רשומה */)$a$;
begin
  select pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) into v_def;
  if position('241 · רשומה' in v_def) > 0 then raise notice '241: add_tax_info_asks — כבר הוחל'; return; end if;
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '241: עוגן סוגי הקלט ב-add_tax_info_asks לא נמצא פעם אחת'; end if;
  execute replace(v_def, a1, n1);
end
$p1$;

do $p2$
declare
  v_def text;
  v_new text;
  -- (א) סיבת «אין מסמך»: קוד מוכר בלבד נשמר; «אין לי עדיין» הישן — בלי קוד
  a1 text := $a$'recordedAt', now()) where id = a.id;$a$;
  n1 text := $a$'recordedAt', now()) || case when p_answer->>'code' in ('later', 'notYet', 'needHelp') then jsonb_build_object('code', p_answer->>'code') else '{}'::jsonb end /* 241 · סיבה */ where id = a.id;$a$;
  -- (ב) רשומה: «אין» ⇒ «לא»; אחרת אובייקט מוגבל בגודל ובמבנה (items[] או תחולה עם inPeriod)
  a2 text := E'  if v_kind = ''unavailable'' then\n';
  n2 text := E'  -- 241 · רשומה מובנית (ילדים, בנק, כתובת, מעסיקים, תחולה…) — עובדה ממתינה, לא כתיבה לכרטיס\n'
    || E'  if v_kind = ''record'' then\n'
    || E'    if coalesce(p_answer->>''none'', '''') = ''true'' then\n'
    || E'      v_kind := ''no'';\n'
    || E'    elsif jsonb_typeof(p_answer->''value'') is distinct from ''object'' or length((p_answer->''value'')::text) > 20000 then\n'
    || E'      return jsonb_build_object(''ok'', false, ''error'', ''bad_record'');\n'
    || E'    elsif p_answer->''value'' ? ''items'' then\n'
    || E'      if jsonb_typeof(p_answer->''value''->''items'') is distinct from ''array'' then return jsonb_build_object(''ok'', false, ''error'', ''bad_record''); end if;\n'
    || E'      if jsonb_array_length(p_answer->''value''->''items'') > 40\n'
    || E'         or exists (select 1 from jsonb_array_elements(p_answer->''value''->''items'') x where jsonb_typeof(x) is distinct from ''object'') then\n'
    || E'        return jsonb_build_object(''ok'', false, ''error'', ''bad_record'');\n'
    || E'      end if;\n'
    || E'    elsif not (p_answer->''value'' ? ''inPeriod'') then\n'
    || E'      return jsonb_build_object(''ok'', false, ''error'', ''bad_record'');\n'
    || E'    end if;\n'
    || E'  end if;\n\n';
  a3 text := $a$elsif v_kind not in ('yes','no','choice','unchanged') then$a$;
  n3 text := $a$elsif v_kind not in ('yes','no','choice','unchanged','record') then$a$;
  -- (ג) הערך: הרשומה כפי שנשלחה; «משהו השתנה» — עם מה שהיה (מהשאלה עצמה, לא מהדפדפן)
  a4 text := $a$        when 'changed' then jsonb_build_object('changed', true, 'note', v_txt, 'was', coalesce(a.prompt->'input'->'lines', '[]'::jsonb))$a$;
  n4 text := $a$        when 'record' then case when p_answer->>'assertion' = 'changed' then jsonb_build_object('changed', true, 'record', p_answer->'value', 'was', coalesce(a.prompt->'input'->'lines', '[]'::jsonb)) else p_answer->'value' end
        when 'changed' then jsonb_build_object('changed', true, 'note', v_txt, 'was', coalesce(a.prompt->'input'->'lines', '[]'::jsonb))$a$;
  a5 text := $a$      case v_kind when 'unchanged' then 'unchanged' when 'changed' then 'changed' end,$a$;
  n5 text := $a$      case when v_kind = 'record' and p_answer->>'assertion' = 'changed' then 'changed' else case v_kind when 'unchanged' then 'unchanged' when 'changed' then 'changed' end end,$a$;
  v_nl text;
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  if position('241 · רשומה' in v_def) > 0 then raise notice '241: portal_submit_tax_info — כבר הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a2 := replace(a2, E'\n', v_nl); n2 := replace(n2, E'\n', v_nl); n4 := replace(n4, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '241: עוגן «אין מסמך» לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then raise exception '241: עוגן v_kind=unavailable לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a3, ''))) / length(a3) <> 1 then raise exception '241: עוגן רשימת הסוגים לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a4, ''))) / length(a4) <> 1 then raise exception '241: עוגן changed לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a5, ''))) / length(a5) <> 1 then raise exception '241: עוגן client_assertion לא נמצא פעם אחת'; end if;
  v_new := replace(replace(replace(replace(replace(v_def, a1, n1), a2, n2 || a2), a3, n3), a4, n4), a5, n5);
  execute v_new;
end
$p2$;

-- ── 3. הדף האישי: מסמכים שהלקוח עוד יעלה ─────────────────────────────────────────────────
-- ‼ שתי שורות בענף 229 (שורה אחת כל עוגן). 232 (staging) מוסיפה ענף משלה אחרי הענף הזה — לא נוגעת בשורות האלה.
-- ‼ השורה של «שאלה אחת» נשמרת כלשונה: 229 בהחלה חוזרת מזהה לפיה את הגרסה הנוכחית.
do $p3$
declare
  v_def text;
  v_nl text;
  a1 text := $a$      select count(*) filter (where a.state = 'published'), count(*) filter (where a.state = 'answered'), count(*) filter (where a.state = 'unavailable')$a$;
  n1 text := $a$      select count(*) filter (where a.state = 'published'), count(*) filter (where a.state = 'answered'), count(*) filter (where a.state = 'unavailable' and coalesce(a.unavailable->>'code', '') <> 'needHelp'),
             count(*) filter (where a.state = 'unavailable' and a.unavailable->>'code' = 'needHelp') /* 241 · מסמכים */$a$;
  a2 text := $a$        into v_ck_total, v_ck_done, v_rq_total from public.tax_info_asks a where a.step_id = s.id;$a$;
  n2 text := $a$        into v_ck_total, v_ck_done, v_rq_total, v_rq_done from public.tax_info_asks a where a.step_id = s.id;$a$;
  -- ‼ שתי שורות של אותה פקודה (הוספת הפריט «בטיפול המשרד») — כל אחת עוגן נפרד, ושתיהן מוחלפות
  a3a text := $a$        v_items := v_items || jsonb_build_object('bucket','office','key','taxinfo_'||s.id,'label',v_label,$a$;
  n3a text := E'        -- 241 · מסמך שהלקוח עוד יעלה («אעלה בהמשך», «עוד לא קיבלתי», «אין לי עדיין» הישן) — פעולה שלו, לא «בטיפול המשרד»\n'
    || E'        v_items := v_items || jsonb_build_object(''bucket'',''action'',''key'',''taxinfo_''||s.id,''label'',v_label,';
  a3 text := $a$          'sub', 'מחכים למסמכים שעוד לא הגיעו — נבקש כשיהיו', 'actionKind','taxInfo','actionValue', s.id);$a$;
  n3 text := E'          ''sub'', case when v_rq_total = 1 then ''נשאר מסמך אחד'' else ''נשארו '' || v_rq_total || '' מסמכים'' end || '' להשלמה · אפשר להעלות כשהם אצלך'', ''actionKind'',''taxInfo'',''actionValue'', s.id);\n'
    || E'      elsif v_rq_done > 0 then\n'
    || E'        -- 241 · «אין לי — צריך עזרה»: אצל המשרד\n'
    || E'        v_items := v_items || jsonb_build_object(''bucket'',''office'',''key'',''taxinfo_''||s.id,''label'',v_label,\n'
    || E'          ''sub'', ''ביקשת עזרה ב'' || case when v_rq_done = 1 then ''מסמך אחד'' else v_rq_done || '' מסמכים'' end || '' — המשרד יחזור אליך'', ''actionKind'',''taxInfo'',''actionValue'', s.id);';
begin
  select pg_get_functiondef('public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure) into v_def;
  if position('241 · מסמכים' in v_def) > 0 then raise notice '241: _portal_step_items — כבר הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  n1 := replace(n1, E'\n', v_nl); n3 := replace(n3, E'\n', v_nl); n3a := replace(n3a, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '241: עוגן הספירה בענף info_collection לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then raise exception '241: עוגן into בענף info_collection לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a3, ''))) / length(a3) <> 1 then raise exception '241: עוגן «מחכים למסמכים» לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a3a, ''))) / length(a3a) <> 1 then raise exception '241: עוגן «בטיפול המשרד» של השלמת מידע לא נמצא פעם אחת'; end if;
  execute replace(replace(replace(replace(v_def, a1, n1), a2, n2), a3a, n3a), a3, n3);
end
$p3$;

-- ── 6. כתובת מתשובה מאושרת — עם ערך קודם והיסטוריה ──────────────────────────────────────
do $p6$
declare
  v_def text;
  v_nl text;
  a1 text := E'    when ''taxFiles'' then\n';
  n1 text := E'    -- 241 · כתובת מגורים מתשובה מאושרת בשאלון (עברית בלבד — נאכף ב-clients_*_hebrew_only)\n'
    || E'    when ''city'' then\n'
    || E'      select to_jsonb(city) into out_current from public.clients where id = p_client_id;\n'
    || E'      if p_write then update public.clients set city = nullif(p_value #>> ''{}'', ''''), field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    || E'    when ''address'' then\n'
    || E'      select to_jsonb(address) into out_current from public.clients where id = p_client_id;\n'
    || E'      if p_write then update public.clients set address = nullif(p_value #>> ''{}'', ''''), field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    || E'    when ''zipCode'' then\n'
    || E'      select to_jsonb(zip_code) into out_current from public.clients where id = p_client_id;\n'
    || E'      if p_write then update public.clients set zip_code = nullif(p_value #>> ''{}'', ''''), field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tax_fact_field_op';
  if position('241 · כתובת' in v_def) > 0 then raise notice '241: _tax_fact_field_op — כבר הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '241: עוגן taxFiles ב-_tax_fact_field_op לא נמצא פעם אחת'; end if;
  if v_def ~ E'when ''(city|address|zipCode)'' then' then raise exception '241: ענף כתובת כבר קיים בגרסה לא מוכרת'; end if;
  execute replace(v_def, a1, n1 || a1);
end
$p6$;
revoke all on function public._tax_fact_field_op(text, text, boolean, jsonb, text) from public, anon, authenticated;

-- ── 4. עבודות מס ─────────────────────────────────────────────────────────────────────────
-- ‼ אותם כללים כמו src/features/taxYear/workMeta.ts › applyWorkMeta (המסך וההדגמה). שינוי כאן ⇒ גם שם.
create or replace function public._tax_work_apply(p_current jsonb, p_meta jsonb, p_kind text, p_mode text, p_client_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  k text;
  w jsonb := coalesce(p_current, '{}'::jsonb);
  d jsonb;
  ev jsonb;
  nv jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_kept jsonb := '[]'::jsonb;
  v_keys text[] := array['addressee','source','sourceNote','deadline','internalTarget','lastAuthorityCheck','createdVia'];
  v_wealth text[] := array['declKind','demand','demandExtension','internalTarget'];
  v_iso text := '^\d{4}-\d{2}-\d{2}$';
begin
  if jsonb_typeof(coalesce(p_meta, '{}'::jsonb)) is distinct from 'object' then return jsonb_build_object('error', 'bad_meta'); end if;
  for k in select jsonb_object_keys(coalesce(p_meta, '{}'::jsonb)) loop
    if p_kind = 'wealth' and k = any(v_wealth) then continue; end if;
    if not (k = any(v_keys)) then return jsonb_build_object('error', 'bad_field'); end if;
  end loop;
  if p_meta ? 'addressee' and coalesce(p_meta->>'addressee', '') not in ('client', 'spouse', 'both') then return jsonb_build_object('error', 'bad_addressee'); end if;
  if p_meta ? 'source' and coalesce(p_meta->>'source', '') not in ('letter', 'portal', 'publication', 'client', 'alignment', 'office', 'other') then return jsonb_build_object('error', 'bad_source'); end if;
  if p_meta ? 'internalTarget' and jsonb_typeof(p_meta->'internalTarget') is distinct from 'null' and coalesce(p_meta->>'internalTarget', '') !~ v_iso then return jsonb_build_object('error', 'bad_date'); end if;
  if p_kind = 'wealth' and p_meta ? 'deadline' then return jsonb_build_object('error', 'use_wealth_demand'); end if;
  if p_meta ? 'lastAuthorityCheck' and left(coalesce(p_meta->'lastAuthorityCheck'->>'at', ''), 10) !~ v_iso then return jsonb_build_object('error', 'bad_date'); end if;
  if p_meta ? 'deadline' then
    d := p_meta->'deadline';
    if jsonb_typeof(d) is distinct from 'object' or coalesce(d->>'status', '') not in ('reported', 'verified') then return jsonb_build_object('error', 'bad_status'); end if;
    if d ? 'due' and coalesce(d->>'due', '') !~ v_iso then return jsonb_build_object('error', 'bad_date'); end if;
    if d ? 'extension' and (coalesce(d->'extension'->>'until', '') !~ v_iso or (d->>'due' is not null and d->'extension'->>'until' < d->>'due')) then
      return jsonb_build_object('error', 'bad_extension');
    end if;
    if d->>'status' = 'verified' then
      -- ‼ «רשמי» רק עם בסיס: פרסום בשמו (חל על כולם), מסמך בתיק של הלקוח הזה, או רשומה מאושרת מהרשות
      ev := d->'evidence';
      if ev is null or jsonb_typeof(ev) is distinct from 'object' then return jsonb_build_object('error', 'evidence_required'); end if;
      if ev->>'kind' = 'publication' then
        if nullif(btrim(coalesce(ev->>'label', '')), '') is null then return jsonb_build_object('error', 'evidence_required'); end if;
      elsif nullif(ev->>'documentId', '') is not null then
        if not exists (select 1 from public.documents x where x.id = ev->>'documentId' and x.client_id = p_client_id) then return jsonb_build_object('error', 'evidence_not_found'); end if;
      elsif nullif(ev->>'recordId', '') is not null then
        if not exists (select 1 from public.tax_fact_changes x where x.id::text = ev->>'recordId' and x.client_id = p_client_id and x.status = 'accepted') then return jsonb_build_object('error', 'evidence_not_found'); end if;
      else
        return jsonb_build_object('error', 'evidence_required');
      end if;
      if d->>'due' is null then return jsonb_build_object('error', 'due_required'); end if;
    end if;
  end if;
  foreach k in array v_keys loop
    if not (p_meta ? k) then continue; end if;
    if p_kind = 'wealth' and k = any(v_wealth) then continue; end if;
    nv := p_meta->k;
    if k = 'createdVia' and w ? k then continue; end if;  -- איך נוצרה — רק בפעם הראשונה
    if p_mode = 'create' and w ? k and (w->k) is distinct from nv then v_kept := v_kept || to_jsonb(k); continue; end if;
    w := case when jsonb_typeof(nv) = 'null' then w - k else w || jsonb_build_object(k, nv) end;
    v_applied := v_applied || to_jsonb(k);
  end loop;
  return jsonb_build_object('work', w, 'applied', v_applied, 'kept', v_kept);
end $$;
revoke all on function public._tax_work_apply(jsonb, jsonb, text, text, text) from public, anon, authenticated;

-- הוספה או קישור: אידמפוטנטי לפי זהות העבודה (דרך ensure_*). פרט שכבר רשום ושונה — לא נדרס, חוזר ב-kept.
-- ‼ הכול או כלום: שגיאה אחרי היצירה מבטלת גם את היצירה (exception) — בלי עבודה חצי-רשומה.
create or replace function public.upsert_tax_work(p_client_id text, p_kind text, p_tax_year int, p_as_of date, p_meta jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.clients%rowtype;
  r jsonb;
  st public.onboarding_steps%rowtype;
  m jsonb;
  u jsonb;
  v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
  v_patch jsonb := '{}'::jsonb;
  v_kept jsonb;
begin
  c := public._tax_year_client(p_client_id);
  if p_kind not in ('annual', 'wealth') then return jsonb_build_object('ok', false, 'error', 'bad_kind'); end if;
  if jsonb_typeof(v_meta) is distinct from 'object' then return jsonb_build_object('ok', false, 'error', 'bad_meta'); end if;
  -- דוח שנתי — רק לשנה שהסתיימה
  if p_kind = 'annual' and (p_tax_year is null or p_tax_year >= extract(year from current_date)::int) then return jsonb_build_object('ok', false, 'error', 'year_not_ended'); end if;
  -- בדיקת הפרטים לפני כל יצירה
  m := public._tax_work_apply(null, v_meta - 'declKind' - 'demand' - 'demandExtension', p_kind, 'create', p_client_id);
  if m ? 'error' then return jsonb_build_object('ok', false, 'error', m->>'error'); end if;

  r := case p_kind when 'annual' then public.ensure_tax_year_request(p_client_id, 'annual', p_tax_year, null)
                   else public.ensure_wealth_declaration(p_client_id, p_as_of, v_meta->>'declKind') end;
  if coalesce(r->>'ok', 'false') <> 'true' then return r; end if;
  select * into st from public.onboarding_steps where id = r->>'stepId' for update;

  m := public._tax_work_apply(st.payload->'work', v_meta - 'declKind' - 'demand' - 'demandExtension', p_kind, 'create', p_client_id);
  if m ? 'error' then raise exception '%', m->>'error' using errcode = 'P0001'; end if;
  v_kept := m->'kept';

  -- ‼ הצהרת הון: דרישה, ארכה ויעד פנימי — במודל של 230 (update_wealth_declaration); מה שכבר רשום לא נדרס
  if p_kind = 'wealth' then
    if v_meta ? 'demand' and jsonb_typeof(v_meta->'demand') = 'object' then
      if st.payload ? 'demand' then v_kept := v_kept || '"demand"'::jsonb;
      else
        v_patch := v_patch || jsonb_build_object('demand', v_meta->'demand');
        if v_meta ? 'demandExtension' and jsonb_typeof(v_meta->'demandExtension') = 'object' then v_patch := v_patch || jsonb_build_object('demandExtension', v_meta->'demandExtension'); end if;
      end if;
    end if;
    if nullif(v_meta->>'internalTarget', '') is not null then
      if st.payload ? 'internalTarget' then
        if st.payload->>'internalTarget' <> v_meta->>'internalTarget' then v_kept := v_kept || '"internalTarget"'::jsonb; end if;
      else v_patch := v_patch || jsonb_build_object('internalTarget', v_meta->'internalTarget');
      end if;
    end if;
    if v_patch <> '{}'::jsonb then
      u := public.update_wealth_declaration(st.id, v_patch, null);
      if coalesce(u->>'ok', 'false') <> 'true' then raise exception '%', coalesce(u->>'error', 'failed') using errcode = 'P0001'; end if;
      select * into st from public.onboarding_steps where id = st.id;
    end if;
  end if;

  update public.onboarding_steps set
    payload = st.payload || jsonb_build_object('work', m->'work',
      'workLog', coalesce(st.payload->'workLog', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'at', now(), 'by', auth.uid(), 'what', case when (r->>'created')::boolean then 'created' else 'linked' end, 'applied', m->'applied', 'kept', v_kept))),
    updated_at = now()
  where id = st.id;
  return jsonb_build_object('ok', true, 'stepId', st.id, 'created', coalesce((r->>'created')::boolean, false), 'kept', v_kept);
end $$;
revoke all on function public.upsert_tax_work(text, text, int, date, jsonb) from public, anon;
grant execute on function public.upsert_tax_work(text, text, int, date, jsonb) to authenticated;

-- עריכה בתוך העבודה: מחליף, ונרשם ביומן. ‼ דוח שנתי בלבד ל-deadline; בהצהרת הון — update_wealth_declaration.
create or replace function public.update_tax_work(p_step_id text, p_patch jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  st public.onboarding_steps%rowtype;
  c public.clients%rowtype;
  m jsonb;
begin
  select * into st from public.onboarding_steps where id = p_step_id for update;
  if st.id is null or st.step_type not in ('annual_return', 'wealth_declaration') then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  c := public._tax_year_client(st.client_id);
  if st.status in ('completed','verified','skipped','cancelled','failed') then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  m := public._tax_work_apply(st.payload->'work', coalesce(p_patch, '{}'::jsonb), case st.step_type when 'annual_return' then 'annual' else 'wealth' end, 'update', st.client_id);
  if m ? 'error' then return jsonb_build_object('ok', false, 'error', m->>'error'); end if;
  update public.onboarding_steps set
    payload = st.payload || jsonb_build_object('work', m->'work',
      'workLog', coalesce(st.payload->'workLog', '[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'at', now(), 'by', auth.uid(), 'what', 'updated', 'applied', m->'applied', 'note', nullif(btrim(coalesce(p_note, '')), ''))))),
    updated_at = now()
  where id = st.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.update_tax_work(text, jsonb, text) from public, anon;
grant execute on function public.update_tax_work(text, jsonb, text) to authenticated;

-- ── 5. מסמך מכמה קבצים: עקיבות (מהדף האישי, אחרי ההעלאה) ──────────────────────────────────
-- ‼ רק לראיה האחרונה של אותה שאלה, של אותו לקוח (לפי הטוקן), ורק כשהיא עוד לא נבדקה.
create or replace function public.portal_note_tax_evidence_parts(p_token text, p_ask_id uuid, p_parts jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c public.clients%rowtype;
  v_ev uuid;
  v_parts jsonb;
  v_note text;
begin
  c := public._portal_client(p_token);
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if not exists (select 1 from public.tax_info_asks a where a.id = p_ask_id and a.client_id = c.id) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if jsonb_typeof(p_parts) is distinct from 'array' or jsonb_array_length(p_parts) > 40 or length(p_parts::text) > 20000 then return jsonb_build_object('ok', false, 'error', 'bad_parts'); end if;
  select id into v_ev from public.tax_evidence e where e.ask_id = p_ask_id and e.client_id = c.id and e.review = 'needs_review' order by e.received_at desc limit 1;
  if v_ev is null then return jsonb_build_object('ok', false, 'error', 'no_evidence'); end if;
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'page', (x->>'page')::int, 'part', left(x->>'part', 80), 'name', left(x->>'name', 160), 'type', left(x->>'type', 80),
           'size', case when jsonb_typeof(x->'size') = 'number' then x->'size' end, 'rotation', case when x->>'rotation' in ('90','180','270') then (x->>'rotation')::int end))),
         'נבנה מ-' || count(*) || ' קבצים: ' || string_agg(left(x->>'part', 80) || ' (' || left(x->>'name', 160) || ')', ', ')
    into v_parts, v_note
    from jsonb_array_elements(p_parts) x where jsonb_typeof(x) = 'object';
  update public.tax_evidence set parts = coalesce(v_parts, '[]'::jsonb),
    note = concat_ws(' · ', nullif(note, ''), v_note) where id = v_ev;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.portal_note_tax_evidence_parts(text, uuid, jsonb) from public;
grant execute on function public.portal_note_tax_evidence_parts(text, uuid, jsonb) to anon, authenticated;

-- ‼ לאמת אחרי ההחלה (בלוקי DO):
--   select proname, prosrc like '%241 ·%' from pg_proc where proname in ('add_tax_info_asks','portal_submit_tax_info','_portal_step_items','_tax_fact_field_op');
