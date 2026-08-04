-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_type text
CREATE OR REPLACE FUNCTION public.onboarding_track_for(p_step_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_step_type
    when 'representation' then 'authorities'
    when 'representation_upgrade' then 'authorities'
    when 'file_opening' then 'authorities'
    when 'release_letter' then 'prev_accountant'
    when 'materials_received' then 'prev_accountant'
    when 'prev_accountant_details' then 'prev_accountant'
    when 'paperless_invite' then 'tools'
    when 'paperless_connection' then 'tools'
    when 'data_import' then 'tools'
    when 'data_verification' then 'tools'
    when 'client_documents' then 'tools'
    when 'retainer_authorization' then 'payment'
    when 'internal_setup' then 'internal'
    when 'kyc_identification' then 'internal'
    when 'intake_questionnaire' then 'internal'
    when 'first_month_review' then 'review'
    when 'custom_request' then 'custom'
    else 'custom' end;
$function$

