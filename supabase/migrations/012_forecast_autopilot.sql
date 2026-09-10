-- Perception FORECAST AUTOPILOT
-- Closed-app adaptive refresh scheduling, resolution proposals, and user controls.

alter table public.perception_forecasts
  add column if not exists autopilot_enabled boolean not null default true,
  add column if not exists last_autopilot_at timestamptz,
  add column if not exists next_autopilot_at timestamptz,
  add column if not exists autopilot_failures integer not null default 0,
  add column if not exists autopilot_last_error text;

alter table public.perception_forecasts
  drop constraint if exists perception_forecasts_autopilot_failures_check;
alter table public.perception_forecasts
  add constraint perception_forecasts_autopilot_failures_check check (autopilot_failures >= 0);

update public.perception_forecasts
set next_autopilot_at = case
  when status <> 'open' or not autopilot_enabled then null
  when deadline <= now() then now()
  else least(now() + interval '30 minutes', deadline)
end
where next_autopilot_at is null;

create index if not exists perception_forecasts_autopilot_due_idx
  on public.perception_forecasts(next_autopilot_at, deadline)
  where status = 'open' and autopilot_enabled;

create table if not exists public.perception_forecast_resolution_proposals (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.perception_forecasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  proposed_outcome boolean not null,
  provider text not null,
  source_ref text,
  source_snapshot jsonb not null default '{}'::jsonb,
  match_score double precision not null default 0.5 check (match_score between 0 and 1),
  confidence double precision not null default 0.5 check (confidence between 0 and 1),
  rationale text not null default '',
  status text not null default 'pending' check (status in ('pending','accepted','rejected','superseded')),
  proposed_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists perception_forecast_resolution_proposals_forecast_idx
  on public.perception_forecast_resolution_proposals(forecast_id, status, proposed_at desc);
create index if not exists perception_forecast_resolution_proposals_user_idx
  on public.perception_forecast_resolution_proposals(user_id, proposed_at desc);

alter table public.perception_forecast_resolution_proposals enable row level security;

drop policy if exists "users read own forecast resolution proposals" on public.perception_forecast_resolution_proposals;
create policy "users read own forecast resolution proposals"
on public.perception_forecast_resolution_proposals for select
using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.perception_forecast_resolution_proposals from anon, authenticated;
grant select on public.perception_forecast_resolution_proposals to authenticated;

create or replace function public.perception_set_forecast_autopilot(
  p_forecast_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_forecast public.perception_forecasts%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;

  update public.perception_forecasts
  set autopilot_enabled = coalesce(p_enabled, true),
      next_autopilot_at = case
        when coalesce(p_enabled, true) and status = 'open' then now()
        else null
      end,
      autopilot_last_error = null,
      updated_at = now()
  where id = p_forecast_id and user_id = v_user
  returning * into v_forecast;

  if not found then raise exception 'Forecast not found' using errcode = 'P0002'; end if;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (v_user, v_forecast.project_id, 'forecast.autopilot.changed', jsonb_build_object(
    'forecast_id', p_forecast_id,
    'enabled', v_forecast.autopilot_enabled,
    'next_autopilot_at', v_forecast.next_autopilot_at
  ));

  return jsonb_build_object('ok', true, 'forecast', to_jsonb(v_forecast));
end;
$$;

create or replace function public.perception_claim_due_forecasts_internal(
  p_limit integer default 8
)
returns table (
  forecast_id uuid,
  user_id uuid,
  project_id uuid,
  question text,
  deadline timestamptz,
  original_probability double precision,
  current_probability double precision,
  last_autopilot_at timestamptz,
  failures integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select f.id
    from public.perception_forecasts f
    where f.status = 'open'
      and f.autopilot_enabled
      and coalesce(f.next_autopilot_at, f.created_at) <= now()
    order by coalesce(f.next_autopilot_at, f.created_at) asc, f.deadline asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 8), 25))
  ), claimed as (
    update public.perception_forecasts f
    set next_autopilot_at = now() + interval '20 minutes'
    from due
    where f.id = due.id
    returning f.*
  )
  select c.id, c.user_id, c.project_id, c.question, c.deadline,
         c.original_probability, c.current_probability, c.last_autopilot_at, c.autopilot_failures
  from claimed c;
end;
$$;

create or replace function public.perception_complete_autopilot_run_internal(
  p_user_id uuid,
  p_forecast_id uuid,
  p_success boolean,
  p_error text default null,
  p_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_forecast public.perception_forecasts%rowtype;
  v_next timestamptz;
  v_failures integer;
begin
  select * into v_forecast
  from public.perception_forecasts
  where id = p_forecast_id and user_id = p_user_id
  for update;
  if not found then raise exception 'Forecast not found' using errcode = 'P0002'; end if;

  if v_forecast.status <> 'open' or not v_forecast.autopilot_enabled then
    v_next := null;
    v_failures := case when p_success then 0 else v_forecast.autopilot_failures + 1 end;
  elsif coalesce(p_success, false) then
    v_failures := 0;
    v_next := now() + case
      when v_forecast.deadline <= now() then interval '1 hour'
      when v_forecast.deadline - now() <= interval '2 days' then interval '1 hour'
      when v_forecast.deadline - now() <= interval '14 days' then interval '3 hours'
      when v_forecast.deadline - now() <= interval '90 days' then interval '6 hours'
      else interval '24 hours'
    end;
  else
    v_failures := v_forecast.autopilot_failures + 1;
    v_next := now() + case
      when v_failures <= 1 then interval '30 minutes'
      when v_failures = 2 then interval '1 hour'
      when v_failures = 3 then interval '2 hours'
      when v_failures = 4 then interval '4 hours'
      else interval '12 hours'
    end;
  end if;

  update public.perception_forecasts
  set last_autopilot_at = now(),
      next_autopilot_at = v_next,
      autopilot_failures = v_failures,
      autopilot_last_error = case when p_success then null else left(coalesce(p_error, 'autopilot failure'), 1000) end,
      updated_at = greatest(updated_at, now())
  where id = p_forecast_id;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (p_user_id, v_forecast.project_id, 'forecast.autopilot.completed', jsonb_build_object(
    'forecast_id', p_forecast_id,
    'success', coalesce(p_success, false),
    'next_autopilot_at', v_next,
    'failures', v_failures,
    'summary', coalesce(p_summary, '{}'::jsonb),
    'error', case when p_success then null else left(coalesce(p_error, 'autopilot failure'), 1000) end
  ));

  return jsonb_build_object('ok', true, 'next_autopilot_at', v_next, 'failures', v_failures);
end;
$$;

create or replace function public.perception_propose_forecast_resolution_internal(
  p_user_id uuid,
  p_forecast_id uuid,
  p_outcome boolean,
  p_provider text,
  p_source_ref text,
  p_source_snapshot jsonb,
  p_match_score double precision,
  p_confidence double precision,
  p_rationale text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_forecast public.perception_forecasts%rowtype;
  v_existing public.perception_forecast_resolution_proposals%rowtype;
  v_id uuid;
  v_match double precision := greatest(0, least(1, coalesce(p_match_score, 0.5)));
  v_confidence double precision := greatest(0, least(1, coalesce(p_confidence, 0.5)));
begin
  select * into v_forecast
  from public.perception_forecasts
  where id = p_forecast_id and user_id = p_user_id and status = 'open';
  if not found then raise exception 'Open forecast not found' using errcode = 'P0002'; end if;

  select * into v_existing
  from public.perception_forecast_resolution_proposals
  where forecast_id = p_forecast_id
    and user_id = p_user_id
    and status = 'pending'
    and proposed_outcome = p_outcome
    and provider = lower(btrim(p_provider))
    and coalesce(source_ref, '') = coalesce(p_source_ref, '')
  order by proposed_at desc
  limit 1
  for update;

  if found then
    update public.perception_forecast_resolution_proposals
    set last_seen_at = now(),
        confidence = greatest(confidence, v_confidence),
        match_score = greatest(match_score, v_match),
        source_snapshot = coalesce(p_source_snapshot, source_snapshot),
        rationale = case when btrim(coalesce(p_rationale, '')) <> '' then p_rationale else rationale end
    where id = v_existing.id;
    v_id := v_existing.id;
  else
    update public.perception_forecast_resolution_proposals
    set status = 'superseded', reviewed_at = now()
    where forecast_id = p_forecast_id and user_id = p_user_id and status = 'pending';

    insert into public.perception_forecast_resolution_proposals (
      forecast_id, user_id, project_id, proposed_outcome, provider, source_ref,
      source_snapshot, match_score, confidence, rationale
    ) values (
      p_forecast_id, p_user_id, v_forecast.project_id, p_outcome,
      lower(coalesce(nullif(btrim(p_provider), ''), 'unknown')), p_source_ref,
      coalesce(p_source_snapshot, '{}'::jsonb), v_match, v_confidence, coalesce(p_rationale, '')
    ) returning id into v_id;
  end if;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (p_user_id, v_forecast.project_id, 'forecast.resolution.proposed', jsonb_build_object(
    'forecast_id', p_forecast_id,
    'proposal_id', v_id,
    'outcome', p_outcome,
    'provider', lower(btrim(p_provider)),
    'confidence', v_confidence,
    'match_score', v_match
  ));

  return jsonb_build_object('ok', true, 'proposal_id', v_id, 'outcome', p_outcome, 'confidence', v_confidence);
end;
$$;

create or replace function public.perception_review_forecast_resolution(
  p_proposal_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_proposal public.perception_forecast_resolution_proposals%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_decision <> 'rejected' then raise exception 'Only rejection is handled by this review RPC; accepting uses the standard forecast resolution action' using errcode = '22023'; end if;

  select * into v_proposal
  from public.perception_forecast_resolution_proposals
  where id = p_proposal_id and user_id = v_user
  for update;
  if not found then raise exception 'Proposal not found' using errcode = 'P0002'; end if;
  if v_proposal.status <> 'pending' then raise exception 'Proposal is no longer pending' using errcode = '22023'; end if;

  update public.perception_forecast_resolution_proposals
  set status = 'rejected', reviewed_at = now()
  where id = p_proposal_id;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (v_user, v_proposal.project_id, 'forecast.resolution.rejected', jsonb_build_object(
    'forecast_id', v_proposal.forecast_id,
    'proposal_id', p_proposal_id
  ));

  return jsonb_build_object('ok', true, 'proposal_id', p_proposal_id, 'status', 'rejected');
end;
$$;

create or replace function public.perception_sync_resolution_proposals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'open' and new.status = 'resolved' then
    update public.perception_forecast_resolution_proposals
    set status = case when proposed_outcome = new.outcome then 'accepted' else 'superseded' end,
        reviewed_at = now(),
        last_seen_at = greatest(last_seen_at, now())
    where forecast_id = new.id and status = 'pending';
  elsif old.status = 'open' and new.status = 'cancelled' then
    update public.perception_forecast_resolution_proposals
    set status = 'superseded', reviewed_at = now()
    where forecast_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists perception_forecasts_sync_resolution_proposals on public.perception_forecasts;
create trigger perception_forecasts_sync_resolution_proposals
after update of status, outcome on public.perception_forecasts
for each row execute function public.perception_sync_resolution_proposals();

revoke all on function public.perception_claim_due_forecasts_internal(integer) from public, anon, authenticated;
revoke all on function public.perception_complete_autopilot_run_internal(uuid,uuid,boolean,text,jsonb) from public, anon, authenticated;
revoke all on function public.perception_propose_forecast_resolution_internal(uuid,uuid,boolean,text,text,jsonb,double precision,double precision,text) from public, anon, authenticated;
grant execute on function public.perception_claim_due_forecasts_internal(integer) to service_role;
grant execute on function public.perception_complete_autopilot_run_internal(uuid,uuid,boolean,text,jsonb) to service_role;
grant execute on function public.perception_propose_forecast_resolution_internal(uuid,uuid,boolean,text,text,jsonb,double precision,double precision,text) to service_role;

revoke all on function public.perception_set_forecast_autopilot(uuid,boolean) from public, anon;
grant execute on function public.perception_set_forecast_autopilot(uuid,boolean) to authenticated;
revoke all on function public.perception_review_forecast_resolution(uuid,text) from public, anon;
grant execute on function public.perception_review_forecast_resolution(uuid,text) to authenticated;

-- Closed-app scheduler. The credential itself is stored in Supabase Vault and is never committed.
do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'perception-forecast-autopilot' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;

  perform cron.schedule(
    'perception-forecast-autopilot',
    '*/30 * * * *',
    $cron$
      select net.http_post(
        url := 'https://zxmdfmiueapjhktqchts.supabase.co/functions/v1/forecast-autopilot',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-perception-autopilot-token', (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'forecast_autopilot_cron'
            limit 1
          )
        ),
        body := '{"action":"scheduled_refresh"}'::jsonb
      );
    $cron$
  );
end;
$$;