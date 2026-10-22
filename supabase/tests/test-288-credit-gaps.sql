-- בדיקות 288 — ענפי הזיכויים ב-_tax_fact_field_op. רץ בתוך טרנזקציה ומתגלגל אחורה.
--   node scripts/staging-apply-migration.mjs supabase/tests/test-288-credit-gaps.sql
begin;
do $t$
declare
  u uuid := (select user_id from public.clients group by user_id order by count(*) desc limit 1);
  v_id text := 'test288-' || replace(gen_random_uuid()::text, '-', '');
  c public.clients;
  r record;
begin
  insert into public.clients (id, user_id, first_name, last_name, family_status) values (v_id, u, 'בדיקה', 'זיכויים', 'married');

  -- A. חודש השחרור / חודשי השירות / מזונות — ממחרוזת וממספר
  select * into r from public._tax_fact_field_op(v_id, 'idfReleaseMonth', true, to_jsonb('8'::text), 'test');
  select * into r from public._tax_fact_field_op(v_id, 'serviceMonths', true, to_jsonb(32), 'test');
  select * into r from public._tax_fact_field_op(v_id, 'paysAlimonyToEx', true, to_jsonb(true), 'test');
  select * into c from public.clients where id = v_id;
  if c.idf_release_month is distinct from 8 or c.service_months is distinct from 32 or c.pays_alimony_to_ex is not true
  then raise exception 'A %', row_to_json(c); end if;

  -- B. spouse — מיזוג: הקריאה השנייה לא מוחקת את מה שהראשונה כתבה
  select * into r from public._tax_fact_field_op(v_id, 'spouse', true, '{"firstName":"ישראלה","gender":"female"}'::jsonb, 'test');
  select * into r from public._tax_fact_field_op(v_id, 'spouse', true, '{"serviceMonths":24,"idfReleaseMonth":6}'::jsonb, 'test');
  select * into c from public.clients where id = v_id;
  if c.spouse->>'gender' is distinct from 'female' or (c.spouse->>'serviceMonths')::int is distinct from 24 or c.spouse->>'firstName' is distinct from 'ישראלה'
  then raise exception 'B %', c.spouse; end if;

  -- C. ערך ריק מנקה
  select * into r from public._tax_fact_field_op(v_id, 'serviceMonths', true, 'null'::jsonb, 'test');
  select * into c from public.clients where id = v_id;
  if c.service_months is not null then raise exception 'C %', c.service_months; end if;

  -- D. שמירה רגילה של העמודות החדשות נחסמת — הן עוברות דרך העובדות (עם היסטוריה)
  if not ('spouse' = any(public._governed_client_columns()) and 'idf_release_month' = any(public._governed_client_columns())
          and 'pays_alimony_to_ex' = any(public._governed_client_columns())) then raise exception 'D'; end if;

  raise notice '288: כל הבדיקות עברו';
end
$t$;
rollback;
