-- ═══════════════════════════════════════════════════════════════════════════
--  167 — קישור-משתתף: נמען ≠ בעלות על הבקשה (Recipient ≠ Ownership)
-- ═══════════════════════════════════════════════════════════════════════════
--  מקור: docs/PLAN-REQUEST-PREREQUISITES-INFORMATION-COLLECTION.md (165),
--  הרחבה מאושרת. ‼ הכרעת מוצר: הנמען של קישור-המשתתף אינו קובע בעלות על
--  הבקשה. "ייצוג בביטוח לאומי — דין וולוצקי ישר" נשארת בקשה אחת, אצל גיא,
--  עם subjectRole='spouse' — בין אם הקישור נשלח לדין (הנושא) ובין אם לגיא
--  (בעל הכרטיס, ממלא במקומה). אין שלב/בקשה/זהות-מדומה נוספת.
--
--  participant_role (165) נשאר **הנושא** — של מי הפרטים, קובע אילו שדות
--  מותר לכתוב. recipient_role (חדש) הוא **מי מקבל את הקישור** — ברירת מחדל
--  = הנושא (תואם אחורה לכל שורה קיימת). כשהנמען הוא בעל הכרטיס (owner),
--  זה עדיין אותו step_id/requirement_key/field_keys/token — רק כתובת אחרת.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · recipient_role על request_participant_links ─────────────────────────
alter table public.request_participant_links add column recipient_role text;
update public.request_participant_links set recipient_role = participant_role where recipient_role is null;
alter table public.request_participant_links alter column recipient_role set not null;
alter table public.request_participant_links add constraint request_participant_links_recipient_role_check
  check (recipient_role in ('client','spouse'));

-- ── 2 · create_participant_link — פרמטר נמען אופציונלי ──────────────────────
-- ‼ מוחלפת (לא CREATE OR REPLACE): נוסף פרמטר, וב-Postgres זה overload חדש —
-- הישנה (text) → (text) נשארת נגישה ומדלגת על כל הלוגיקה הזו אם לא תוסר.
drop function if exists public.create_participant_link(text);

create function public.create_participant_link(p_step_id text, p_recipient_role text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid      uuid := auth.uid();
  s          public.onboarding_steps%rowtype;
  v_token    text;
  v_link_id  text;
  v_role     text;
  v_recipient text;
  v_revoked  int;
  v_expires  timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;

  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'step_not_found'); end if;
  if s.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if s.step_type <> 'authority_representation' then
    return jsonb_build_object('ok', false, 'reason', 'not_supported');
  end if;

  v_role := coalesce(s.payload->>'subjectRole', 'client');
  -- ‼ נמען תקף הוא רק 'client'/'spouse' — כל דבר אחר (כולל קלט מזויף) נופל
  -- בחזרה לנושא עצמו, לא נדחה בשקט לערך שרירותי.
  v_recipient := case when p_recipient_role in ('client','spouse') then p_recipient_role else v_role end;
  v_expires := now() + interval '14 days';

  with revoked as (
    update public.request_participant_links
       set revoked_at = now()
     where step_id = s.id and submitted_at is null and revoked_at is null
    returning id
  )
  select count(*) into v_revoked from revoked;
  if v_revoked > 0 then
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'participant_link_revoked', 'accountant',
      'קישור קודם בוטל בשליחה חוזרת', jsonb_build_object('reason','reissued'));
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '');

  insert into public.request_participant_links
    (user_id, step_id, client_id, participant_role, recipient_role, requirement_key, field_keys, token, expires_at)
  values
    (s.user_id, s.id, s.client_id, v_role, v_recipient,
     coalesce((public.requirements_for_step(s.step_type, s.payload))->>'key', 'btl.entry'),
     coalesce((select array_agg(f->>'key') from jsonb_array_elements(public.requirements_for_step(s.step_type, s.payload)->'fields') f), '{}'::text[]),
     v_token, v_expires)
  returning id into v_link_id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'participant_link_created', 'accountant',
    'נוצר קישור להשלמת פרטים', jsonb_build_object('linkId', v_link_id, 'participantRole', v_role, 'recipientRole', v_recipient));

  perform public.sync_authority_representation_steps(s.client_id);

  return jsonb_build_object('ok', true, 'linkId', v_link_id, 'token', v_token, 'expiresAt', v_expires, 'recipientRole', v_recipient);
end;
$function$;

revoke all on function public.create_participant_link(text, text) from public, anon;
grant execute on function public.create_participant_link(text, text) to authenticated;

-- ── 3 · sync_authority_representation_steps — v_link נושא recipientRole ────
-- ‼ CREATE OR REPLACE מלא, לא anchored-patch — אותו גוף מ-165 עם שינוי יחיד:
-- v_link מוסיף 'recipientRole'. ראה 165 להסבר המלא של שאר הלוגיקה.
create or replace function public.sync_authority_representation_steps(p_client_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s              record;
  v_track        text;
  v_t            jsonb;
  v_tf           jsonb;
  v_file         jsonb;
  v_new_status   text;
  v_new_ball     text;
  v_note         text;
  v_req          jsonb;
  v_missing      text[];
  v_missing_j    jsonb;
  v_prev_prereqs jsonb;
  v_new_prereqs  jsonb;
  v_link         jsonb;
  v_link_revoked int;
begin
  for s in
    select * from public.onboarding_steps
    where client_id = p_client_id and step_type = 'authority_representation'
      and status <> 'cancelled'
  loop
    v_track := case when s.payload->>'subjectRole' = 'spouse'
                     then 'nationalInsuranceSpouse' else 'nationalInsurance' end;

    select execution -> v_track into v_t from public.representation_requests
      where id = s.payload->>'representationRequestId';
    v_t := coalesce(v_t, '{}'::jsonb);

    select tax_files into v_tf from public.clients where id = p_client_id;
    select f into v_file from jsonb_array_elements(coalesce(v_tf, '[]'::jsonb)) f
      where f->>'authority' = s.payload->>'authority' and f->>'owner' = s.payload->>'subjectRole'
      limit 1;

    -- ── תנאי-קדם (165) ───────────────────────────────────────────────────
    v_prev_prereqs := s.payload->'prerequisites';
    if (v_t->>'enteredAt') is not null then
      v_missing_j := '[]'::jsonb;
    else
      v_missing := public.missing_prerequisites(p_client_id, s.step_type, s.payload);
      select coalesce(jsonb_agg(x), '[]'::jsonb) into v_missing_j from unnest(v_missing) x;
    end if;
    v_req := public.requirements_for_step(s.step_type, s.payload);

    select jsonb_build_object('id', l.id, 'sentAt', l.sent_at, 'sentTo', l.sent_to,
                               'openedAt', l.opened_at, 'expiresAt', l.expires_at,
                               'recipientRole', l.recipient_role)
      into v_link
      from public.request_participant_links l
      where l.step_id = s.id and l.submitted_at is null and l.revoked_at is null and l.expires_at > now()
      limit 1;

    v_new_prereqs := jsonb_build_object(
      'stage', 'entry',
      'required', coalesce((select jsonb_agg(f->>'key') from jsonb_array_elements(v_req->'fields') f), '[]'::jsonb),
      'missing', v_missing_j,
      'satisfiedAt', case when jsonb_array_length(v_missing_j) = 0
                           then coalesce(v_prev_prereqs->>'satisfiedAt', now()::text)
                           else null end,
      'link', v_link);

    -- התנאים התקיימו ויש קישור פעיל ⇒ מבטלים אותו אוטומטית (§16.6)
    if jsonb_array_length(v_missing_j) = 0 and v_link is not null then
      update public.request_participant_links
         set revoked_at = now()
       where step_id = s.id and submitted_at is null and revoked_at is null;
      get diagnostics v_link_revoked = row_count;
      if v_link_revoked > 0 then
        perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'participant_link_revoked', 'system',
          'הפרטים הושלמו — הקישור בוטל אוטומטית', jsonb_build_object('linkId', v_link->>'id', 'reason','satisfied'));
      end if;
      v_new_prereqs := v_new_prereqs - 'link';
    end if;

    if v_prev_prereqs is not null
       and coalesce(jsonb_array_length(v_prev_prereqs->'missing'), 0) > 0
       and jsonb_array_length(v_missing_j) = 0 then
      perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'prerequisites_satisfied', 'system',
        'הפרטים החסרים הושלמו', jsonb_build_object('stage','entry'));
    end if;

    -- ── מצב הביצוע (157, ללא שינוי) ──────────────────────────────────────
    if (v_t->>'confirmedAt') is not null or (v_file->>'repStatus') = 'active' then
      v_new_status := 'completed'; v_new_ball := s.ball; v_note := 'ייצוג פעיל';
    elsif nullif(v_t->>'deadline','') is not null and (v_t->>'deadline')::date < current_date then
      v_new_status := 'blocked'; v_new_ball := 'me'; v_note := 'האסמכתא פגה — נדרשת הזנה מחדש';
    elsif (v_t->>'instructionsSentAt') is not null then
      v_new_status := 'waiting_client'; v_new_ball := 'client'; v_note := 'הוראות האישור נשלחו';
    elsif nullif(v_t->>'referenceNumber','') is not null then
      v_new_status := 'in_progress'; v_new_ball := 'me'; v_note := 'האסמכתא התקבלה';
    elsif (v_t->>'enteredAt') is not null then
      v_new_status := 'in_progress'; v_new_ball := 'me'; v_note := 'הייצוג הוזן בביטוח לאומי';
    else
      v_new_status := 'pending'; v_new_ball := 'me'; v_note := null;
    end if;

    if v_new_status is distinct from s.status or v_new_prereqs is distinct from v_prev_prereqs then
      update public.onboarding_steps
         set status = v_new_status,
             ball = case when v_new_status = 'completed' then ball else v_new_ball end,
             payload = (case when v_new_status = 'completed'
                            then payload || jsonb_strip_nulls(jsonb_build_object(
                                   'referenceNumber', nullif(v_t->>'referenceNumber',''),
                                   'deadline', nullif(v_t->>'deadline',''),
                                   'instructionsSentAt', nullif(v_t->>'instructionsSentAt',''),
                                   'instructionsSentWith', nullif(v_t->>'instructionsSentWith',''),
                                   'confirmedAt', nullif(v_t->>'confirmedAt','')))
                            else payload end)
                        || jsonb_build_object('prerequisites', v_new_prereqs),
             completion_method = case when v_new_status = 'completed' then 'auto' else completion_method end,
             completed_at = case when v_new_status = 'completed'
                                  then coalesce(completed_at, nullif(v_t->>'confirmedAt','')::timestamptz, now())
                                  else completed_at end,
             needs_attention = case when v_new_status = 'blocked' then true
                                     when v_new_status = 'completed' then false
                                     else needs_attention end,
             updated_at = now()
       where id = s.id;

      if v_new_status is distinct from s.status then
        perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
          v_note, jsonb_build_object('from', s.status, 'to', v_new_status));
        if v_new_status = 'completed' then
          perform public.unlock_dependent_steps(s.id);
        end if;
      end if;
    end if;
  end loop;
end;
$function$;

revoke all on function public.sync_authority_representation_steps(text) from public, anon, authenticated;

-- ── 4 · participant_submit_prerequisites — יומן מודע-נמען ──────────────────
-- ‼ CREATE OR REPLACE מלא — שינוי יחיד: v_who הפך להבחין בין "הנושא מילא
-- בעצמו" ל"הנמען מילא במקום הנושא", כדי שהיומן לא יטען שדין מילאה כשגיא
-- בפועל הקליד את הפרטים שלה.
create or replace function public.participant_submit_prerequisites(p_token text, p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l       public.request_participant_links%rowtype;
  s       public.onboarding_steps%rowtype;
  c       public.clients%rowtype;
  v_req   jsonb;
  k       text;
  v_val   text;
  v_kind  text;
  v_apply jsonb;
  v_subject_name   text;
  v_recipient_name text;
  v_note  text;
begin
  select * into l from public.request_participant_links where token = p_token for update;
  if l.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if l.revoked_at is not null then return jsonb_build_object('ok', false, 'reason', 'link_revoked'); end if;
  if l.submitted_at is not null then return jsonb_build_object('ok', true, 'alreadySubmitted', true); end if;
  if l.expires_at < now() then return jsonb_build_object('ok', false, 'reason', 'link_expired'); end if;

  select * into s from public.onboarding_steps where id = l.step_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'reason', 'step_not_found'); end if;

  v_req := public.requirements_for_step(s.step_type, s.payload);

  for k in select jsonb_object_keys(p_values) loop
    if not (l.field_keys @> array[k]) then
      return jsonb_build_object('ok', false, 'reason', 'field_not_allowed', 'field', k);
    end if;
    v_val := nullif(trim(coalesce(p_values ->> k, '')), '');
    select f->>'kind' into v_kind from jsonb_array_elements(v_req->'fields') f where f->>'key' = k;
    if v_val is null then return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k); end if;
    if v_kind = 'idNumber' and v_val !~ '^\d{9}$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k);
    end if;
    if v_kind = 'year' and (v_val !~ '^\d{4}$' or v_val::int < 1900 or v_val::int > extract(year from now())::int) then
      return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k);
    end if;
    if v_kind = 'date' and v_val !~ '^\d{4}-\d{2}-\d{2}$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_value', 'field', k);
    end if;
  end loop;

  v_apply := public._apply_prerequisite_values(l.client_id, l.step_id, p_values, 'participant', 'link');
  if not coalesce((v_apply->>'ok')::boolean, false) then return v_apply; end if;

  update public.request_participant_links set submitted_at = now() where id = l.id;

  select * into c from public.clients where id = l.client_id;
  v_subject_name := case when l.participant_role = 'spouse'
    then coalesce(nullif(trim(coalesce(c.spouse_first_name,'')),''), 'בן/בת הזוג')
    else coalesce(nullif(trim(coalesce(c.first_name,'')),''), 'הלקוח') end;

  if l.recipient_role = l.participant_role then
    v_note := 'הפרטים התקבלו מ' || v_subject_name;
  else
    v_recipient_name := case when l.recipient_role = 'spouse'
      then coalesce(nullif(trim(coalesce(c.spouse_first_name,'')),''), 'בן/בת הזוג')
      else coalesce(nullif(trim(coalesce(c.first_name,'')),''), 'הלקוח') end;
    v_note := 'הפרטים של ' || v_subject_name || ' התקבלו מ' || v_recipient_name;
  end if;

  perform public.log_onboarding_event(l.user_id, l.step_id, s.engagement_id, 'prerequisites_filled', 'participant',
    v_note, jsonb_build_object('fields', v_apply->'changed', 'via', 'link', 'linkId', l.id,
                                'recipientRole', l.recipient_role, 'subjectRole', l.participant_role));

  perform public.sync_authority_representation_steps(l.client_id);

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.participant_submit_prerequisites(text, jsonb) from public, authenticated;
grant execute on function public.participant_submit_prerequisites(text, jsonb) to anon;

-- ── 5 · אימות שהשומרים עדיין תקינים ──────────────────────────────────────
select public.assert_domain_function_invariants();
