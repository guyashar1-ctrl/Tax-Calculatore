-- בדיקות 285 — כתובת מרשימה סגורה ויישוב מזכה מהכתובת. רץ בתוך טרנזקציה ומתגלגל אחורה.
--   node scripts/staging-apply-migration.mjs supabase/tests/test-285-address.sql
-- כל כישלון = exception עם מספר הבדיקה.
begin;
do $t$
declare
  u uuid := (select user_id from public.clients group by user_id order by count(*) desc limit 1);
  v_id text := 'test285-' || replace(gen_random_uuid()::text, '-', '');
  c public.clients;
  r record;
begin
  -- A.1 עיר + רחוב מהרשימה ⇒ סמלים, מספר, דירה, יישוב מזכה
  insert into public.clients (id, user_id, first_name, last_name, city, address)
  values (v_id, u, 'בדיקה', 'כתובת', 'שדרות', 'הרצל 8, דירה 3');
  select * into c from public.clients where clients.id = v_id;
  if c.city_code is distinct from 1031 or c.street_code is distinct from 158 or c.house_number is distinct from '8'
     or c.apartment is distinct from '3' or c.qualifying_settlement_id is distinct from 'שדרות' or c.address <> 'הרצל 8, דירה 3'
  then raise exception 'A.1 %', row_to_json(c); end if;

  -- A.2 «תל אביב» ⇒ השם הרשמי, לא יישוב מזכה; הרחוב נבדק מחדש מול היישוב החדש
  update public.clients set city = 'תל אביב', address = 'דיזנגוף 50' where clients.id = v_id;
  select * into c from public.clients where clients.id = v_id;
  if c.city_code is distinct from 5000 or c.city <> 'תל אביב - יפו' or c.qualifying_settlement_id <> '' or c.street_code is null
  then raise exception 'A.2 %', row_to_json(c); end if;

  -- A.3 «קריית שמונה» (כתיב מלא) ⇒ 2800, והשם של רשימת היישובים המזכים
  update public.clients set city = 'קריית שמונה', address = 'שדרות הגבורה החדשה 12' where clients.id = v_id;
  select * into c from public.clients where clients.id = v_id;
  if c.city_code is distinct from 2800 or c.qualifying_settlement_id <> 'קריית שמונה'
     or c.street_code is not null or c.street_name <> 'שדרות הגבורה החדשה' or c.house_number <> '12'
  then raise exception 'A.3 (רחוב שלא ברשימה) %', row_to_json(c); end if;

  -- A.4 קיבוץ: הרחוב הוא שם היישוב (סמל 9000)
  update public.clients set city = 'בארי', address = 'בארי' where clients.id = v_id;
  select * into c from public.clients where clients.id = v_id;
  if c.city_code is distinct from 399 or c.street_code is distinct from 9000 or c.qualifying_settlement_id <> 'בארי'
  then raise exception 'A.4 %', row_to_json(c); end if;

  -- A.5 יישוב שלא זוהה ⇒ אין סמל, והיישוב המזכה שהיה — לא נמחק
  update public.clients set city = 'עיר שאינה קיימת' where clients.id = v_id;
  select * into c from public.clients where clients.id = v_id;
  if c.city_code is not null or c.qualifying_settlement_id <> 'בארי' or c.city <> 'עיר שאינה קיימת'
  then raise exception 'A.5 %', row_to_json(c); end if;

  -- B.1 קביעה ידנית בתיק המס ⇒ override, ומעבר דירה לא דורס אותה
  update public.clients set city = 'שדרות' where clients.id = v_id;
  select * into r from public._tax_fact_field_op(v_id, 'qualifyingSettlementId', true, to_jsonb(''::text), 'test');
  update public.clients set city = 'נתיבות' where clients.id = v_id;
  select * into c from public.clients where clients.id = v_id;
  if not c.qualifying_settlement_override or c.qualifying_settlement_id <> ''
  then raise exception 'B.1 %', row_to_json(c); end if;

  -- B.2 «חזרה לפי הכתובת» ⇒ נגזר שוב
  update public.clients set qualifying_settlement_override = false where clients.id = v_id;
  select * into c from public.clients where clients.id = v_id;
  if c.qualifying_settlement_id <> 'נתיבות' or c.qualifying_settlement_note is not null
  then raise exception 'B.2 %', row_to_json(c); end if;

  -- B.3 עדכון שלא נוגע בכתובת לא משנה את החלקים
  update public.clients set phone = '0500000000' where clients.id = v_id;
  select * into c from public.clients where clients.id = v_id;
  if c.city_code is distinct from 1110 and c.city_code is null then raise exception 'B.3 %', row_to_json(c); end if;

  -- C. פירוק כתובות
  select * into r from public._il_address_parts(3000, 'דוד 3');
  if r.apartment is not null then raise exception 'C.1 «דוד 3» נקרא כדירה %', row_to_json(r); end if;
  select * into r from public._il_address_parts(1031, 'רחוב הרצל 8/2');
  if r.street_code is distinct from 158 or r.house_number <> '8' or r.apartment <> '2' then raise exception 'C.2 %', row_to_json(r); end if;
  select * into r from public._il_address_parts(1031, 'הרצל 8 ד׳ 4');
  if r.house_number <> '8' or r.apartment <> '4' then raise exception 'C.3 %', row_to_json(r); end if;
  select * into r from public._il_address_parts(null, 'הרצל 8');
  if r.street_code is not null or r.street_name <> 'הרצל' or r.house_number <> '8' then raise exception 'C.4 %', row_to_json(r); end if;

  -- D. גישה: דף הקליטה (anon) קורא את הרשימות
  if jsonb_array_length(public.il_localities_list()) < 1200 then raise exception 'D.1'; end if;
  if jsonb_array_length(public.il_streets_for(1031)) < 100 then raise exception 'D.2'; end if;
  if not has_function_privilege('anon', 'public.il_streets_for(integer)', 'execute') then raise exception 'D.3'; end if;
  if has_table_privilege('anon', 'public.il_streets', 'insert') then raise exception 'D.4 anon כותב לרשימה'; end if;

  raise notice '285: כל הבדיקות עברו';
end
$t$;
rollback;
