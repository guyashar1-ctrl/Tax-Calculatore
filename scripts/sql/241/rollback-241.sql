-- ════════════════════════════════════════════════════════════════════════════
-- התאוששות מ-241 (סבב האיסוף) — נוצר ב-scripts/sql/241/make-rollback-241.mjs (לא לערוך ביד)
-- ════════════════════════════════════════════════════════════════════════════
-- ‼ הופך את ההזרקות על הגוף החי (בסדר הפוך), מוחק את ארבע הפונקציות החדשות ומחזיר את רשימת הפריטים של 236.
-- ‼ נתונים: שום תשובה לא נמחקת. עובדות מובנות שכבר נשמרו נשארות (המשרד רואה אותן כטקסט); שאלות מסוג רשומה שעוד
--   לא נענו — מבוטלות (הדף האישי הישן לא יודע להציג אותן); הצעות כתובת ממתינות — נדחות עם הערה (בלי 241 אין להן
--   ענף כתיבה). עמודת tax_evidence.parts נשארת (לא מזיקה; מחיקתה הייתה מוחקת עקיבות).
-- ‼ כרטיסים: מה שנכנס לכרטיס (ילדים, בנק, כתובת…) נכנס דרך tax_fact_changes, עם היסטוריה — ונשאר.

begin;

update public.tax_info_asks set state = 'cancelled'
 where state in ('draft', 'published') and prompt->'input'->>'kind' = 'record';
update public.tax_fact_changes set status = 'rejected', note = concat_ws(' · ', note, 'בוטל בהחזרת 241'), decided_at = now()
 where status = 'pending' and field_key in ('city', 'address', 'zipCode');

drop function if exists public.portal_note_tax_evidence_parts(text, uuid, jsonb);
drop function if exists public.update_tax_work(text, jsonb, text);
drop function if exists public.upsert_tax_work(text, text, int, date, jsonb);
drop function if exists public._tax_work_apply(jsonb, jsonb, text, text, text);

do $r6$
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
  if position('241 · כתובת' in v_def) = 0 then raise notice '241↩: _tax_fact_field_op — אין מה להחזיר'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl);
  n1 := n1 || a1;
  if (length(v_def) - length(replace(v_def, n1, ''))) / length(n1) <> 1 then raise exception '241↩: ענפי הכתובת — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;
  execute replace(v_def, n1, a1);
end
$r6$;
revoke all on function public._tax_fact_field_op(text, text, boolean, jsonb, text) from public, anon, authenticated;

do $r3$
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
  if position('241 · מסמכים' in v_def) = 0 then raise notice '241↩: _portal_step_items — אין מה להחזיר'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  n1 := replace(n1, E'\n', v_nl); n3 := replace(n3, E'\n', v_nl); n3a := replace(n3a, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, n1, ''))) / length(n1) <> 1 then raise exception '241↩: הספירה — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;
  if (length(v_def) - length(replace(v_def, n2, ''))) / length(n2) <> 1 then raise exception '241↩: into — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;
  if (length(v_def) - length(replace(v_def, n3a, ''))) / length(n3a) <> 1 then raise exception '241↩: פריט הפעולה — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;
  if (length(v_def) - length(replace(v_def, n3, ''))) / length(n3) <> 1 then raise exception '241↩: מסמכים / עזרה — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;
  execute replace(replace(replace(replace(v_def, n3, a3), n3a, a3a), n2, a2), n1, a1);
end
$r3$;

do $r2$
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
  if position('241 · רשומה' in v_def) = 0 then raise notice '241↩: portal_submit_tax_info — אין מה להחזיר'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a2 := replace(a2, E'\n', v_nl); n2 := replace(n2, E'\n', v_nl); n4 := replace(n4, E'\n', v_nl);
  n2 := n2 || a2;
  if (length(v_def) - length(replace(v_def, n1, ''))) / length(n1) <> 1 then raise exception '241↩: סיבה — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;
  if (length(v_def) - length(replace(v_def, n2, ''))) / length(n2) <> 1 then raise exception '241↩: רשומה — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;
  if (length(v_def) - length(replace(v_def, n3, ''))) / length(n3) <> 1 then raise exception '241↩: רשימת הסוגים — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;
  if (length(v_def) - length(replace(v_def, n4, ''))) / length(n4) <> 1 then raise exception '241↩: ערך רשומה — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;
  if (length(v_def) - length(replace(v_def, n5, ''))) / length(n5) <> 1 then raise exception '241↩: client_assertion — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;
  execute replace(replace(replace(replace(replace(v_def, n5, a5), n4, a4), n3, a3), n2, a2), n1, a1);
end
$r2$;

do $r1$
declare
  v_def text;
  -- add_tax_info_asks — סוג קלט חדש
  a1 text := $a$('yesno','amount','date','text','choice','confirm','file','who')$a$;
  n1 text := $a$('yesno','amount','date','text','choice','confirm','file','who','record' /* 241 · רשומה */)$a$;
begin
  select pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) into v_def;
  if position('241 · רשומה' in v_def) = 0 then raise notice '241↩: add_tax_info_asks — אין מה להחזיר'; return; end if;
  if (length(v_def) - length(replace(v_def, n1, ''))) / length(n1) <> 1 then raise exception '241↩: סוגי הקלט — לא נמצא פעם אחת (הגוף השתנה אחרי 241?)'; end if;
  execute replace(v_def, n1, a1);
end
$r1$;

-- רשימת הפריטים של 236
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
revoke all on function public._tax_year_items() from public, anon, authenticated;

commit;

-- לאמת: select proname from pg_proc where prosrc like '%241 ·%';  — צריך להחזיר אפס שורות
