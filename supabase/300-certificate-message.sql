-- 300 · אישורים מ-413: ההודעה של שע״ם כשאין אישור ולא ניתן להנפיק (25.10.2026)
--
-- גיא: «לפעמים גם אין אישור ולא ניתן להפיק, ואז צריך לציין את ההודעה». העובד שולח את ההודעה
-- (message) — מהסירוב בכרטיס 413 (למשל «לא ניתן להנפיק אישור גופים - לא קיים תיק מע״מ») או
-- מהדחייה בהנפקה — ו-blocked כשהסירוב הוא כבר בפתיחת הכרטיס (אין טעם בכפתור «הנפק»).
-- נשמרים ב-field_meta.<שדה>.cert לצד המצב, והשורה בכרטיס מציגה אותם.
-- ‼ גוף 297 + שני מפתחות; אותה חתימה, אותן הרשאות.

create or replace function public.record_authority_certificate(
  p_worker_id text, p_job_id text, p_cert jsonb, p_document jsonb default null
) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_ctx    jsonb;
  v_user   uuid;
  v_client text;
  v_kind   text := p_cert->>'kind';
  v_status text := p_cert->>'status';
  v_until  date := nullif(p_cert->>'validUntil', '')::date;
  v_doc    text;
  v_folder text;
  v_label  text;
  v_meta   jsonb;
  v_key    text;
  v_rates  jsonb := coalesce(p_cert->'rates', '[]'::jsonb);
  v_ws     text;
  v_until_txt text := coalesce(to_char(nullif(p_cert->>'validUntil', '')::date, 'DD.MM.YYYY'), '');
begin
  v_ctx := public.automation_job_document_context(p_worker_id, p_job_id);
  if not coalesce((v_ctx->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', coalesce(v_ctx->>'error', 'not_owner_or_finished'));
  end if;
  v_user := (v_ctx->>'user_id')::uuid;
  v_client := v_ctx->>'client_id';
  if v_client is null then return jsonb_build_object('ok', false, 'error', 'job_has_no_client'); end if;
  if v_kind not in ('withholding', 'bookkeeping') or v_status not in ('valid', 'none') then
    return jsonb_build_object('ok', false, 'error', 'bad_certificate');
  end if;

  -- ── 1 · המסמך ──
  if p_document is not null and coalesce(p_document->>'id', '') <> '' then
    v_doc := p_document->>'id';
    v_folder := public._ensure_system_folder(v_user, v_client, null, 'shaam-certificates', 'אישורים ממס הכנסה');
    v_label := public.ensure_automation_document_label(v_user, 'אישור ממס הכנסה');
    insert into public.documents
      (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year,
       label_id, folder_id, description, notes, status)
    values
      (v_doc, v_user, v_client, p_document->>'path', p_document->>'fileName', 'application/pdf',
       coalesce((p_document->>'size')::bigint, 0), 'other', coalesce(p_cert->>'year', 'general'),
       v_label, v_folder, p_document->>'description', 'הודפס אוטומטית משע״ם (413)', 'received')
    -- ‼ אותה גרסה של אותו אישור (אותו מזהה) — מעדכנים את הקובץ בלבד; שם/תיקייה שהמשרד שינה נשמרים.
    on conflict (id) do update set file_size = excluded.file_size, uploaded_at = now()
    where public.documents.client_id = excluded.client_id and public.documents.user_id = excluded.user_id;
  end if;

  v_meta := jsonb_build_object('cert', jsonb_build_object(
    'status', v_status,
    'statusText', p_cert->>'statusText',
    'year', p_cert->'year',
    'validFrom', p_cert->>'validFrom',
    'validUntil', p_cert->>'validUntil',
    'rates', v_rates,
    'ratesText', nullif(p_cert->>'ratesText', ''),
    'newBusiness', coalesce((p_cert->>'newBusiness')::boolean, false),
    'issued', coalesce((p_cert->>'issued')::boolean, false),
    'requested', p_cert->>'requested',
    'note', p_cert->>'note',
    -- 300 · ההודעה של שע״ם כשאין אישור ולא ניתן להנפיק, וסימון «לא ניתן להנפיק» (בלי כפתור הנפקה).
    'message', nullif(p_cert->>'message', ''),
    'blocked', coalesce((p_cert->>'blocked')::boolean, false),
    'documentId', v_doc,
    'jobId', p_job_id,
    'checkedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ));

  -- ── 2 · הכרטיס ──
  if v_kind = 'withholding' then
    v_key := 'withholdingStatus';
    if v_status = 'valid' then
      v_ws := case when jsonb_array_length(v_rates) > 0
                     and not exists (select 1 from jsonb_array_elements(v_rates) r where r->>'rate' <> 'exempt')
                   then 'exempt' else 'rates' end;
      perform public._cert_write_fact(v_user, v_client, 'withholdingStatus', to_jsonb(v_ws), 'ניכוי מס במקור',
        case when v_ws = 'exempt' then 'פטור מניכוי' else 'שיעורים לפי פעילות' end || ' · עד ' || v_until_txt, p_job_id);
      if nullif(p_cert->>'ratesText', '') is not null then
        perform public._cert_write_fact(v_user, v_client, 'withholdingDetail', to_jsonb(p_cert->>'ratesText'), 'פירוט ניכוי',
          p_cert->>'ratesText', p_job_id);
      end if;
    else
      perform public._cert_write_fact(v_user, v_client, 'withholdingStatus', to_jsonb('none'::text), 'ניכוי מס במקור',
        'אין אישור תקף · ' || coalesce(nullif(p_cert->>'message', ''), p_cert->>'statusText', ''), p_job_id);
    end if;
    update public.clients set withholding_valid_until = v_until where id = v_client;
  else
    v_key := 'bookStatus';
    if v_status = 'valid' then
      perform public._cert_write_fact(v_user, v_client, 'bookStatus', to_jsonb('kosher'::text), 'ניהול ספרים',
        'תקין · אישור עד ' || v_until_txt, p_job_id);
    end if;
  end if;

  -- ── 3 · פרטי האישור, ליד השדה ── (אחרי הכתיבה: _tax_fact_field_op מחליף את field_meta של השדה)
  update public.clients
     set field_meta = coalesce(field_meta, '{}'::jsonb)
       || jsonb_build_object(v_key, coalesce(field_meta->v_key, '{}'::jsonb) || v_meta)
   where id = v_client;

  return jsonb_build_object('ok', true, 'documentId', v_doc);
end;
$function$;
revoke all on function public.record_authority_certificate(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_authority_certificate(text, text, jsonb, jsonb) to service_role;
