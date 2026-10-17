-- חזרה מ-258: גוף הטריגר כפי שהיה ב-238 (בלי 'parts'). הרישומים שכבר קיבלו parts נשארים — שדה מיותר שאיש לא קורא.
create or replace function public.client_documents_to_identity_docs_trg()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  r      public.representation_requests;
  x      jsonb;
  v_person text;
  v_doc  text;
  v_name text;
  v_cat  text;
  v_kind text;
  v_at   text;
begin
  if new.step_type <> 'client_documents' then return new; end if;
  if old.payload is not distinct from new.payload then return new; end if;

  r := public.representation_request_for_client(new.client_id);
  if r.id is null then return new; end if;

  for x in select * from jsonb_array_elements(coalesce(new.payload->'checklist', '[]'::jsonb)) loop
    if x->>'key' not in ('id_card', 'id_card_spouse', 'passport', 'passport_spouse',
                         'drivers_license', 'drivers_license_spouse') then continue; end if;
    v_doc := nullif(x->>'documentId', '');
    if v_doc is null then continue; end if;
    v_person := case when x->>'key' in ('id_card_spouse', 'passport_spouse', 'drivers_license_spouse') then 'spouse' else 'client' end;
    if exists (select 1 from jsonb_array_elements(
                 case when jsonb_typeof(r.identity_docs->v_person) = 'array' then r.identity_docs->v_person else '[]'::jsonb end) d
                where d->>'documentId' = v_doc) then continue; end if;
    select file_name, category into v_name, v_cat from public.documents where id = v_doc;
    v_kind := case
      when x->>'key' in ('passport', 'passport_spouse') or x->>'docKind' = 'passport' then 'passport'
      when x->>'key' in ('drivers_license', 'drivers_license_spouse') or x->>'docKind' = 'driverLicense'
           or v_cat = 'drivers_license' then 'driverLicense'
      else 'idCard' end;
    v_at := coalesce(x->>'doneAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    update public.representation_requests
       set identity_docs = jsonb_set(
             coalesce(identity_docs, '{}'::jsonb),
             array[v_person],
             (case when jsonb_typeof(identity_docs->v_person) = 'array' then identity_docs->v_person else '[]'::jsonb end)
               || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
               'documentId', v_doc, 'docKind', v_kind, 'fileName', v_name,
               'at', v_at, 'via', 'client_documents',
               -- ‼ 238 · הלקוח העלה בעצמו — זה האישור שלו, בלי קשר למי שביקש את הפריט.
               'clientConfirmedAt', v_at))),
             true)
     where id = r.id
     returning * into r;
  end loop;
  return new;
end;
$function$;
