-- החזרה של 247 (טפסים שהלקוח ממלא וחותם). ‼ נעצר אם יש הגשות 4440/821 — אותן מבטלים/מנקים קודם, בהחלטה.
do $rb$
declare v text; a text; n text; v_nl text; fn text;
begin
  if exists (select 1 from public.smart_form_filings where template_key in ('ita-4440', 'vat-821')) then
    raise exception 'rollback-247: יש הגשות 4440/821 — לא מחזירים מעליהן';
  end if;

  -- הסרת ההזרקות: מוחקים בדיוק את השורות שהוזרקו (סימון «247 ·» והשורות שאחריו)
  for fn in select unnest(array['_portal_step_items', '_smart_form_sync_step', 'smart_form_start', 'assert_domain_function_invariants']) loop
    select pg_get_functiondef(p.oid) into v from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = fn;
    if position('247 ·' in v) = 0 then continue; end if;
    -- ‼ השורות שהוזרקו נכתבו בסוף השורה של העוגן (CRLF או LF — גוף חי עשוי לערבב): מסירים את שתי הגרסאות
    v_nl := E'\r\n';
    if fn = '_portal_step_items' then
      n := E'      -- 247 · טופס חכם שהלקוח ממלא וחותם בדף (4440/821) — הפריט נגזר מההיטל smartForm\n'
        || E'      if s.payload #>> ''{smartForm,clientFill}'' = ''true'' then\n'
        || E'        v_items := v_items || public._smart_form_portal_item(s, p_ctx);\n'
        || E'        exit step_body;\n'
        || E'      end if;\n';
      v := replace(replace(v, replace(n, E'\n', v_nl), ''), n, '');
    elsif fn = '_smart_form_sync_step' then
      n := E'  -- 247 · טפסים שהלקוח ממלא וחותם — היטל משלהם\n'
        || E'  if public._scf_is_client_form(f.template_key) then perform public._smart_form_sync_client_step(f.id); return; end if;\n';
      v := replace(replace(v, replace(n, E'\n', v_nl), ''), n, '');
    elsif fn = 'smart_form_start' then
      n := E'  -- 247 · טופס שהלקוח ממלא נפתח ב-smart_form_client_start בלבד\n'
        || E'  if coalesce((t->>''clientFill'')::boolean, false) then return jsonb_build_object(''ok'', false, ''error'', ''use_client_start''); end if;\n';
      v := replace(replace(v, replace(n, E'\n', v_nl), ''), n, '');
    else
      a := E'    ''onboarding_set_no_license''\n';
      n := E'    ''onboarding_set_no_license'',\n'
        || E'    -- 247 · טופס חכם בדף האישי — טוקן הדף בלבד, אותו שער כמו portal_submit_step\n'
        || E'    ''portal_smart_form_get'', ''portal_smart_form_save'', ''portal_smart_form_prepare'', ''portal_smart_form_sign''\n';
      v := replace(replace(v, replace(n, E'\n', v_nl), replace(a, E'\n', v_nl)), n, a);
    end if;
    if position('247 ·' in v) > 0 then raise exception 'rollback-247: ההזרקה ב-% לא הוסרה במלואה', fn; end if;
    execute v;
  end loop;
end
$rb$;

drop function if exists public.portal_smart_form_sign(text, text, text, text, boolean);
drop function if exists public.portal_smart_form_prepare(text, text);
drop function if exists public.portal_smart_form_save(text, text, jsonb);
drop function if exists public.portal_smart_form_get(text, text);
drop function if exists public._scf_portal_resolve(text, text);
drop function if exists public.smart_form_client_view(text);
drop function if exists public.smart_form_client_fill(text, jsonb);
drop function if exists public.smart_form_client_start(text, text, boolean);
drop function if exists public._smart_form_portal_item(public.onboarding_steps, jsonb);
drop function if exists public._smart_form_sync_client_step(text);
drop function if exists public._scf_lock(text, text);
drop function if exists public._scf_data(text);
drop function if exists public._scf_apply(text, jsonb, text);
drop function if exists public._scf_invalid(text, text);
drop function if exists public._scf_card(public.clients);
drop function if exists public._scf_bank_index(public.clients);
drop function if exists public._scf_business_index(public.clients);
drop function if exists public._scf_split_address(text);
drop function if exists public._scf_spec(text);
drop function if exists public._scf_is_client_form(text);

create or replace function public._smart_form_template(p_key text)
returns jsonb language sql stable set search_path to 'public' as $$
  select case p_key
    when 'btl-6101' then jsonb_build_object(
      'version', '06.2026',
      'sha256', '79e4f387e851cf1a8218c52c4991321e9daae39f3c02f235aeaa3287c3d93754',
      'mappingVersion', coalesce((select max(m.version) from public.smart_form_mappings m
                                   where m.template_key = p_key and m.status = 'published'), 2),
      'codeBase', 2,
      'title', 'דין וחשבון רב שנתי (6101) · ביטוח לאומי',
      'purposes', jsonb_build_array('multi_year_report', 'start', 'change', 'end', 'stop_employees', 'spouse_in_business', 'update_details'))
    else null end;
$$;

alter table public.smart_form_filings drop constraint if exists smart_form_filings_template_key_check;
alter table public.smart_form_filings add constraint smart_form_filings_template_key_check check (template_key = 'btl-6101');
