-- ════════════════════════════════════════════════════════════════════════════
-- 288 · פערי הזיכויים (22.10.2026, גיא אישר את ההמחשה docs/proposals/2026-10-22-credits-card-couple.html)
--
-- ① חודש השחרור וחודשי השירות — החישוב הניח «24 חודשים, ינואר». עכשיו בכרטיס, לכל אחד מבני הזוג
--    (של בן/בת הזוג — בתוך clients.spouse).
-- ② «משלם/ת מזונות לבן/בת זוג לשעבר» (סעיף 40א) — עובדה בכרטיס.
-- ③ פרטי הזיכוי של בן/בת הזוג (clients.spouse) — לא היה להם אף כותב, ולכן אצל זוגות אמיתיים בן/בת
--    הזוג לא חושבו. עכשיו עובדה מנוהלת עם היסטוריה: «spouse» ממזג את מה שנמסר לתוך האובייקט הקיים.
--
-- ‼ ענף ב-_tax_fact_field_op = העמודה נחסמת לשמירה רגילה (_governed_client_columns). לכן המפתחות
--   idfReleaseMonth / serviceMonths / paysAlimonyToEx / spouse נכנסו גם ל-GOVERNED_FACT_KEYS בדפדפן.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.clients
  add column if not exists idf_release_month smallint check (idf_release_month between 1 and 12),
  add column if not exists service_months smallint check (service_months between 0 and 60),
  add column if not exists pays_alimony_to_ex boolean;

do $p288$
declare
  v_def text;
  v_nl text;
  a1 text := E'    when ''taxFiles'' then\n';
  n1 text := E'    -- 288 · זיכויים: חודש השחרור, חודשי השירות, מזונות לבן/בת זוג לשעבר, פרטי בן/בת הזוג\n'
    || E'    when ''idfReleaseMonth'' then\n'
    || E'      select to_jsonb(idf_release_month) into out_current from public.clients where id = p_client_id;\n'
    || E'      if p_write then update public.clients set idf_release_month = nullif(p_value #>> ''{}'', '''')::smallint, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    || E'    when ''serviceMonths'' then\n'
    || E'      select to_jsonb(service_months) into out_current from public.clients where id = p_client_id;\n'
    || E'      if p_write then update public.clients set service_months = nullif(p_value #>> ''{}'', '''')::smallint, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    || E'    when ''paysAlimonyToEx'' then\n'
    || E'      select to_jsonb(pays_alimony_to_ex) into out_current from public.clients where id = p_client_id;\n'
    || E'      if p_write then update public.clients set pays_alimony_to_ex = nullif(p_value #>> ''{}'', '''')::boolean, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n'
    || E'    when ''spouse'' then\n'
    || E'      select spouse into out_current from public.clients where id = p_client_id;\n'
    || E'      if p_write then update public.clients set spouse = case when jsonb_typeof(p_value) = ''object'' then coalesce(spouse, ''{}''::jsonb) || p_value else null end, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n';
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = '_tax_fact_field_op';
  if position('288 · זיכויים' in v_def) > 0 then raise notice '288: _tax_fact_field_op — כבר הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '288: עוגן taxFiles ב-_tax_fact_field_op לא נמצא פעם אחת'; end if;
  if v_def ~ E'when ''(idfReleaseMonth|serviceMonths|paysAlimonyToEx|spouse)'' then' then raise exception '288: ענף זיכויים כבר קיים בגרסה לא מוכרת'; end if;
  execute replace(v_def, a1, n1 || a1);
end
$p288$;
revoke all on function public._tax_fact_field_op(text, text, boolean, jsonb, text) from public, anon, authenticated;

do $$
begin
  if position('288 · זיכויים' in pg_get_functiondef('public._tax_fact_field_op(text,text,boolean,jsonb,text)'::regprocedure)) = 0 then
    raise exception '288: _tax_fact_field_op לא עודכן';
  end if;
  if not ('spouse' = any(public._governed_client_columns()) and 'service_months' = any(public._governed_client_columns())) then
    raise exception '288: העמודות החדשות לא מנוהלות';
  end if;
end;
$$;
