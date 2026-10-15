-- החזרה של 246: smart_form_advance כמו ב-206 (בלי היקף ביטול).
create or replace function public.smart_form_advance(p_filing_id text, p_action text, p_detail jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
  r public.smart_form_revisions%rowtype;
  d jsonb := coalesce(p_detail, '{}'::jsonb);
  v_to text;
  v_patch jsonb := '{}'::jsonb;
  v_res jsonb;
  v_missing_attach int;
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision;

  case p_action
    when 'wait_client_info' then
      if f.state not in ('draft', 'review') then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      if jsonb_typeof(d->'keys') <> 'array' or jsonb_array_length(d->'keys') = 0 then return jsonb_build_object('ok', false, 'error', 'keys_required'); end if;
      v_to := 'waiting_client_info';
      update public.smart_form_filings set missing_info = jsonb_build_object('keys', d->'keys', 'note', d->>'note', 'requestedAt', now()) where id = f.id;
    when 'info_received' then
      if f.state <> 'waiting_client_info' then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      v_to := 'draft';
    when 'to_review' then
      if f.state not in ('draft', 'waiting_client_info') then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      v_to := 'review';
    when 'back_to_draft' then
      if f.state not in ('review', 'waiting_client_info') then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      v_to := 'draft';
    when 'handoff_to_client' then
      -- הלקוח מגיש בעצמו באזור האישי (למייצג אין גישה לשם). ‼ לא «הוגש».
      if f.state <> 'signed' or r.signed_document_id is null then return jsonb_build_object('ok', false, 'error', 'not_ready'); end if;
      v_to := 'awaiting_client_submission';
      v_patch := jsonb_build_object('channel', 'client_personal_area', 'handedOffAt', now(), 'note', d->>'note');
      update public.smart_form_filings set submission = v_patch where id = f.id;
    when 'record_submission' then
      if f.state not in ('signed', 'awaiting_client_submission') or r.signed_document_id is null then
        return jsonb_build_object('ok', false, 'error', 'not_ready');
      end if;
      select count(*) into v_missing_attach from jsonb_array_elements(f.attachments) a
       where coalesce((a->>'required')::boolean, false) and a->>'documentId' is null;
      if v_missing_attach > 0 then return jsonb_build_object('ok', false, 'error', 'attachments_missing', 'count', v_missing_attach); end if;
      if coalesce(d->>'channel', '') not in ('representatives_portal', 'client_personal_area', 'branch', 'mail', 'fax', 'online_form') then
        return jsonb_build_object('ok', false, 'error', 'channel_required');
      end if;
      if coalesce(d->>'submittedAt', '') = '' then return jsonb_build_object('ok', false, 'error', 'date_required'); end if;
      -- ‼ פעולה של הלקוח באזור האישי אינה «הוגשה» בלי ראיה.
      if d->>'channel' = 'client_personal_area' and coalesce(d->>'reference', '') = '' and d->>'evidenceDocumentId' is null then
        return jsonb_build_object('ok', false, 'error', 'evidence_required');
      end if;
      v_to := 'submitted';
      update public.smart_form_filings set submission = coalesce(submission, '{}'::jsonb) || jsonb_build_object(
        'channel', d->>'channel', 'submittedAt', d->>'submittedAt', 'reference', nullif(d->>'reference', ''),
        'evidenceDocumentId', d->>'evidenceDocumentId', 'recordedAt', now(), 'recordedBy', auth.uid(),
        'documentId', r.signed_document_id, 'revision', r.revision) where id = f.id;
    when 'record_info_request' then
      if f.state <> 'submitted' then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      if coalesce(d->>'note', '') = '' then return jsonb_build_object('ok', false, 'error', 'note_required'); end if;
      v_to := 'info_requested';
      update public.smart_form_filings set outcome = jsonb_build_object('infoRequest', jsonb_build_object('note', d->>'note', 'receivedAt', coalesce(d->>'receivedAt', now()::text))) where id = f.id;
    when 'info_provided' then
      if f.state <> 'info_requested' then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      v_to := 'submitted';
      update public.smart_form_filings set outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object('infoProvidedAt', now(), 'infoProvidedNote', d->>'note') where id = f.id;
    when 'record_result' then
      if f.state not in ('submitted', 'info_requested') then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      if coalesce(d->>'status', '') not in ('approved', 'rejected', 'partial') then return jsonb_build_object('ok', false, 'error', 'status_required'); end if;
      if coalesce(d->>'summary', '') = '' then return jsonb_build_object('ok', false, 'error', 'summary_required'); end if;
      -- ‼ תוצאה רשמית רק עם ראיה: מסמך, אסמכתא, או קריאה מב"ל שמראה אותה.
      if d->>'evidenceDocumentId' is null and coalesce(d->>'reference', '') = '' and coalesce(d->>'btlSyncAt', '') = '' then
        return jsonb_build_object('ok', false, 'error', 'evidence_required');
      end if;
      if d->>'evidenceDocumentId' is not null and not exists (
        select 1 from public.documents x where x.id = d->>'evidenceDocumentId' and x.user_id = f.user_id and x.client_id = f.client_id) then
        return jsonb_build_object('ok', false, 'error', 'document_not_found');
      end if;
      v_to := 'result_received';
      update public.smart_form_filings set outcome = coalesce(outcome, '{}'::jsonb) || jsonb_build_object(
        'status', d->>'status', 'summary', d->>'summary', 'receivedAt', coalesce(d->>'receivedAt', now()::text),
        'evidenceDocumentId', d->>'evidenceDocumentId', 'reference', nullif(d->>'reference', ''),
        'btlSyncAt', nullif(d->>'btlSyncAt', ''), 'recordedAt', now(), 'recordedBy', auth.uid()) where id = f.id;
    when 'close' then
      if f.state <> 'result_received' then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      v_to := 'closed';
      if coalesce(d->>'followUp', 'none') <> 'none' then
        if d->>'followUp' not in ('reserve_duty_claim', 'refund_check', 'other') then return jsonb_build_object('ok', false, 'error', 'bad_follow_up'); end if;
        -- ‼ בן עם מחזור משלו (יסודות §6). כשהלקוח פועל באזור האישי — טיוטה בדף שלו
        -- (המשרד מפרסם בעצמו), וסגירה רק עם ראיה שהלקוח מעלה.
        v_res := public.create_onboarding_request(
          f.client_id, 'custom_request',
          case when d->>'followUpOwner' = 'client' then jsonb_build_object(
                 'title', coalesce(nullif(d->>'followUpTitle', ''), 'מעקב אחרי שינוי הסיווג בביטוח לאומי'),
                 'clientTitle', coalesce(nullif(d->>'followUpTitle', ''), 'פעולה באזור האישי בביטוח לאומי'),
                 'clientSub', coalesce(d->>'followUpNote', ''),
                 'requirements', jsonb_build_array(jsonb_build_object('key', 'evidence', 'kind', 'file', 'label', 'צילום מסך או אישור מהאזור האישי שהפעולה בוצעה', 'required', true)),
                 'smartFormParent', f.id)
               else jsonb_build_object(
                 'title', coalesce(nullif(d->>'followUpTitle', ''), 'מעקב אחרי שינוי הסיווג בביטוח לאומי'),
                 'message', coalesce(d->>'followUpNote', ''), 'requirements', '[]'::jsonb, 'smartFormParent', f.id) end,
          nullif(d->>'followUpDue', '')::date, null,
          coalesce(d->>'followUpOwner', 'me') <> 'client', false,
          case when d->>'followUpOwner' = 'client' then 'client' else 'me' end, null);
        if not coalesce((v_res->>'ok')::boolean, false) then
          return jsonb_build_object('ok', false, 'error', 'follow_up_failed', 'detail', v_res->>'error');
        end if;
        update public.smart_form_filings set follow_up = jsonb_build_object(
          'kind', d->>'followUp', 'owner', coalesce(d->>'followUpOwner', 'me'), 'stepId', v_res->>'stepId',
          'title', d->>'followUpTitle', 'createdAt', now()) where id = f.id;
      end if;
    when 'cancel' then
      if f.state in ('closed', 'cancelled') then return jsonb_build_object('ok', false, 'error', 'bad_transition'); end if;
      if f.state in ('submitted', 'info_requested', 'result_received') then return jsonb_build_object('ok', false, 'error', 'submitted_cannot_cancel'); end if;
      if coalesce(d->>'reason', '') = '' then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;
      v_to := 'cancelled';
      update public.smart_form_revisions set sign_tokens = '{}'::jsonb where filing_id = f.id;
    else
      return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end case;

  update public.smart_form_filings
     set state = v_to, updated_at = now(),
         closed_at = case when v_to in ('closed', 'cancelled') then now() else closed_at end
   where id = f.id;
  perform public._smart_form_event(f.id, f.user_id, f.current_revision, 'office', p_action,
    (d - 'png') || jsonb_build_object('from', f.state, 'to', v_to));
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'state', v_to, 'followUpStepId', v_res->>'stepId');
end;
$$;
