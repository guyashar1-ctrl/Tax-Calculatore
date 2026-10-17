-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 252 · ענף כלכלי בטופס 821 = קוד מרשימת רשות המסים (591 ענפים), לא אות סדר
-- 16.10.2026 · docs/tax-foundation/research/vat-dealer-classification-2026-10-16.md · docs/PLAN-SMART-CLIENT-FORMS-4440-821.md §9
--
--   _scf_invalid('industry'): קוד של 3–4 ספרות (misim.gov.il/mm_anafim = הסיווג האחיד של הלמ״ס 2011). הרשימה
--   עצמה חיה בקוד (src/data/vatBranches.json) — מקור אחד לשאלון, לכרטיס ולידע המס; השרת בודק צורה בלבד.
--   ערך ישן באות (A..S, מהסבב הראשון של 251) נסבל כדי שלא לדחות רשומה קיימת.
-- ‼ גוף מלא (create or replace) — החלה חוזרת בטוחה. אין שינוי בטבלאות.
-- ‼ החזרה: scripts/sql/252/rollback-252.sql (הגוף של 251).
-- ════════════════════════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if not exists (select 1 from pg_proc where proname = '_scf_missing') then raise exception '252: 251 לא הוחלה (_scf_missing חסרה)'; end if;
end
$guard$;

create or replace function public._scf_invalid(p_key text, p_val text)
returns text language plpgsql immutable set search_path to 'public' as $$
declare v text := btrim(coalesce(p_val, '')); d text;
begin
  if v = '' then return null; end if;
  if length(v) > 300 then return 'too_long'; end if;
  case
    when p_key in ('idNumber', 'spouseIdNumber') then
      if v !~ '^\d{9}$' then return 'bad_id'; end if;
    when p_key in ('mobile', 'landline', 'spousePhone', 'bizPhone') then
      d := regexp_replace(v, '[\s\-]', '', 'g');
      if d !~ '^0\d{8,9}$' then return 'bad_phone'; end if;
    when p_key in ('homeZip', 'mailZip', 'bizZip') then
      if v !~ '^\d{7}$' then return 'bad_zip'; end if;
    when p_key in ('homeStreet', 'homeCity', 'mailStreet', 'mailCity', 'bizStreet', 'bizCity', 'spouseAddress') then
      if not public.is_hebrew_only(v) then return 'hebrew_only'; end if;
    when p_key in ('homeHouse', 'mailHouse', 'bizHouse') then
      if v !~ '^[0-9א-ת/ \-]{1,12}$' then return 'bad_house'; end if;
    when p_key in ('marriageDate', 'separationDate') then
      if v !~ '^\d{4}-\d{2}-\d{2}$' then return 'bad_date'; end if;
      begin
        if v::date > (now() at time zone 'Asia/Jerusalem')::date or v::date < date '1930-01-01' then return 'bad_date'; end if;
      exception when others then return 'bad_date';
      end;
    when p_key = 'openMonth' then
      if v !~ '^\d{4}-(0[1-9]|1[0-2])$' then return 'bad_month'; end if;
    -- 251 · תאריך פתיחה — גם עתידי (עסק שייפתח), עד שלוש שנים קדימה; כמו futureDateError בקוד
    when p_key = 'openDate' then
      if v !~ '^\d{4}-\d{2}-\d{2}$' then return 'bad_date'; end if;
      begin
        if v::date < date '1930-01-01' or extract(year from v::date) > extract(year from (now() at time zone 'Asia/Jerusalem')) + 3 then return 'bad_date'; end if;
      exception when others then return 'bad_date';
      end;
    -- 252 · ענף כלכלי: קוד 3–4 ספרות מרשימת רשות המסים (הרשימה בקוד); אות סדר ישנה (A..S) נסבלת
    when p_key = 'industry' then
      if v !~ '^(\d{3,4}|[A-S])$' then return 'bad_choice'; end if;
    when p_key = 'propExists' then
      if v not in ('yes', 'no') then return 'bad_choice'; end if;
    when p_key = 'dealerKind' then
      if v not in ('exempt', 'licensed') then return 'bad_choice'; end if;
    when p_key = 'incomeYear' then
      if v !~ '^\d{4}$' then return 'bad_year'; end if;
    when p_key in ('incSalary', 'incBusiness', 'incOther', 'spIncSalary', 'spIncBusiness', 'spIncOther') then
      if v <> '1' then return 'bad_choice'; end if;
    when p_key in ('turnover', 'propValue', 'propRent') then
      if v !~ '^\d{1,10}$' then return 'bad_amount'; end if;
    when p_key = 'employees' then
      if v !~ '^\d{1,3}$' or v::int < 1 then return 'bad_number'; end if;
    when p_key = 'gender' then
      if v not in ('male', 'female') then return 'bad_choice'; end if;
    when p_key = 'propKind' then
      if v not in ('store', 'office', 'lot', 'warehouse', 'other') then return 'bad_choice'; end if;
    when p_key = 'propTenure' then
      if v not in ('owned', 'rented') then return 'bad_choice'; end if;
    when p_key in ('mailSame', 'bizAtHome') then
      if v not in ('yes', 'no') then return 'bad_choice'; end if;
    when p_key = 'bankCode' then
      if v !~ '^\d{1,3}$' then return 'bad_bank'; end if;
    when p_key = 'bankBranch' then
      if v !~ '^\d{1,4}$' then return 'bad_branch'; end if;
    when p_key = 'bankAccount' then
      if v !~ '^\d{2,12}$' then return 'bad_account'; end if;
    when p_key = 'email' then
      if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'bad_email'; end if;
    else null;
  end case;
  return null;
end;
$$;
revoke all on function public._scf_invalid(text, text) from public, anon, authenticated;
