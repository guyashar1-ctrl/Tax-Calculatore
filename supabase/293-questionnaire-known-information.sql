-- Known information for open questionnaires. Read-only, limited to the schemas
-- already present in this client's questionnaire. No answers/drafts/card writes.
-- Existing token and office ownership checks remain in portal_tax_info/_preview.
begin;

create or replace function public._tax_info_pick_rows(p_rows jsonb, p_keys text[])
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(coalesce((select jsonb_object_agg(e.key, e.value)
    from jsonb_each(r.value) e where e.key = any(p_keys)), '{}'::jsonb)), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) r
  where jsonb_typeof(r.value) = 'object'
$$;
revoke all on function public._tax_info_pick_rows(jsonb, text[]) from public, anon, authenticated;

create or replace function public._tax_info_known_client(p_client_id text, p_step_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c jsonb; outv jsonb; schemas text[]; spousev jsonb;
begin
  -- The private helper also enforces the client/step association.
  if not exists (select 1 from public.onboarding_steps where id = p_step_id and client_id = p_client_id
      and step_type = 'info_collection') then return '{}'::jsonb; end if;
  select to_jsonb(t) into c from public.clients t where t.id = p_client_id;
  if c is null then return '{}'::jsonb; end if;
  select array_agg(distinct j.value #>> '{}') into schemas
    from public.tax_info_asks a cross join lateral jsonb_path_query(a.prompt, '$.**.schema') j(value)
    where a.step_id = p_step_id and a.client_id = p_client_id and a.state = 'published';
  outv := jsonb_build_object('id', c->'id', 'firstName', c->'first_name', 'familyStatus', c->'family_status',
    'spouseFirstName', c->'spouse_first_name');
  if 'employer' = any(schemas) then
    outv := outv || jsonb_build_object('employers', public._tax_info_pick_rows(c->'employers',
      array['id','name','startDate','endDate','belongsToSpouse','role']));
    -- btlDetail is deliberately reduced: no income/definition/medical details.
    outv := outv || jsonb_build_object('niOccupations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', x->'id', 'type', x->'type', 'fromDate', x->'fromDate', 'toDate', x->'toDate',
      'employerName', coalesce(nullif(x->>'employerName',''), x->'btlDetail'->>'employerName')))
      from jsonb_array_elements(coalesce(nullif(c->'ni_occupations', 'null'::jsonb), '[]'::jsonb)) x
      where x->>'type' = 'employee'), '[]'::jsonb),
      'spouseNiOccupations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', x->'id', 'type', x->'type', 'fromDate', x->'fromDate', 'toDate', x->'toDate',
      'employerName', coalesce(nullif(x->>'employerName',''), x->'btlDetail'->>'employerName')))
      from jsonb_array_elements(coalesce(nullif(c->'spouse_ni_occupations', 'null'::jsonb), '[]'::jsonb)) x
      where x->>'type' = 'employee'), '[]'::jsonb));
  end if;
  if schemas && array['children','childDisability','childSupport'] then
    outv := outv || jsonb_build_object('children', public._tax_info_pick_rows(c->'children',
      array['id','firstName','birthDate','birthYear','custody','hasDisability','disabilityPointsTo','monthlyAlimonyPaid']));
  end if;
  if 'address' = any(schemas) then
    outv := outv || jsonb_build_object('city', c->'city', 'address', c->'address', 'zipCode', c->'zip_code');
  end if;
  if 'bank' = any(schemas) then
    outv := outv || jsonb_build_object('bankAccounts', public._tax_info_pick_rows(c->'bank_accounts',
      array['id','bankName','bankCode','branchNumber','accountNumber','isPrimary','closedAt']));
  end if;
  if 'property' = any(schemas) then
    outv := outv || jsonb_build_object('properties', public._tax_info_pick_rows(c->'properties',
      array['id','address','city','purchaseDate','purchaseYear','purchasePrecision','soldDate','soldPrecision']));
  end if;
  if 'account' = any(schemas) then
    outv := outv || jsonb_build_object('investmentAccounts', public._tax_info_pick_rows(c->'investment_accounts',
      array['id','institutionName','accountNumber','openedDate','openedPrecision','closedDate','closedYear','isClosed']));
  end if;
  if 'fund' = any(schemas) then
    outv := outv || jsonb_build_object('pensionFunds', public._tax_info_pick_rows(c->'pension_funds', array['id','institutionName','kind']));
  end if;
  if 'foreign' = any(schemas) then
    outv := outv || jsonb_build_object('foreignAccounts', public._tax_info_pick_rows(c->'foreign_accounts', array['id','institutionName','country']));
  end if;
  if 'business' = any(schemas) then
    outv := outv || jsonb_build_object('businesses', public._tax_info_pick_rows(c->'businesses',
      array['id','name','description','startDate','startYear','belongsToSpouse','isClosed']));
  end if;
  -- Scalar mappings are also explicit. No whole client/spouse object is exposed.
  spousev := '{}'::jsonb;
  if schemas && array['studies','aliyah','disability','spouseBasics','reserveDays'] then
    select outv || coalesce(jsonb_object_agg(m.camel, c->m.snake), '{}'::jsonb),
           coalesce(jsonb_object_agg(m.camel, c->'spouse'->m.camel), '{}'::jsonb)
      into outv, spousev
      from (values ('spouseBasics','gender','gender'), ('spouseBasics','birthDate','birth_date'),
        ('studies','hasAcademicDegree','has_academic_degree'), ('studies','academicDegreeYear','academic_degree_year'), ('studies','academicDegreeType','academic_degree_type'),
        ('studies','completedIdf','completed_idf'), ('studies','idfReleaseYear','idf_release_year'), ('studies','idfReleaseMonth','idf_release_month'),
        ('studies','completedNationalService','completed_national_service'), ('studies','nationalServiceYear','national_service_year'), ('studies','serviceMonths','service_months'),
        ('aliyah','isNewImmigrant','is_new_immigrant'), ('aliyah','aliyahYear','aliyah_year'), ('aliyah','aliyahMonth','aliyah_month'),
        ('aliyah','isReturningResident','is_returning_resident'), ('aliyah','returningYear','returning_year'),
        ('disability','disabilityPercentage','disability_percentage'), ('reserveDays','reserveCombatDaysPrevYear','reserve_combat_days_prev_year')) m(schema,camel,snake)
      where m.schema = any(schemas);
  end if;
  return jsonb_strip_nulls(outv || jsonb_build_object('spouse', spousev));
end $$;
revoke all on function public._tax_info_known_client(text, text) from public, anon, authenticated;

-- Patch the single response constructor; preserve every existing visibility and
-- authorization condition, and fail closed if the expected function changed.
do $$
declare d text; anchor text := '''asks'', coalesce';
begin
  d := replace(pg_get_functiondef('public._tax_info_view(text,text)'::regprocedure), E'\r\n', E'\n');
  if position('293-known-information' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, anchor, ''))) / length(anchor) <> 1 then
    raise exception '293: _tax_info_view response anchor must occur once';
  end if;
  execute replace(d, anchor, '''knownClient'', public._tax_info_known_client(p_client_id, p_step_id),
    ''purpose'', coalesce(s.payload->>''purpose'', ''annual''), /* 293-known-information */ ''asks'', coalesce');
end $$;
commit;
