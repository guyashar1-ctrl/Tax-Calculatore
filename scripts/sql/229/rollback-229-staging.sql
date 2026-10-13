-- ════════════════════════════════════════════════════════════════════════════
-- התאוששות מ-229 על staging בלבד — מחזיר את המצב שנמדד לפני ההחלה (11.10.2026, 07:51 UTC)
-- ════════════════════════════════════════════════════════════════════════════
-- ‼ לא לייצור. מוחק את בקשות שנת המס ואת ארבע הטבלאות של 229 (נתוני בדיקה בלבד ב-staging).
-- מה נמדד לפני: האילוץ על step_type בלי שלושת הסוגים של 229; האינדקס של 220 בלי שלושתם;
-- _portal_step_items עם md5(pg_get_functiondef) = 41260d28e9300ac55c85a8cef022c73a; אין _portal_client.
-- סעיף 12 (נוסף אחרי ההחלה הראשונה): _client_announceable_steps (md5 84dad29ba79ac6fe34632b3e7ad0407d) ו-_client_step_portal_key (md5 ec5001a20d05523b9d37752327554337) בלי «השלמת מידע».

begin;

delete from public.onboarding_steps where step_type in ('tax_estimate', 'annual_return', 'info_collection');

drop function if exists public.ensure_tax_year_request(text, text, int, int);
drop function if exists public.add_tax_info_asks(text, jsonb);
drop function if exists public.resolve_tax_info_note(uuid);
drop function if exists public.cancel_tax_info_ask(uuid);
drop function if exists public.publish_tax_info(text);
drop function if exists public._tax_info_view(text, text);
drop function if exists public.portal_tax_info(text, text);
drop function if exists public.portal_tax_info_preview(text, text);
drop function if exists public.portal_save_tax_info_draft(text, uuid, jsonb);
drop function if exists public.portal_submit_tax_info(text, uuid, jsonb);
drop function if exists public.decide_tax_year_facts(uuid[], text, text);
drop function if exists public.correct_tax_year_fact(uuid, text, jsonb, text);
drop function if exists public.record_tax_year_fact(text, jsonb);
drop function if exists public.review_tax_evidence(uuid, text, text, text, text);
drop function if exists public.decide_card_transfers(text, jsonb);
drop function if exists public.record_legacy_tax_year_facts(text, text, jsonb);
drop function if exists public._tax_year_client(text);
drop function if exists public._tax_answer_period(text, int, int, text, text);
drop function if exists public._tax_doc_follow_up(text, int, date);
drop function if exists public._tax_year_items();
drop function if exists public._portal_client(text);

drop table if exists public.tax_card_transfers;
drop table if exists public.tax_info_asks;
drop table if exists public.tax_year_facts;
drop table if exists public.tax_evidence;

drop index if exists public.onboarding_steps_tax_year_open_idx;
drop index if exists public.onboarding_steps_info_collection_open_idx;
drop index if exists public.onboarding_steps_person_type_idx;
create unique index onboarding_steps_person_type_idx on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status <> 'cancelled'
    and step_type <> all (array['custom_request', 'authority_representation', 'client_documents',
      'prev_accountant_details', 'release_letter', 'materials_received', 'intake_questionnaire',
      'retainer_authorization', 'business_details']);

alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;
alter table public.onboarding_steps add constraint onboarding_steps_step_type_check
  check (step_type = any (array[
    'representation', 'file_opening', 'representation_upgrade', 'release_letter', 'rep_client_approval',
    'materials_received', 'paperless_invite', 'paperless_connection', 'paperless_tax_authority',
    'data_import', 'data_verification', 'retainer_authorization', 'internal_setup', 'kyc_identification',
    'first_month_review', 'intake_questionnaire', 'client_documents', 'prev_accountant_details',
    'custom_request', 'institution_alignment_btl', 'institution_alignment_vat',
    'institution_alignment_income', 'opening_call', 'authority_representation',
    'business_details']));

-- הסרת ענף «השלמת מידע» מ-_portal_step_items: מוציאים את הבלוק מתחילת הסימון ועד העוגן.
do $undo$
declare
  v_def text;
  v_start int;
  v_anchor text := E'    else\n      exit step_body;\n    end case;';
  v_end int;
begin
  select pg_get_functiondef('public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure) into v_def;
  v_start := position(E'    when ''info_collection'' then\n' in v_def);
  if v_start = 0 then raise notice 'אין ענף 229 — אין מה להסיר'; return; end if;
  v_end := position(v_anchor in substr(v_def, v_start)) + v_start - 1;
  execute substr(v_def, 1, v_start - 1) || substr(v_def, v_end);
end
$undo$;

-- סעיף 12: הסרת «השלמת מידע» מהרשימה של «שלח בקשות» וממפתח הדף.
do $undo12$
declare v_def text;
begin
  if to_regprocedure('public._client_announceable_steps(text)') is not null then
    v_def := pg_get_functiondef('public._client_announceable_steps(text)'::regprocedure);
    v_def := replace(v_def, E'
     and (s.step_type <> ''info_collection'' or coalesce(s.ball, ''client'') = ''client'')', '');
    v_def := replace(v_def, E',
                         -- 229 · «השלמת מידע» — רק כשהיא אצל הלקוח
                         ''info_collection'')', ')');
    execute v_def;
  end if;
  if to_regprocedure('public._client_step_portal_key(text, text)') is not null then
    v_def := pg_get_functiondef('public._client_step_portal_key(text, text)'::regprocedure);
    execute replace(v_def, E'when ''info_collection'' then ''taxinfo_'' || p_step_id
           ', '');
  end if;
end
$undo12$;

-- אימות: להשוות לטביעה שנרשמה **לפני** החלת 229 בסביבה הזו (בייצור 12.10.2026, אחרי 234/239 של master:
--   _portal_step_items = 1f4b54e8fd9ca52aac0a36c85e13d0cd). הטביעה 41260d… היא של staging לפני 234 — לא קבועה.
select md5(pg_get_functiondef('public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure)) as portal_step_items_md5_after_rollback;

commit;
