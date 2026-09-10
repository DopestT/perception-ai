-- Perception FORECAST MVP
-- Append-only forecast snapshots + bounded RPC writes.

create table if not exists public.perception_forecasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  question text not null,
  deadline timestamptz not null,
  original_probability double precision not null check (original_probability >= 0 and original_probability <= 1),
  current_probability double precision not null check (current_probability >= 0 and current_probability <= 1),
  confidence text not null default 'low' check (confidence in ('low','medium','high')),
  trend text not null default 'steady' check (trend in ('down','steady','up')),
  supporting_evidence jsonb not null default '[]'::jsonb,
  contradicting_evidence jsonb not null default '[]'::jsonb,
  watch_signals jsonb not null default '[]'::jsonb,
  model_breakdown jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','resolved','cancelled')),
  outcome boolean,
  brier_score double precision check (brier_score is null or (brier_score >= 0 and brier_score <= 1)),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved' and outcome is not null and resolved_at is not null and brier_score is not null) or status <> 'resolved')
);

create table if not exists public.perception_forecast_versions (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.perception_forecasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  probability double precision not null check (probability >= 0 and probability <= 1),
  confidence text not null check (confidence in ('low','medium','high')),
  trend text not null check (trend in ('down','steady','up')),
  supporting_evidence jsonb not null default '[]'::jsonb,
  contradicting_evidence jsonb not null default '[]'::jsonb,
  watch_signals jsonb not null default '[]'::jsonb,
  model_breakdown jsonb not null default '{}'::jsonb,
  rationale text not null default '',
  created_at timestamptz not null default now(),
  unique (forecast_id, version)
);

create index if not exists perception_forecasts_user_status_idx on public.perception_forecasts(user_id, status, updated_at desc);
create index if not exists perception_forecasts_project_idx on public.perception_forecasts(project_id, created_at desc);
create index if not exists perception_forecast_versions_forecast_idx on public.perception_forecast_versions(forecast_id, version desc);
create index if not exists perception_forecast_versions_user_idx on public.perception_forecast_versions(user_id, created_at desc);

alter table public.perception_forecasts enable row level security;
alter table public.perception_forecast_versions enable row level security;

drop policy if exists "users read own perception forecasts" on public.perception_forecasts;
drop policy if exists "users read own perception forecast versions" on public.perception_forecast_versions;

create policy "users read own perception forecasts" on public.perception_forecasts
for select using ((select auth.uid()) = user_id);
create policy "users read own perception forecast versions" on public.perception_forecast_versions
for select using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.perception_forecasts from anon, authenticated;
revoke insert, update, delete on public.perception_forecast_versions from anon, authenticated;
grant select on public.perception_forecasts to authenticated;
grant select on public.perception_forecast_versions to authenticated;

create or replace function public.perception_create_forecast(
  p_question text,
  p_deadline timestamptz,
  p_probability double precision default 0.5
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_question text := btrim(coalesce(p_question, ''));
  v_project_id uuid;
  v_forecast_id uuid;
  v_probability double precision := coalesce(p_probability, 0.5);
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(v_question) < 5 then
    raise exception 'Forecast question must contain at least 5 characters' using errcode = '22023';
  end if;
  if p_deadline is null or p_deadline <= now() then
    raise exception 'Forecast deadline must be in the future' using errcode = '22023';
  end if;
  if v_probability < 0 or v_probability > 1 then
    raise exception 'Probability must be between 0 and 1' using errcode = '22023';
  end if;

  insert into public.perception_projects (user_id, name, desired_reality, current_reality)
  values (
    v_user,
    left('Forecast: ' || v_question, 120),
    'Resolve this forecast against an objective outcome without rewriting its history.',
    concat('Forecast opened at ', round(v_probability * 100)::int, '%. Awaiting evidence and resolution.')
  ) returning id into v_project_id;

  insert into public.perception_forecasts (
    user_id, project_id, question, deadline, original_probability, current_probability,
    confidence, trend, model_breakdown
  ) values (
    v_user, v_project_id, v_question, p_deadline, v_probability, v_probability,
    'low', 'steady', jsonb_build_object('prior', v_probability, 'source', 'neutral_prior')
  ) returning id into v_forecast_id;

  insert into public.perception_forecast_versions (
    forecast_id, user_id, version, probability, confidence, trend, model_breakdown, rationale
  ) values (
    v_forecast_id, v_user, 1, v_probability, 'low', 'steady',
    jsonb_build_object('prior', v_probability, 'source', 'neutral_prior'),
    'Initial neutral prior. No evidence-backed model adjustment has been applied yet.'
  );

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values (
    v_user, v_project_id, 'forecast.created',
    jsonb_build_object('forecast_id', v_forecast_id, 'question', v_question, 'deadline', p_deadline, 'probability', v_probability, 'version', 1)
  );

  return (
    select jsonb_build_object(
      'ok', true,
      'project_id', f.project_id,
      'forecast', to_jsonb(f),
      'version', 1
    )
    from public.perception_forecasts f
    where f.id = v_forecast_id
  );
end;
$$;

create or replace function public.perception_update_forecast(
  p_forecast_id uuid,
  p_probability double precision,
  p_confidence text default 'medium',
  p_supporting_evidence jsonb default '[]'::jsonb,
  p_contradicting_evidence jsonb default '[]'::jsonb,
  p_watch_signals jsonb default '[]'::jsonb,
  p_model_breakdown jsonb default '{}'::jsonb,
  p_rationale text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_forecast public.perception_forecasts%rowtype;
  v_version integer;
  v_trend text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_probability < 0 or p_probability > 1 then
    raise exception 'Probability must be between 0 and 1' using errcode = '22023';
  end if;
  if p_confidence not in ('low','medium','high') then
    raise exception 'Invalid confidence' using errcode = '22023';
  end if;

  select * into v_forecast
  from public.perception_forecasts
  where id = p_forecast_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Forecast not found' using errcode = 'P0002';
  end if;
  if v_forecast.status <> 'open' then
    raise exception 'Only open forecasts can be updated' using errcode = '22023';
  end if;

  v_trend := case when p_probability > v_forecast.current_probability then 'up'
                  when p_probability < v_forecast.current_probability then 'down'
                  else 'steady' end;

  select coalesce(max(version), 0) + 1 into v_version
  from public.perception_forecast_versions
  where forecast_id = p_forecast_id;

  insert into public.perception_forecast_versions (
    forecast_id, user_id, version, probability, confidence, trend,
    supporting_evidence, contradicting_evidence, watch_signals, model_breakdown, rationale
  ) values (
    p_forecast_id, v_user, v_version, p_probability, p_confidence, v_trend,
    coalesce(p_supporting_evidence, '[]'::jsonb),
    coalesce(p_contradicting_evidence, '[]'::jsonb),
    coalesce(p_watch_signals, '[]'::jsonb),
    coalesce(p_model_breakdown, '{}'::jsonb),
    coalesce(p_rationale, '')
  );

  update public.perception_forecasts
  set current_probability = p_probability,
      confidence = p_confidence,
      trend = v_trend,
      supporting_evidence = coalesce(p_supporting_evidence, '[]'::jsonb),
      contradicting_evidence = coalesce(p_contradicting_evidence, '[]'::jsonb),
      watch_signals = coalesce(p_watch_signals, '[]'::jsonb),
      model_breakdown = coalesce(p_model_breakdown, '{}'::jsonb),
      updated_at = now()
  where id = p_forecast_id;

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values (
    v_user, v_forecast.project_id, 'forecast.updated',
    jsonb_build_object('forecast_id', p_forecast_id, 'version', v_version, 'probability', p_probability, 'trend', v_trend)
  );

  return (
    select jsonb_build_object('ok', true, 'forecast', to_jsonb(f), 'version', v_version)
    from public.perception_forecasts f
    where f.id = p_forecast_id
  );
end;
$$;

create or replace function public.perception_resolve_forecast(
  p_forecast_id uuid,
  p_outcome boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_forecast public.perception_forecasts%rowtype;
  v_score double precision;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_forecast
  from public.perception_forecasts
  where id = p_forecast_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Forecast not found' using errcode = 'P0002';
  end if;
  if v_forecast.status <> 'open' then
    raise exception 'Forecast is not open' using errcode = '22023';
  end if;

  v_score := power(v_forecast.current_probability - case when p_outcome then 1.0 else 0.0 end, 2);

  update public.perception_forecasts
  set status = 'resolved', outcome = p_outcome, brier_score = v_score, resolved_at = now(), updated_at = now()
  where id = p_forecast_id;

  update public.perception_projects
  set current_reality = concat(
    'Forecast resolved ', case when p_outcome then 'YES' else 'NO' end,
    '. Final probability ', round(v_forecast.current_probability * 100)::int,
    '%. Brier score ', round(v_score::numeric, 4), '.'
  ), updated_at = now()
  where id = v_forecast.project_id;

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values
    (v_user, v_forecast.project_id, 'forecast.resolved', jsonb_build_object('forecast_id', p_forecast_id, 'outcome', p_outcome, 'final_probability', v_forecast.current_probability, 'brier_score', v_score)),
    (v_user, v_forecast.project_id, 'calibration.updated', jsonb_build_object('forecast_id', p_forecast_id, 'brier_score', v_score));

  return (
    select jsonb_build_object('ok', true, 'forecast', to_jsonb(f))
    from public.perception_forecasts f
    where f.id = p_forecast_id
  );
end;
$$;

create or replace function public.perception_forecast_calibration()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'resolved_count', count(*),
    'mean_brier_score', avg(brier_score),
    'best_possible', 0,
    'worst_possible', 1
  )
  from public.perception_forecasts
  where user_id = auth.uid() and status = 'resolved';
$$;

-- Extend Project World with forecast state while preserving every existing collection.
create or replace function public.perception_get_project_world(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from public.perception_projects p where p.id = p_project_id and p.user_id = v_user) then
    raise exception 'Project World not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'project', to_jsonb(p),
    'beliefs', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at) from public.perception_beliefs b where b.project_id = p.id), '[]'::jsonb),
    'objectives', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from public.perception_objectives o where o.project_id = p.id), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.perception_routes r where r.project_id = p.id), '[]'::jsonb),
    'route_nodes', coalesce((select jsonb_agg(to_jsonb(n) order by n.sort_order, n.created_at) from public.perception_route_nodes n where n.project_id = p.id), '[]'::jsonb),
    'worker_runs', coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at) from public.perception_worker_runs w where w.project_id = p.id), '[]'::jsonb),
    'artifacts', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.perception_artifacts a where a.project_id = p.id), '[]'::jsonb),
    'verifications', coalesce((select jsonb_agg(to_jsonb(v) order by v.checked_at) from public.perception_verification_runs v where v.project_id = p.id), '[]'::jsonb),
    'forecasts', coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at) from public.perception_forecasts f where f.project_id = p.id), '[]'::jsonb),
    'forecast_versions', coalesce((select jsonb_agg(to_jsonb(fv) order by fv.version) from public.perception_forecast_versions fv join public.perception_forecasts f on f.id = fv.forecast_id where f.project_id = p.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.perception_model_events e where e.project_id = p.id), '[]'::jsonb)
  ) into v_result
  from public.perception_projects p
  where p.id = p_project_id and p.user_id = v_user;

  return v_result;
end;
$$;

revoke all on function public.perception_create_forecast(text,timestamptz,double precision) from public, anon;
revoke all on function public.perception_update_forecast(uuid,double precision,text,jsonb,jsonb,jsonb,jsonb,text) from public, anon;
revoke all on function public.perception_resolve_forecast(uuid,boolean) from public, anon;
revoke all on function public.perception_forecast_calibration() from public, anon;
grant execute on function public.perception_create_forecast(text,timestamptz,double precision) to authenticated;
grant execute on function public.perception_update_forecast(uuid,double precision,text,jsonb,jsonb,jsonb,jsonb,text) to authenticated;
grant execute on function public.perception_resolve_forecast(uuid,boolean) to authenticated;
grant execute on function public.perception_forecast_calibration() to authenticated;