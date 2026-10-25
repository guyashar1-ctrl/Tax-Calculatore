-- חזרה מ-295: הגוף של _shaam_status כפי שהוגדר ב-250.
create or replace function public._shaam_status(p_kind text, p jsonb, p_group text) returns text language sql immutable as $$
  select case
    when p_kind = 'annual' then case when nullif(p->>'filedOn', '') is not null then 'filed'
                                     when (p->>'required')::boolean is true and coalesce((p->>'noAssessment')::boolean, false) is false then 'open'
                                     else 'context' end
    else case when p_group in ('filed_fine', 'filed_no_fine') then 'filed' else 'open' end
  end
$$;
