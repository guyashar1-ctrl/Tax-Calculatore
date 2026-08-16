-- ─── 101: מסך "תהליך" מאוחד — ערבות draft→publish על סידור והסרה ────────────
-- עד היום draft_payload/published_at הגנו רק על תוכן בקשה. סידור
-- (reorder_onboarding_steps) וביטול (advance_onboarding_step('cancel')) כתבו
-- ישירות ל-sort_order/status — הלקוח רואה שינוי מיד, גם באמצע עריכה. זו
-- בדיוק הפרצה שמסך "תהליך" המאוחד (המבוסס על הפרוטוטייפ המאושר) אוסר:
-- "עריכה אינה פרסום" חייב לחול על כל שינוי, לא רק על ניסוח.
--
-- אותו דפוס בדיוק כמו draft_payload (מיגרציה 77): עמודת "ממתין" ליד העמודה
-- החיה. build_client_portal במצב live לא נוגע בעמודות החדשות בכלל — אפס
-- סיכון לתצוגה החיה. רק preview ו-publish_case_changes מכירים אותן.

-- ── 1. עמודות ────────────────────────────────────────────────────────────────

alter table public.onboarding_steps
  add column if not exists pending_sort_order integer,
  add column if not exists pending_cancel boolean not null default false;

comment on column public.onboarding_steps.pending_sort_order is
  'סדר חדש שממתין לפרסום (מיגרציה 101). null = אין שינוי סידור ממתין. build_client_portal במצב live אינו קורא אותה.';
comment on column public.onboarding_steps.pending_cancel is
  'הבקשה תבוטל בפרסום הבא (מיגרציה 101). false = אין הסרה ממתינה. build_client_portal במצב live אינו קורא אותה.';

-- ── 2. stage_onboarding_steps_order — כמו reorder_onboarding_steps, אבל לעמודה הממתינה ──

create or replace function public.stage_onboarding_steps_order(p_client_id text, p_ids text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c     public.clients%rowtype;
  v_uid uuid := auth.uid();
  v_n   int := 0;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update public.onboarding_steps s
     set pending_sort_order = t.ord * 10
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as ord) t
   where s.id = t.id and s.client_id = c.id;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'updated', v_n);
end;
$function$;

revoke all on function public.stage_onboarding_steps_order(text, text[]) from public, anon;
grant execute on function public.stage_onboarding_steps_order(text, text[]) to authenticated;

-- ── 3. set_onboarding_step_pending_cancel — "הסר" במצב עריכה ─────────────────
-- ‼ מותר רק על שלב שכבר פורסם (published_at is not null). שלב טיוטה שמעולם
-- לא פורסם ממשיך במסלול הישן — advance_onboarding_step('cancel'/'reopen') —
-- כי שום לקוח לא רואה אותו ואין מה לגונן עליו.

create or replace function public.set_onboarding_step_pending_cancel(p_step_id text, p_pending boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s     public.onboarding_steps%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.published_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_published');
  end if;
  if s.status in ('completed', 'verified', 'skipped', 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'step_terminal');
  end if;

  update public.onboarding_steps set pending_cancel = p_pending where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
    case when p_pending then 'הבקשה תוסר בעדכון הבא' else 'ההסרה בוטלה' end,
    jsonb_build_object('pendingCancel', p_pending));

  return jsonb_build_object('ok', true, 'pendingCancel', p_pending);
end;
$function$;

revoke all on function public.set_onboarding_step_pending_cancel(text, boolean) from public, anon;
grant execute on function public.set_onboarding_step_pending_cancel(text, boolean) to authenticated;

-- ── 4. discard_case_changes — "בטל שינויים" ───────────────────────────────────
-- ‼ מאפס סידור והסרה ממתינים לכל שלבי הלקוח, ומחזיר עריכות תוכן (draft_payload)
-- לבקשות שכבר פורסמו. טיוטות חדשות שמעולם לא פורסמו (published_at is null)
-- אינן נמחקות — הן נשארות לעבודה מאוחר יותר, בדיוק כמו היום לפני שהיה מצב
-- עריכה נפרד. זו החלטת מוצר מכוונת: "ביטול שינויים" אינו "מחק מה שהתחלתי".

create or replace function public.discard_case_changes(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  v_uid    uuid := auth.uid();
  v_order  int := 0;
  v_cancel int := 0;
  v_draft  int := 0;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update public.onboarding_steps
     set pending_sort_order = null
   where client_id = c.id and pending_sort_order is not null;
  get diagnostics v_order = row_count;

  update public.onboarding_steps
     set pending_cancel = false
   where client_id = c.id and pending_cancel = true;
  get diagnostics v_cancel = row_count;

  update public.onboarding_steps
     set draft_payload = null
   where client_id = c.id and draft_payload is not null and published_at is not null;
  get diagnostics v_draft = row_count;

  if v_order + v_cancel + v_draft > 0 then
    perform public.log_onboarding_event(c.user_id, null, null, 'note', 'accountant',
      'שינויים שלא פורסמו בוטלו',
      jsonb_build_object('orderReverted', v_order, 'cancelReverted', v_cancel, 'editsReverted', v_draft));
  end if;

  return jsonb_build_object('ok', true,
    'orderReverted', v_order, 'cancelReverted', v_cancel, 'editsReverted', v_draft);
end;
$function$;

revoke all on function public.discard_case_changes(text) from public, anon;
grant execute on function public.discard_case_changes(text) to authenticated;

-- ── 5. publish_case_changes — מיישם סידור והסרה ממתינים, לפני חשיפת טיוטות ──
-- ‼ סדר הפעולות: (א) פתיחת תהליך אם צריך (כמו היום) (ב) סידור ממתין (ג)
-- עריכות תוכן ממתינות (כמו היום) (ד) הסרות ממתינות (ה) חשיפת טיוטות (כמו
-- היום). הסרה נכתבת אחרי עריכות תוכן ולפני חשיפה, כדי שסדר הפעולות ישקף
-- בדיוק את מה שהרו"ח ראה על המסך ברגע שלחץ "עדכן את דף הלקוח".

create or replace function public.publish_case_changes(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  v_uid    uuid := auth.uid();
  e        record;
  s        record;
  v_opened  int := 0;
  v_ordered int := 0;
  v_edits   int := 0;
  v_removed int := 0;
  v_exposed int := 0;
  r        jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  -- 1. פתיחת תהליך שטרם נפתח — דרך הפונקציה הקיימת (יומן + אידמפוטנטיות שלה)
  for e in
    select id from public.engagements
     where client_id = c.id and status = 'onboarding' and process_published_at is null
  loop
    r := public.publish_onboarding_process(e.id);
    if coalesce((r->>'ok')::boolean, false) and not coalesce((r->>'alreadyPublished')::boolean, false) then
      v_opened := v_opened + 1;
    end if;
  end loop;

  -- 2. סידור ממתין (מיגרציה 101)
  update public.onboarding_steps
     set sort_order = pending_sort_order,
         pending_sort_order = null
   where client_id = c.id and pending_sort_order is not null;
  get diagnostics v_ordered = row_count;

  -- 3. עריכות ממתינות על בקשות קיימות
  for s in
    select * from public.onboarding_steps
     where client_id = c.id and draft_payload is not null and status <> 'cancelled'
  loop
    update public.onboarding_steps
       set payload = public.merge_step_draft(payload, draft_payload) - 'published',
           draft_payload = null
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
      'נוסח הבקשה עודכן ופורסם', jsonb_build_object('editApplied', true));
    v_edits := v_edits + 1;
  end loop;

  -- 4. הסרות ממתינות (מיגרציה 101) — אותה סמנטיקה כמו advance_onboarding_step('cancel')
  for s in
    select * from public.onboarding_steps
     where client_id = c.id and pending_cancel = true and status <> 'cancelled'
  loop
    update public.onboarding_steps
       set status = 'cancelled', pending_cancel = false, needs_attention = false
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
      'הבקשה הוסרה בעדכון דף הלקוח', jsonb_build_object('from', s.status, 'to', 'cancelled'));
    v_removed := v_removed + 1;
  end loop;

  -- 5. חשיפת טיוטות
  for s in
    select * from public.onboarding_steps
     where client_id = c.id and published_at is null and status <> 'cancelled'
  loop
    update public.onboarding_steps
       set published_at = now(),
           payload = payload - 'published'
     where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
      'הבקשה נפתחה ללקוח', jsonb_build_object('published', true));
    v_exposed := v_exposed + 1;
  end loop;

  return jsonb_build_object('ok', true,
    'processOpened', v_opened, 'ordered', v_ordered, 'editsApplied', v_edits,
    'removed', v_removed, 'draftsExposed', v_exposed);
end;
$function$;

revoke all on function public.publish_case_changes(text) from public, anon;
grant execute on function public.publish_case_changes(text) to authenticated;

-- ── 6. build_client_portal — preview משקף סידור והסרה ממתינים (live לא נגעו) ──
-- ‼ שינוי יחיד ומדויק לעומת מיגרציה 99: (א) סדר הלולאה במצב preview הוא
-- coalesce(pending_sort_order, sort_order) — במצב live נשאר sort_order בלבד,
-- מילה במילה. (ב) שלב עם pending_cancel=true, במצב preview בלבד, מסומן
-- removing:true על הפריט/ים שהוא הפיק — באותו דפוס בדיוק שבו draft:true כבר
-- מסומן היום. שום שינוי אחר בפונקציה.

create or replace function public.build_client_portal(p_client_id text, p_mode text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  req      public.representation_requests%rowtype;
  quo      public.quotations%rowtype;
  s        record;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
  v_sign_token text;
  v_spouse_pending boolean := false;
  v_invite_url text;
  v_prev_open boolean := false;
  v_prev_done boolean := false;
  v_first  text;
  v_has_eng boolean := false;
  v_stage  text;
  v_ck_done int;
  v_ck_total int;
  v_label  text;
  v_sub    text;
  v_published boolean := true;
  v_reqs   jsonb;
  v_rq_done int;
  v_rq_total int;
  v_rep_item jsonb := null;
  v_rep_seen boolean := false;
  v_before int := 0;
  v_lock   text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into p from public.profiles where id = c.user_id;
  v_first := split_part(trim(coalesce(c.first_name, '')), ' ', 1);
  v_invite_url := nullif(trim(coalesce(p.settings->'paperless'->>'inviteUrl', '')), '');

  v_has_eng := exists (select 1 from public.engagements e where e.client_id = c.id);

  select coalesce(bool_or(e.process_published_at is not null), true)
    into v_published from public.engagements e where e.client_id = c.id;

  select * into quo from public.quotations q
    where q.client_id = c.id and q.status <> 'draft'
    order by q.updated_at desc limit 1;

  if v_has_eng then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
  elsif quo.id is not null and quo.status in ('sent','viewed') then
    v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
      'bucket','action','key','quote_sign',
      'label','הצעת המחיר שלך מוכנה',
      'sub','לקריאה ולאישור — ואפשר להתחיל · כמה דקות',
      'actionKind','quote','actionValue', quo.public_token));
  elsif quo.id is not null and quo.status = 'approved' then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_processing',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  elsif quo.id is not null and quo.status in ('expired','cancelled') then
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_expired',
      'label','הצעת המחיר כבר לא בתוקף','sub','נשמח לחדש אותה — דברו איתנו');
  end if;

  select * into req from public.representation_requests
    where linked_client_id = c.id order by created_at desc limit 1;

  if req.id is not null then
    if req.status = 'pending_fill' then
      v_rep_item := jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_fill','label','מילוי פרטים וייפוי כוח','sub','הפרטים שנדרשים כדי לייצג אותך מול רשויות המס · כמה דקות','actionKind','onboard','actionValue', req.onboarding_token));
    elsif req.status = 'pending_signature' then
      select x->>'signToken' into v_sign_token
        from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'client' and x->>'signStatus' = 'pending' limit 1;
      select exists (
        select 1 from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'spouse' and x->>'signStatus' = 'pending')
        into v_spouse_pending;
      if v_sign_token is not null then
        v_rep_item := jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign','label','חתימה על ייפוי הכוח','sub','הטופס מוכן — נשארה חתימה · כדקה','actionKind','sign','actionValue', v_sign_token));
      elsif v_spouse_pending then
        v_rep_item := jsonb_build_object('bucket','office','key','rep_sign_spouse','label','ייפוי הכוח','sub','ממתינים לחתימת בן/בת הזוג — קישור אישי נשלח במייל נפרד');
      end if;
    elsif req.status in ('awaiting_accountant', 'awaiting_stamp') then
      v_rep_item := jsonb_build_object('bucket','office','key','rep_office','label','ייפוי הכוח','sub','נחתם על ידך — עכשיו בבדיקה ובחתימה אצלנו');
    elsif req.status = 'awaiting_authorities' then
      v_rep_item := jsonb_build_object('bucket','office','key','rep_authorities','label','ייפוי הכוח','sub','נחתם והוגש לרשויות המס — ממתינים לאישור');
    elsif req.status = 'active' then
      v_rep_item := jsonb_build_object('bucket','done','key','rep_done','label','הייצוג מול רשויות המס אושר');
    end if;
  end if;

  for s in
    select * from public.onboarding_steps st
    where st.client_id = c.id and st.status <> 'cancelled'
      and (p_mode = 'preview'
           or (st.published_at is not null and (v_published or st.step_type = 'representation')))
    order by (case when p_mode = 'preview' then coalesce(st.pending_sort_order, st.sort_order, 0)
                   else coalesce(st.sort_order, 0) end),
             st.created_at
  loop
    v_before := jsonb_array_length(v_items);
    case s.step_type

    when 'representation' then
      v_rep_seen := true;
      if v_rep_item is not null then
        v_items := v_items || v_rep_item;
      end if;

    when 'client_documents' then
      select count(*) filter (where (x->>'done')::boolean), count(*)
        into v_ck_done, v_ck_total
        from jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb)) x;
      v_label := coalesce(nullif(s.payload->>'clientTitle',''), 'מסמכים שביקשנו');
      v_sub   := nullif(s.payload->>'clientSub','');

      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','docs','label', v_label);
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','docs','label', v_label,
          'sub', coalesce(public.portal_lock_reason(s.id), v_sub)));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','docs','label', v_label,
          'sub', case when coalesce(v_ck_total,0) > 0
                      then v_ck_done || ' מתוך ' || v_ck_total || ' התקבלו'
                      else v_sub end,
          'actionKind','portal','actionValue', s.id,
          'kind','documents',
          'canUpload', true,
          'checklist', (select jsonb_agg(jsonb_build_object(
                            'key', x->>'key', 'label', x->>'label', 'done', (x->>'done')::boolean)
                          order by ord)
                          from jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb))
                               with ordinality t(x, ord))));
      end if;

    when 'custom_request' then
      v_reqs := coalesce(s.payload->'requirements', '[]'::jsonb);
      select count(*) filter (where coalesce((x->>'done')::boolean, false)
                               and coalesce((x->>'required')::boolean, true)),
             count(*) filter (where coalesce((x->>'required')::boolean, true))
        into v_rq_done, v_rq_total
        from jsonb_array_elements(v_reqs) x;
      v_label := coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד');

      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','custom_'||s.id,'label', v_label);
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','custom_'||s.id,'label', v_label,
          'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','custom_'||s.id,'label', v_label,
          'sub', case when coalesce(v_rq_total,0) > 1
                      then v_rq_done || ' מתוך ' || v_rq_total || ' הושלמו'
                      else nullif(s.payload->>'clientSub','') end,
          'actionKind','portal','actionValue', s.id,
          'kind','custom',
          'cta', nullif(s.payload->>'clientCta',''),
          'canUpload', exists (select 1 from jsonb_array_elements(v_reqs) x where x->>'kind' in ('file','files')),
          'requirements', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                              'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                              'done', coalesce((x->>'done')::boolean, false),
                              'required', coalesce((x->>'required')::boolean, true),
                              'options', x->'options',
                              'maxFiles', x->'maxFiles',
                              'fileCount', coalesce(jsonb_array_length(x->'documentIds'),
                                             case when nullif(x->>'documentId','') is not null then 1 else 0 end),
                              'value', x->>'value')) order by ord)
                            from jsonb_array_elements(v_reqs) with ordinality t(x, ord))));
      end if;

    when 'prev_accountant_details' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'),
          'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם שלך'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''), 'שם, אימייל וטלפון — כדי שנפנה אליו בשמך'),
          'actionKind','portal','actionValue', s.id, 'kind','prev_accountant'));
      end if;

    when 'paperless_invite' then
      continue;

    when 'paperless_connection' then
      if coalesce(s.payload->>'paperlessStatus', '') = 'not_applicable' then
        continue;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless','label','חיבור לפייפרלס');
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'other_rep' then
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_transfer','label','העברת חשבון הפייפרלס אלינו','sub','אנחנו מושכים את החשבון מהמייצג הקודם');
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'self' then
        v_items := v_items || jsonb_build_object('bucket','action','key','paperless_link','label','קישור חשבון הפייפרלס למשרד','sub','בחשבון הפייפרלס שלך: הוסיפו את המשרד כמייצג');
      elsif v_invite_url is not null then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','paperless_open',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פתיחת חשבון פייפרלס'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''), 'המערכת שדרכה נעבוד יחד — צילום קבלות מהטלפון · כדקה'),
          'actionKind','external','actionValue', v_invite_url));
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_soon','label','חיבור לפייפרלס','sub','נשלח לך הזמנה בהמשך');
      end if;

    when 'retainer_authorization' then
      if coalesce(s.payload->>'method', '') = 'manual_arrangement' then
        continue;
      elsif s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','retainer','label','הרשאת התשלום החודשי הוקמה');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_build_object('bucket','future','key','retainer_future',
          'label','הרשאת התשלום החודשי',
          'sub', coalesce(public.portal_lock_reason(s.id), 'תופיע כאן אחרי חיבור הפייפרלס'));
      elsif nullif(trim(coalesce(s.payload->>'authUrl', '')), '') is not null then
        v_items := v_items || jsonb_build_object('bucket','action','key','retainer_auth',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'אישור הרשאת התשלום החודשי'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''), 'הסכום שסוכם בהצעה, כהרשאה קבועה · פחות מדקה'),
          'actionKind','external','actionValue', trim(s.payload->>'authUrl'));
      end if;

    when 'intake_questionnaire' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','intake','label','עדכון סטטוס מיסויי');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','intake_future','label','עדכון סטטוס מיסויי',
          'sub', public.portal_lock_reason(s.id)));
      elsif s.status = 'waiting_client' and c.intake_token is not null then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','intake_fill','label','עדכון סטטוס מיסויי','sub','עונים רק על מה שרלוונטי · אפשר לעצור ולהמשיך','actionKind','intake','actionValue', c.intake_token));
      end if;

    when 'release_letter' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'materials_received' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'file_opening' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','files','label','פתיחת התיקים ברשויות');
      elsif s.status not in ('skipped') then
        v_items := v_items || jsonb_build_object('bucket','office','key','files_office','label','פתיחת התיקים ברשויות','sub','מע"מ, מס הכנסה וביטוח לאומי — בטיפולנו');
      end if;

    else
      continue;
    end case;

    if p_mode = 'preview' and s.published_at is null
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('draft', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;

    -- ‼ מיגרציה 101: הסרה ממתינה מסומנת removing:true, באותו דפוס בדיוק כמו
    -- draft:true למעלה. הפריט עדיין מוחזר (כדי שהעורך יראה מה עומד להיעלם),
    -- אבל מסומן — הצד הלקוח (preview בלבד, live אף פעם לא מגיע לכאן) יודע
    -- להציג אותו בקופסת "אחרי העדכון" בתור הסרה ולא כתוספת.
    if p_mode = 'preview' and s.pending_cancel
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('removing', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;
  end loop;

  if not v_rep_seen and v_rep_item is not null then
    v_items := v_items || v_rep_item;
  end if;

  if v_prev_open then
    v_items := v_items || jsonb_build_object('bucket','office','key','prev_accountant','label','קבלת החומרים מרואה החשבון הקודם','sub','ביקשנו את התיק — בתהליך');
  elsif v_prev_done then
    v_items := v_items || jsonb_build_object('bucket','done','key','prev_accountant','label','החומרים מרואה החשבון הקודם התקבלו');
  end if;

  if v_has_eng and not v_published and p_mode = 'live' then
    v_items := v_items || jsonb_build_object('bucket','office','key','process_pending',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  end if;

  select count(*) filter (where x->>'bucket' = 'done'),
         count(*) filter (where x->>'bucket' <> 'future')
    into v_done, v_total
    from jsonb_array_elements(v_items) x;

  if not v_has_eng and quo.id is null and req.id is not null then
    v_stage := case when req.status = 'active' then 'active' else 'identity' end;
  elsif not v_has_eng then
    v_stage := case when quo.status = 'approved' then 'identity' else 'quote' end;
  elsif req.id is not null and coalesce(req.status, '') <> 'active' then
    v_stage := 'identity';
  elsif v_done < v_total then
    v_stage := 'setup';
  else
    v_stage := 'active';
  end if;

  return jsonb_build_object(
    'ok', true,
    'clientFirstName', v_first,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'done', v_done, 'total', v_total,
    'journeyStage', v_stage,
    'items', v_items);
end;
$function$;

revoke all on function public.build_client_portal(text, text) from public, anon, authenticated;
