-- Perception FORECAST SELF-CALIBRATION
-- Immutable per-resolution score observations + shrinkage-based adaptive weight profiles.
-- Early samples are deliberately pulled toward a neutral baseline to prevent overfitting.

create table if not exists public.perception_forecast_model_scores (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.perception_forecasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  model_key text not null,
  model_family text not null,
  provider text,
  horizon_bucket text not null,
  predicted_probability double precision not null check (predicted_probability between 0 and 1),
  outcome boolean not null,
  brier_score double precision not null check (brier_score between 0 and 1),
  output_created_at timestamptz not null,
  resolved_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (forecast_id, model_key)
);

create table if not exists public.perception_forecast_evidence_scores (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null unique references public.perception_forecast_evidence(id) on delete cascade,
  forecast_id uuid not null references public.perception_forecasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  source_kind text not null,
  source_name text not null default '',
  stance text not null check (stance in ('support','contradict')),
  evidence_score double precision not null check (evidence_score between 0 and 1),
  outcome boolean not null,
  directional_correct boolean not null,
  observed_at timestamptz not null,
  resolved_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.perception_forecast_calibration_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope_type text not null check (scope_type in ('global','model_key','model_family','provider','horizon','evidence_kind')),
  scope_key text not null,
  sample_count integer not null check (sample_count >= 0),
  mean_brier double precision check (mean_brier is null or mean_brier between 0 and 1),
  posterior_brier double precision check (posterior_brier is null or posterior_brier between 0 and 1),
  directional_accuracy double precision check (directional_accuracy is null or directional_accuracy between 0 and 1),
  posterior_accuracy double precision check (posterior_accuracy is null or posterior_accuracy between 0 and 1),
  weight_multiplier double precision not null default 1 check (weight_multiplier between 0.5 and 1.6),
  last_scored_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, scope_type, scope_key)
);

create index if not exists perception_forecast_model_scores_user_idx
  on public.perception_forecast_model_scores(user_id, resolved_at desc);
create index if not exists perception_forecast_model_scores_scope_idx
  on public.perception_forecast_model_scores(user_id, model_family, provider, horizon_bucket);
create index if not exists perception_forecast_evidence_scores_user_idx
  on public.perception_forecast_evidence_scores(user_id, source_kind, resolved_at desc);
create index if not exists perception_forecast_calibration_profiles_user_idx
  on public.perception_forecast_calibration_profiles(user_id, scope_type, sample_count desc);

alter table public.perception_forecast_model_scores enable row level security;
alter table public.perception_forecast_evidence_scores enable row level security;
alter table public.perception_forecast_calibration_profiles enable row level security;

drop policy if exists "users read own forecast model scores" on public.perception_forecast_model_scores;
drop policy if exists "users read own forecast evidence scores" on public.perception_forecast_evidence_scores;
drop policy if exists "users read own forecast calibration profiles" on public.perception_forecast_calibration_profiles;

create policy "users read own forecast model scores"
on public.perception_forecast_model_scores for select
using ((select auth.uid()) = user_id);

create policy "users read own forecast evidence scores"
on public.perception_forecast_evidence_scores for select
using ((select auth.uid()) = user_id);

create policy "users read own forecast calibration profiles"
on public.perception_forecast_calibration_profiles for select
using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.perception_forecast_model_scores from anon, authenticated;
revoke insert, update, delete on public.perception_forecast_evidence_scores from anon, authenticated;
revoke insert, update, delete on public.perception_forecast_calibration_profiles from anon, authenticated;
grant select on public.perception_forecast_model_scores to authenticated;
grant select on public.perception_forecast_evidence_scores to authenticated;
grant select on public.perception_forecast_calibration_profiles to authenticated;

create or replace function public.perception_forecast_horizon_bucket(
  p_deadline timestamptz,
  p_observed_at timestamptz
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_deadline is null or p_observed_at is null then 'unknown'
    when p_deadline <= p_observed_at then 'expired'
    when p_deadline - p_observed_at <= interval '2 days' then '0_2d'
    when p_deadline - p_observed_at <= interval '14 days' then '3_14d'
    when p_deadline - p_observed_at <= interval '90 days' then '15_90d'
    else '91d_plus'
  end;
$$;

create or replace function public.perception_refresh_calibration_profiles_internal(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then return; end if;

  delete from public.perception_forecast_calibration_profiles
  where user_id = p_user_id;

  -- Global model performance. Brier 0.25 is the neutral 50/50 baseline.
  insert into public.perception_forecast_calibration_profiles (
    user_id, scope_type, scope_key, sample_count, mean_brier, posterior_brier,
    weight_multiplier, last_scored_at
  )
  select
    p_user_id,
    'global',
    'all_models',
    count(*)::integer,
    avg(brier_score),
    (sum(brier_score) + 3.0) / (count(*) + 12.0),
    greatest(0.55, least(1.55,
      exp((0.25 - ((sum(brier_score) + 3.0) / (count(*) + 12.0))) * 4.0)
    )),
    max(resolved_at)
  from public.perception_forecast_model_scores
  where user_id = p_user_id
  having count(*) > 0;

  -- Specific model keys.
  insert into public.perception_forecast_calibration_profiles (
    user_id, scope_type, scope_key, sample_count, mean_brier, posterior_brier,
    weight_multiplier, last_scored_at
  )
  select
    p_user_id,
    'model_key',
    model_key,
    count(*)::integer,
    avg(brier_score),
    (sum(brier_score) + 3.0) / (count(*) + 12.0),
    greatest(0.55, least(1.55,
      exp((0.25 - ((sum(brier_score) + 3.0) / (count(*) + 12.0))) * 4.0)
    )),
    max(resolved_at)
  from public.perception_forecast_model_scores
  where user_id = p_user_id
  group by model_key;

  -- Model families generalize across individual market tickers or model instances.
  insert into public.perception_forecast_calibration_profiles (
    user_id, scope_type, scope_key, sample_count, mean_brier, posterior_brier,
    weight_multiplier, last_scored_at
  )
  select
    p_user_id,
    'model_family',
    model_family,
    count(*)::integer,
    avg(brier_score),
    (sum(brier_score) + 3.0) / (count(*) + 12.0),
    greatest(0.55, least(1.55,
      exp((0.25 - ((sum(brier_score) + 3.0) / (count(*) + 12.0))) * 4.0)
    )),
    max(resolved_at)
  from public.perception_forecast_model_scores
  where user_id = p_user_id
  group by model_family;

  -- Provider performance lets Kalshi, Polymarket, and future sources earn different weights.
  insert into public.perception_forecast_calibration_profiles (
    user_id, scope_type, scope_key, sample_count, mean_brier, posterior_brier,
    weight_multiplier, last_scored_at
  )
  select
    p_user_id,
    'provider',
    provider,
    count(*)::integer,
    avg(brier_score),
    (sum(brier_score) + 3.0) / (count(*) + 12.0),
    greatest(0.55, least(1.55,
      exp((0.25 - ((sum(brier_score) + 3.0) / (count(*) + 12.0))) * 4.0)
    )),
    max(resolved_at)
  from public.perception_forecast_model_scores
  where user_id = p_user_id and provider is not null and provider <> ''
  group by provider;

  -- Horizon profiles capture whether a source is stronger near-term or long-range.
  insert into public.perception_forecast_calibration_profiles (
    user_id, scope_type, scope_key, sample_count, mean_brier, posterior_brier,
    weight_multiplier, last_scored_at
  )
  select
    p_user_id,
    'horizon',
    horizon_bucket,
    count(*)::integer,
    avg(brier_score),
    (sum(brier_score) + 3.0) / (count(*) + 12.0),
    greatest(0.55, least(1.55,
      exp((0.25 - ((sum(brier_score) + 3.0) / (count(*) + 12.0))) * 4.0)
    )),
    max(resolved_at)
  from public.perception_forecast_model_scores
  where user_id = p_user_id
  group by horizon_bucket;

  -- Directional evidence is scored separately from probabilistic forecasters.
  insert into public.perception_forecast_calibration_profiles (
    user_id, scope_type, scope_key, sample_count,
    directional_accuracy, posterior_accuracy, weight_multiplier, last_scored_at
  )
  select
    p_user_id,
    'evidence_kind',
    source_kind,
    count(*)::integer,
    sum((directional_correct::integer) * greatest(evidence_score, 0.05)) /
      nullif(sum(greatest(evidence_score, 0.05)), 0),
    (sum((directional_correct::integer) * greatest(evidence_score, 0.05)) + 3.0) /
      (sum(greatest(evidence_score, 0.05)) + 6.0),
    greatest(0.70, least(1.30,
      1.0 + (
        ((sum((directional_correct::integer) * greatest(evidence_score, 0.05)) + 3.0) /
         (sum(greatest(evidence_score, 0.05)) + 6.0)) - 0.5
      ) * 0.60
    )),
    max(resolved_at)
  from public.perception_forecast_evidence_scores
  where user_id = p_user_id
  group by source_kind;
end;
$$;

create or replace function public.perception_score_resolved_forecast_internal(
  p_forecast_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_forecast public.perception_forecasts%rowtype;
  v_model_rows integer := 0;
  v_evidence_rows integer := 0;
begin
  select * into v_forecast
  from public.perception_forecasts
  where id = p_forecast_id and status = 'resolved';

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'forecast_not_resolved');
  end if;

  with latest as (
    select distinct on (o.model_key)
      o.model_key,
      o.model_family,
      o.probability,
      o.metadata,
      o.created_at
    from public.perception_forecaster_outputs o
    where o.forecast_id = v_forecast.id
      and o.user_id = v_forecast.user_id
      and o.created_at <= coalesce(v_forecast.resolved_at, now())
    order by o.model_key, o.created_at desc
  ), inserted as (
    insert into public.perception_forecast_model_scores (
      forecast_id, user_id, project_id, model_key, model_family, provider,
      horizon_bucket, predicted_probability, outcome, brier_score,
      output_created_at, resolved_at
    )
    select
      v_forecast.id,
      v_forecast.user_id,
      v_forecast.project_id,
      l.model_key,
      l.model_family,
      nullif(l.metadata->>'provider', ''),
      public.perception_forecast_horizon_bucket(v_forecast.deadline, l.created_at),
      l.probability,
      v_forecast.outcome,
      power(l.probability - case when v_forecast.outcome then 1.0 else 0.0 end, 2),
      l.created_at,
      coalesce(v_forecast.resolved_at, now())
    from latest l
    on conflict (forecast_id, model_key) do nothing
    returning 1
  )
  select count(*) into v_model_rows from inserted;

  with inserted as (
    insert into public.perception_forecast_evidence_scores (
      evidence_id, forecast_id, user_id, project_id, source_kind, source_name,
      stance, evidence_score, outcome, directional_correct, observed_at, resolved_at
    )
    select
      e.id,
      v_forecast.id,
      v_forecast.user_id,
      v_forecast.project_id,
      e.source_kind,
      e.source_name,
      e.stance,
      e.evidence_score,
      v_forecast.outcome,
      case
        when e.stance = 'support' then v_forecast.outcome
        when e.stance = 'contradict' then not v_forecast.outcome
        else false
      end,
      e.observed_at,
      coalesce(v_forecast.resolved_at, now())
    from public.perception_forecast_evidence e
    where e.forecast_id = v_forecast.id
      and e.user_id = v_forecast.user_id
      and e.stance in ('support','contradict')
      and e.created_at <= coalesce(v_forecast.resolved_at, now())
    on conflict (evidence_id) do nothing
    returning 1
  )
  select count(*) into v_evidence_rows from inserted;

  perform public.perception_refresh_calibration_profiles_internal(v_forecast.user_id);

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (
    v_forecast.user_id,
    v_forecast.project_id,
    'forecast.self_calibration.updated',
    jsonb_build_object(
      'forecast_id', v_forecast.id,
      'model_scores_added', v_model_rows,
      'evidence_scores_added', v_evidence_rows,
      'resolved_at', v_forecast.resolved_at
    )
  );

  return jsonb_build_object(
    'ok', true,
    'forecast_id', v_forecast.id,
    'model_scores_added', v_model_rows,
    'evidence_scores_added', v_evidence_rows
  );
end;
$$;

create or replace function public.perception_score_forecast_resolution_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'open' and new.status = 'resolved' then
    perform public.perception_score_resolved_forecast_internal(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists perception_forecasts_self_calibration on public.perception_forecasts;
create trigger perception_forecasts_self_calibration
after update of status, outcome, resolved_at on public.perception_forecasts
for each row execute function public.perception_score_forecast_resolution_trigger();

create or replace function public.perception_calibration_weight_multiplier_internal(
  p_user_id uuid,
  p_model_key text,
  p_model_family text,
  p_provider text,
  p_horizon_bucket text
)
returns double precision
language sql
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    -- A permanent neutral anchor means one lucky resolution cannot swing weights sharply.
    select 1.0::double precision as multiplier, 1.0::double precision as influence
    union all
    select p.weight_multiplier,
      (case p.scope_type
        when 'model_key' then 1.50
        when 'provider' then 1.20
        when 'model_family' then 1.00
        when 'horizon' then 0.65
        when 'global' then 0.35
        else 0.0
      end) * least(p.sample_count::double precision / 12.0, 1.0) as influence
    from public.perception_forecast_calibration_profiles p
    where p.user_id = p_user_id
      and (
        (p.scope_type = 'model_key' and p.scope_key = coalesce(p_model_key, '')) or
        (p.scope_type = 'model_family' and p.scope_key = coalesce(p_model_family, '')) or
        (p.scope_type = 'provider' and p.scope_key = coalesce(p_provider, '')) or
        (p.scope_type = 'horizon' and p.scope_key = coalesce(p_horizon_bucket, '')) or
        (p.scope_type = 'global' and p.scope_key = 'all_models')
      )
  )
  select greatest(0.65, least(1.45,
    coalesce(sum(multiplier * influence) / nullif(sum(influence), 0), 1.0)
  ))
  from candidates
  where influence > 0;
$$;

create or replace function public.perception_forecast_calibration_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_resolved integer;
  v_model_scores integer;
  v_evidence_scores integer;
  v_mean_brier double precision;
  v_stage text;
  v_profiles jsonb;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;

  select count(*) into v_resolved
  from public.perception_forecasts
  where user_id = v_user and status = 'resolved';

  select count(*), avg(brier_score)
  into v_model_scores, v_mean_brier
  from public.perception_forecast_model_scores
  where user_id = v_user;

  select count(*) into v_evidence_scores
  from public.perception_forecast_evidence_scores
  where user_id = v_user;

  v_stage := case
    when v_resolved < 3 then 'cold_start'
    when v_resolved < 20 then 'warming'
    when v_resolved < 100 then 'calibrating'
    else 'mature'
  end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'scope_type', p.scope_type,
    'scope_key', p.scope_key,
    'sample_count', p.sample_count,
    'mean_brier', p.mean_brier,
    'posterior_brier', p.posterior_brier,
    'directional_accuracy', p.directional_accuracy,
    'posterior_accuracy', p.posterior_accuracy,
    'weight_multiplier', p.weight_multiplier,
    'last_scored_at', p.last_scored_at
  ) order by p.scope_type, p.sample_count desc, p.scope_key), '[]'::jsonb)
  into v_profiles
  from public.perception_forecast_calibration_profiles p
  where p.user_id = v_user;

  return jsonb_build_object(
    'resolved_forecasts', v_resolved,
    'model_score_count', v_model_scores,
    'evidence_score_count', v_evidence_scores,
    'mean_model_brier', v_mean_brier,
    'learning_stage', v_stage,
    'profiles', v_profiles,
    'neutral_brier_baseline', 0.25,
    'shrinkage_prior_samples', 12
  );
end;
$$;

-- Backfill any forecasts that were resolved before this migration existed.
do $$
declare
  v_row record;
begin
  for v_row in
    select id from public.perception_forecasts where status = 'resolved'
  loop
    perform public.perception_score_resolved_forecast_internal(v_row.id);
  end loop;
end;
$$;

revoke all on function public.perception_refresh_calibration_profiles_internal(uuid) from public, anon, authenticated;
revoke all on function public.perception_score_resolved_forecast_internal(uuid) from public, anon, authenticated;
revoke all on function public.perception_calibration_weight_multiplier_internal(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.perception_refresh_calibration_profiles_internal(uuid) to service_role;
grant execute on function public.perception_score_resolved_forecast_internal(uuid) to service_role;
grant execute on function public.perception_calibration_weight_multiplier_internal(uuid,text,text,text,text) to service_role;

revoke all on function public.perception_forecast_calibration_dashboard() from public, anon;
grant execute on function public.perception_forecast_calibration_dashboard() to authenticated;
