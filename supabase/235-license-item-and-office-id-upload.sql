-- ═══════════════════════════════════════════════════════════════════════════
-- 235 · רישיון נהיגה כפריט משלו ב«מסמכים מהלקוח», והעלאה מהמשרד שסוגרת אותו (12.10.2026)
--
-- המשך ל-234. אמיר ויסמרק הגיש את טופס הייצוג עם «אעלה מאוחר יותר» (הטופס עוד הכריח
-- מצלמה). בעסק חדש נדרשים ת.ז. **וגם** רישיון — אבל «מסמכים מהלקוח» ידעה רק פריט אחד
-- לאדם («צילום תעודת זהות או רישיון נהיגה»), ורישיון שהועלה סגר גם את פריט הת.ז.
--   1. מפתח פריט לרישיון: drivers_license / drivers_license_spouse (identity_doc_item_key_for).
--   2. הסנכרון ייצוג ⇄ מסמכים מכיר ברישיון: צילום מסוג driverLicense סוגר את פריט הרישיון;
--      פריט ת.ז. עם docKind='idCard' נסגר רק בת.ז.
--   3. «אעלה מאוחר יותר» בעסק חדש (_client_is_new_business) פותח שני פריטים — ת.ז. ורישיון
--      (אלא אם סומן «אין לי רישיון נהיגה»), כל אחד רק אם חסר.
--   4. העלאה בדף האישי לפריט הרישיון נרשמת כצילום של האדם (driverLicense).
-- ‼ ההעלאה מהמשרד היא office_attach_identity_doc הקיים (204/208) — הוא כבר מסנכרן; כאן רק
--   מלמדים את הסנכרון את פריט הרישיון.
-- ‼ שום דבר כאן לא שולח מייל ולא מפרסם.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._nb235_patch(p_fn regprocedure, p_old text, p_new text, p_expected int default 1)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_n int := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
begin
  if p_new <> '' and position(p_new in v_def) > 0 then return; end if;
  if v_n <> p_expected then
    raise exception '235: anchor count % (expected %) in %: %', v_n, p_expected, p_fn, left(p_old, 120);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- ── 1 · מפתח הפריט ──────────────────────────────────────────────────────────
create or replace function public.identity_doc_item_key_for(p_person text, p_kind text)
returns text language sql immutable set search_path to 'public' as $function$
  select case when p_kind = 'passport'
              then case p_person when 'spouse' then 'passport_spouse' else 'passport' end
              when p_kind = 'driverLicense'
              then case p_person when 'spouse' then 'drivers_license_spouse' else 'drivers_license' end
              else public.identity_doc_item_key(p_person) end;
$function$;

-- ── 2 · ייצוג ⇒ מסמכים: גם רישיון ───────────────────────────────────────────
select public._nb235_patch('public.sync_identity_docs_to_client_documents(text)'::regprocedure,
$o$foreach v_kind in array array['idCard','passport'] loop$o$,
$n$foreach v_kind in array array['idCard','passport','driverLicense'] loop$n$);
select public._nb235_patch('public.sync_identity_docs_to_client_documents(text)'::regprocedure,
$o$case when v_kind = 'passport' then 'passport'$o$,
$n$case when v_kind in ('passport', 'driverLicense') then v_kind$n$);

-- ── 4 · מסמכים ⇒ ייצוג: העלאה לפריט הרישיון ────────────────────────────────
select public._nb235_patch('public.client_documents_to_identity_docs_trg()'::regprocedure,
$o$if x->>'key' not in ('id_card', 'id_card_spouse', 'passport', 'passport_spouse') then continue; end if;$o$,
$n$if x->>'key' not in ('id_card', 'id_card_spouse', 'passport', 'passport_spouse',
                         'drivers_license', 'drivers_license_spouse') then continue; end if;$n$);
select public._nb235_patch('public.client_documents_to_identity_docs_trg()'::regprocedure,
$o$v_person := case when x->>'key' in ('id_card_spouse', 'passport_spouse') then 'spouse' else 'client' end;$o$,
$n$v_person := case when x->>'key' in ('id_card_spouse', 'passport_spouse', 'drivers_license_spouse') then 'spouse' else 'client' end;$n$);
select public._nb235_patch('public.client_documents_to_identity_docs_trg()'::regprocedure,
$o$when v_cat = 'drivers_license' then 'driverLicense'$o$,
$n$when x->>'key' in ('drivers_license', 'drivers_license_spouse') or x->>'docKind' = 'driverLicense'
           or v_cat = 'drivers_license' then 'driverLicense'$n$);

-- ── 3 · «אעלה מאוחר יותר» בעסק חדש: ת.ז. ורישיון, כל אחד אם חסר ─────────────
create or replace function public.ensure_identity_document_requests(p_request_id text, p_persons text[])
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  r        public.representation_requests%rowtype;
  c        public.clients%rowtype;
  s        public.onboarding_steps%rowtype;
  v_person text;
  v_key    text;
  v_kind   text;
  v_label  text;
  v_items  jsonb := '[]'::jsonb;
  v_list   jsonb;
  v_draft  jsonb;
  v_added  int := 0;
  v_eng    text;
  v_sort   int;
  v_stage  text;
  v_labels text;
  v_x      jsonb;
  v_docs   jsonb;
  v_kit    boolean;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null or r.linked_client_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into c from public.clients where id = r.linked_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  foreach v_person in array coalesce(p_persons, '{}'::text[]) loop
    if v_person not in ('client', 'spouse') then continue; end if;
    v_docs := case when jsonb_typeof(r.identity_docs->v_person) = 'array' then r.identity_docs->v_person else '[]'::jsonb end;
    -- ‼ 235: עסק חדש שהמשרד פותח — מבעל העסק ת.ז. וגם רישיון (234), כל אחד כפריט משלו.
    v_kit := v_person = 'client' and public._client_is_new_business(c.id);
    if v_kit then
      if not exists (select 1 from jsonb_array_elements(v_docs) d where d->>'docKind' = 'idCard') then
        v_items := v_items || jsonb_build_object('key', public.identity_doc_item_key_for(v_person, 'idCard'),
          'label', 'צילום תעודת זהות (שני הצדדים)', 'docKind', 'idCard', 'done', false,
          'source', 'representation_onboarding');
      end if;
      if coalesce((r.identification->'noDriverLicense'->>v_person)::boolean, false) is false
         and not exists (select 1 from jsonb_array_elements(v_docs) d where d->>'docKind' = 'driverLicense') then
        v_items := v_items || jsonb_build_object('key', public.identity_doc_item_key_for(v_person, 'driverLicense'),
          'label', 'צילום רישיון נהיגה', 'docKind', 'driverLicense', 'done', false,
          'source', 'representation_onboarding');
      end if;
      continue;
    end if;
    -- כבר יש צילום ⇒ אין מה לבקש.
    if jsonb_array_length(v_docs) > 0 then continue; end if;
    v_key := public.identity_doc_item_key(v_person);
    v_kind := case v_person when 'spouse' then r.identification->>'spouseSecondaryType'
                            else r.identification->>'secondaryType' end;
    -- אותו ניסוח כמו utils/identityEvidence.docKindPrompt.
    v_label := case v_kind when 'driverLicense' then 'צילום רישיון נהיגה'
                           when 'passport' then 'צילום דרכון'
                           else 'צילום תעודת זהות או רישיון נהיגה' end
               || case when v_person = 'spouse'
                       then ' - ' || coalesce(nullif(trim(coalesce(r.identification->>'spouseFirstName','') || ' ' ||
                                                           coalesce(r.identification->>'spouseLastName','')), ''),
                                             nullif(trim(coalesce(r.identification->>'spouseName','')), ''),
                                             'בן/בת הזוג')
                       else '' end;
    v_items := v_items || jsonb_build_object('key', v_key, 'label', v_label, 'done', false,
                                             'source', 'representation_onboarding');
  end loop;
  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', true, 'added', 0);
  end if;

  select * into s from public.onboarding_steps
   where client_id = c.id and step_type = 'client_documents' and status <> 'cancelled'
   order by created_at desc limit 1;

  if s.id is not null then
    v_list  := coalesce(s.payload->'checklist', '[]'::jsonb);
    v_draft := s.draft_payload;
    for v_x in select x from jsonb_array_elements(v_items) x loop
      v_key := v_x->>'key';
      if exists (select 1 from jsonb_array_elements(v_list) y where y->>'key' = v_key) then continue; end if;
      v_list := v_list || v_x;
      if v_draft is not null and jsonb_typeof(v_draft->'checklist') = 'array'
         and not exists (select 1 from jsonb_array_elements(v_draft->'checklist') y where y->>'key' = v_key) then
        v_draft := jsonb_set(v_draft, '{checklist}', (v_draft->'checklist') || v_x);
      end if;
      v_added := v_added + 1;
    end loop;
    if v_added = 0 then return jsonb_build_object('ok', true, 'added', 0, 'stepId', s.id); end if;

    update public.onboarding_steps
       set payload = payload || jsonb_build_object('checklist', v_list)
                     || case when coalesce(s.payload->>'clientTitle', '') ~ '^להעלות (\d+ מסמכים|מסמך אחד)$'
                             then jsonb_build_object('clientTitle', public._documents_title(jsonb_array_length(v_list)))
                             else '{}'::jsonb end,
           draft_payload = v_draft,
           updated_at = now()
     where id = s.id;

    -- בקשה שכבר נסגרה נפתחת מחדש — אותה עבודה («מסמכים מהלקוח»), לא עבודה חדשה.
    if s.status in ('completed', 'verified', 'skipped') then
      perform public._set_step_status(s.id, 'waiting_client', 'system',
        'הלקוח בחר להעלות את צילום התעודה מאוחר יותר - הבקשה נפתחה מחדש',
        jsonb_build_object('requestId', r.id, 'items', v_items), 'client', null);
    else
      perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'client',
        'הלקוח בחר להעלות את צילום התעודה מאוחר יותר - נוסף לרשימת המסמכים',
        jsonb_build_object('requestId', r.id, 'items', v_items));
    end if;
    return jsonb_build_object('ok', true, 'added', v_added, 'stepId', s.id);
  end if;

  -- אין בקשת מסמכים ⇒ נפתחת אחת. אותם שדות שהמחולל כותב (168).
  select id into v_eng from public.engagements
   where client_id = c.id order by created_at desc limit 1;
  select coalesce(max(sort_order), 0) + 10 into v_sort
    from public.onboarding_steps where client_id = c.id and status <> 'cancelled';
  v_stage := public.derive_lifecycle_stage(c.id);
  select string_agg(x->>'label', ' · ') into v_labels from jsonb_array_elements(v_items) x;

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, payload, published_at)
  values
    (c.user_id, v_eng, c.id, public.intake_accepts_required(c.id), 'client_documents', 'tools', 'person',
     'pending', 'client', v_sort,
     jsonb_build_object(
       'checklist', v_items,
       'clientTitle', public._documents_title(jsonb_array_length(v_items)),
       'clientSub', v_labels,
       'clientCta', 'להעלאה')
     || case when v_stage in ('lead', 'quoted') then jsonb_build_object('published', false, 'heldUntilApproval', true) else '{}'::jsonb end,
     case when v_stage in ('lead', 'quoted') then null else now() end)
  returning * into s;

  perform public.log_onboarding_event(c.user_id, s.id, v_eng, 'created', 'client',
    'הלקוח בחר להעלות את צילום התעודה מאוחר יותר - נפתחה בקשת מסמכים',
    jsonb_build_object('requestId', r.id, 'items', v_items));
  return jsonb_build_object('ok', true, 'added', jsonb_array_length(v_items), 'stepId', s.id, 'created', true);
end;
$function$;

drop function public._nb235_patch(regprocedure, text, text, int);
