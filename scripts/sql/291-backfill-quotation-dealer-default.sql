-- Approved by Guy 2026-10-23: complete missing dealer types for existing clients.
-- Run only AFTER a backup and 291 installation. Re-running is a no-op.
-- This backfill must not create/publish requests, queue mail or start automation.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create temp table before_291_clients on commit drop as select * from public.clients;
create temp table before_291_counts on commit drop as
select (select count(*) from public.onboarding_steps) steps,
       (select count(*) from public.engagements) engagements,
       (select count(*) from public.email_messages) emails,
       (select count(*) from public.client_notices) notices,
       (select count(*) from public.automation_jobs) jobs;
create temp table results_291 (client_id text, quotation_id text, result jsonb) on commit drop;
do $$
declare x record;
begin
  for x in
    select distinct on (c.id) c.id as client_id, q.id as quotation_id
      from public.clients c join public.quotations q on q.client_id=c.id
     where nullif(btrim(c.dealer_type),'') is null and q.status='approved'
       and coalesce(q.kind,'engagement')='engagement'
       and (q.effective_from is null or q.effective_from <= current_date)
     order by c.id,q.approved_at desc nulls last,q.id
  loop
    insert into results_291 values (x.client_id,x.quotation_id,public._apply_quotation_dealer_default(x.quotation_id));
  end loop;
  if exists (
    select 1 from public.clients c join before_291_clients b on b.id=c.id
     where (to_jsonb(c)-'dealer_type'-'updated_at') is distinct from (to_jsonb(b)-'dealer_type'-'updated_at')
  ) then raise exception '291 backfill changed a field other than dealer_type'; end if;
  if exists (select 1 from before_291_counts b where
    b.steps <> (select count(*) from public.onboarding_steps) or
    b.engagements <> (select count(*) from public.engagements) or
    b.emails <> (select count(*) from public.email_messages) or
    b.notices <> (select count(*) from public.client_notices) or
    b.jobs <> (select count(*) from public.automation_jobs)
  ) then raise exception '291 backfill would create requests/messages/jobs; rolled back for review'; end if;
end;
$$;
select client_id,quotation_id,result from results_291 order by client_id;
commit;
