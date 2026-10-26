-- Max C ledgers are append-only even for privileged server paths.
create or replace function public.lmtyai_revenue_events_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'lmtyai_revenue_events is append-only';
end;
$$;

revoke all on function public.lmtyai_revenue_events_immutable() from public, anon, authenticated;
grant execute on function public.lmtyai_revenue_events_immutable() to service_role;

drop trigger if exists lmtyai_revenue_events_immutable_trigger on public.lmtyai_revenue_events;
create trigger lmtyai_revenue_events_immutable_trigger
before update or delete on public.lmtyai_revenue_events
for each row execute function public.lmtyai_revenue_events_immutable();

create or replace function public.lmtyai_revenue_reconciliations_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'lmtyai_revenue_reconciliations is append-only';
end;
$$;

revoke all on function public.lmtyai_revenue_reconciliations_immutable() from public, anon, authenticated;
grant execute on function public.lmtyai_revenue_reconciliations_immutable() to service_role;

drop trigger if exists lmtyai_revenue_reconciliations_immutable_trigger on public.lmtyai_revenue_reconciliations;
create trigger lmtyai_revenue_reconciliations_immutable_trigger
before update or delete on public.lmtyai_revenue_reconciliations
for each row execute function public.lmtyai_revenue_reconciliations_immutable();
