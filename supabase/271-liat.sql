-- ═══════════════════════════════════════════════════════════════════════════
-- 271 · ליאת ואוריה ברנשטיין — אוריה הרשום במס הכנסה, והחתימות בטופס לפיו (21.10.2026)
-- באישור גיא: «fix Liat's form and card (Ouria as registered)». אחרי גיבוי backup_r271_20261021.
--
-- ‼ להריץ רק אחרי ש-271 הוחלה **ואחרי שהקוד עם נעילת החלוקה (submissionItOwner) באוויר** —
--   בלי הנעילה, «אוריה רשום» בכרטיס היה מפצל את מ"ה להגשה חדשה ומציע בקשה שנייה בשע״ם.
-- ‼ שומרים: רק כשהבקשה עוד לפני שליחה לחתימה (awaiting_accountant, בלי חתימות שנשמרו).
--   מה שמשתנה: מקומות החתימה בטופס (אוריה ב«בן זוג רשום», ליאת ב«בן/בת הזוג») והכרטיס.
--   שום מייל, פרסום או פנייה לרשות.
-- ═══════════════════════════════════════════════════════════════════════════
do $$
declare
  v_req    text := '44efa4da044548f08a97eab6270ddb5c';
  v_key    text := 'person:client';
  r        public.representation_requests%rowtype;
  v_reg    text;
  v_fields jsonb;
begin
  select * into r from public.representation_requests where id = v_req for update;
  if r.status <> 'awaiting_accountant' or r.signature_values is not null
     or coalesce(r.execution ->> 'signatureEmailSentAt', '') <> '' then
    raise exception 'liat: request already moved on (status %), not touching', r.status;
  end if;

  v_reg := public._rep_learn_registered_spouse(v_req, v_key);
  if v_reg is distinct from 'spouse' then raise exception 'liat: expected spouse, learned %', v_reg; end if;

  v_fields := public._rep_build_2279_fields(public._rep_registered_signer(v_req, v_key), true);
  update public.representation_requests
     set signature_documents = (
           select jsonb_agg(case when d ->> 'key' = v_key then d || jsonb_build_object('fields', v_fields) else d end order by o)
             from jsonb_array_elements(signature_documents) with ordinality t(d, o)),
         signature_setup = case when signature_setup ->> 'pdfDocId' = (select d ->> 'pdfDocId' from jsonb_array_elements(signature_documents) d where d ->> 'key' = v_key)
                                then signature_setup || jsonb_build_object('fields', v_fields)
                                else signature_setup end,
         updated_at = now()
   where id = v_req;
end;
$$;

select c.registered_spouse_verified,
       (select f ->> 'owner' || ':' || (f ->> 'fileNumber') from jsonb_array_elements(c.tax_files) f where f ->> 'authority' = 'income_tax') as income_tax_file,
       (select jsonb_agg((f ->> 'signerId') || '@' || round((f ->> 'xPct')::numeric, 3)) from jsonb_array_elements(r.signature_documents -> 0 -> 'fields') f where f ->> 'kind' = 'signature') as doc_signatures,
       (select jsonb_agg((f ->> 'signerId') || '@' || round((f ->> 'xPct')::numeric, 3)) from jsonb_array_elements(r.signature_setup -> 'fields') f where f ->> 'kind' = 'signature') as setup_signatures
  from public.representation_requests r join public.clients c on c.id = r.linked_client_id
 where r.id = '44efa4da044548f08a97eab6270ddb5c';
