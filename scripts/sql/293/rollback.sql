-- Restore the previous read response without touching any client answers/data.
begin;
do $$
declare d text;
  addition text := '''knownClient'', public._tax_info_known_client(p_client_id, p_step_id),
    ''purpose'', coalesce(s.payload->>''purpose'', ''annual''), /* 293-known-information */ ''asks'', coalesce';
begin
  d := replace(pg_get_functiondef('public._tax_info_view(text,text)'::regprocedure), E'\r\n', E'\n');
  addition := replace(addition, E'\r\n', E'\n');
  if position('293-known-information' in d) > 0 then
    if (length(d) - length(replace(d, addition, ''))) / length(addition) <> 1 then
      raise exception '293 rollback: response anchor changed';
    end if;
    execute replace(d, addition, '''asks'', coalesce');
  end if;
end $$;
drop function if exists public._tax_info_known_client(text, text);
drop function if exists public._tax_info_pick_rows(jsonb, text[]);
commit;
