-- Perception FORECAST scenario intelligence
-- Adds immutable per-version scenario trees plus counterfactual, correlated-failure,
-- and surprise checks. Generated analysis is evidence-bounded and does not mutate
-- forecast probabilities or authoritative Project World truth.

create table if not exists public.perception_forecast_scenario_sets (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.perception_forecasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  forecast_version integer not null check (forecast_version > 0),
  probability_snapshot double precision not null check (probability_snapshot between 0 and 1),
  confidence_snapshot text not null check (confidence_snapshot in ('low','medium','high')),
  model_count integer not null default 0 check (model_count >= 0),
  model_disagreement double precision check (model_disagreement is null or model_disagreement between 0 and 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  created_at timestamptz not null default now(),
  unique (forecast_id, forecast_version)
);

create table if not exists public.perception_forecast_scenario_branches (
  id uuid primary key default gen_random_uuid(),
  scenario_set_id uuid not null references public.perception_forecast_scenario_sets(id) on delete cascade,
  forecast_id uuid not null references public.perception_forecasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_key text not null check (branch_key in ('yes','no')),
  outcome boolean not null,
  probability double precision not null check (probability between 0 and 1),
  role text not null check (role in ('base','alternate')),
  label text not null,
  description text not null,
  assumptions jsonb not null default '[]'::jsonb,
  trigger_signals jsonb not null default '[]'::jsonb,
  downstream_consequences jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (scenario_set_id, branch_key)
);

create table if not exists public.perception_forecast_failure_checks (
  id uuid primary key default gen_random_uuid(),
  scenario_set_id uuid not null references public.perception_forecast_scenario_sets(id) on delete cascade,
  forecast_id uuid not null references public.perception_forecasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  check_kind text not null check (check_kind in ('counterfactual','shared_assumption','surprise')),
  severity text not null check (severity in ('low','medium','high')),
  title text not null,
  observation text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (scenario_set_id, check_kind)
);

create index if not exists perception_forecast_scenario_sets_forecast_idx
  on public.perception_forecast_scenario_sets(forecast_id, forecast_version desc);
create index if not exists perception_forecast_scenario_branches_set_idx
  on public.perception_forecast_scenario_branches(scenario_set_id, probability desc);
create index if not exists perception_forecast_failure_checks_set_idx
  on public.perception_forecast_failure_checks(scenario_set_id, check_kind);

alter table public.perception_forecast_scenario_sets enable row level security;
alter table public.perception_forecast_scenario_branches enable row level security;
alter table public.perception_forecast_failure_checks enable row level security;

drop policy if exists "users read own forecast scenario sets" on public.perception_forecast_scenario_sets;
drop policy if exists "users read own forecast scenario branches" on public.perception_forecast_scenario_branches;
drop policy if exists "users read own forecast failure checks" on public.perception_forecast_failure_checks;

create policy "users read own forecast scenario sets" on public.perception_forecast_scenario_sets
for select using ((select auth.uid()) = user_id);
create policy "users read own forecast scenario branches" on public.perception_forecast_scenario_branches
for select using ((select auth.uid()) = user_id);
create policy "users read own forecast failure checks" on public.perception_forecast_failure_checks
for select using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.perception_forecast_scenario_sets from anon, authenticated;
revoke insert, update, delete on public.perception_forecast_scenario_branches from anon, authenticated;
revoke insert, update, delete on public.perception_forecast_failure_checks from anon, authenticated;
grant select on public.perception_forecast_scenario_sets to authenticated;
grant select on public.perception_forecast_scenario_branches to authenticated;
grant select on public.perception_forecast_failure_checks to authenticated;

create or replace function public.perception_get_forecast_scenario_analysis(
  p_forecast_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_set public.perception_forecast_scenario_sets%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.perception_forecasts
    where id = p_forecast_id and user_id = v_user
  ) then
    raise exception 'Forecast not found' using errcode = 'P0002';
  end if;

  select * into v_set
  from public.perception_forecast_scenario_sets
  where forecast_id = p_forecast_id and user_id = v_user
  order by forecast_version desc
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'scenario_set', to_jsonb(v_set),
    'branches', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.probability desc, b.branch_key)
      from public.perception_forecast_scenario_branches b
      where b.scenario_set_id = v_set.id and b.user_id = v_user
    ), '[]'::jsonb),
    'checks', coalesce((
      select jsonb_agg(to_jsonb(c) order by
        case c.check_kind
          when 'counterfactual' then 1
          when 'shared_assumption' then 2
          else 3
        end)
      from public.perception_forecast_failure_checks c
      where c.scenario_set_id = v_set.id and c.user_id = v_user
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.perception_refresh_forecast_scenario_analysis(
  p_forecast_id uuid
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
  v_set_id uuid;
  v_support jsonb := '[]'::jsonb;
  v_contradict jsonb := '[]'::jsonb;
  v_watch jsonb := '[]'::jsonb;
  v_counter jsonb := '[]'::jsonb;
  v_model_count integer := 0;
  v_disagreement double precision;
  v_evidence_count integer := 0;
  v_yes_base boolean;
  v_counter_severity text;
  v_shared_severity text;
  v_surprise_severity text;
  v_counter_observation text;
  v_shared_observation text;
  v_surprise_observation text;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_forecast
  from public.perception_forecasts
  where id = p_forecast_id and user_id = v_user;

  if not found then
    raise exception 'Forecast not found' using errcode = 'P0002';
  end if;

  select coalesce(max(version), 1) into v_version
  from public.perception_forecast_versions
  where forecast_id = p_forecast_id and user_id = v_user;

  select id into v_set_id
  from public.perception_forecast_scenario_sets
  where forecast_id = p_forecast_id and user_id = v_user and forecast_version = v_version;

  if found then
    return public.perception_get_forecast_scenario_analysis(p_forecast_id);
  end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_support
  from (
    select value as item
    from jsonb_array_elements(coalesce(v_forecast.supporting_evidence, '[]'::jsonb))
    limit 3
  ) s;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_contradict
  from (
    select value as item
    from jsonb_array_elements(coalesce(v_forecast.contradicting_evidence, '[]'::jsonb))
    limit 3
  ) s;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_watch
  from (
    select value as item
    from jsonb_array_elements(coalesce(v_forecast.watch_signals, '[]'::jsonb))
    limit 4
  ) s;

  begin
    v_model_count := coalesce((v_forecast.model_breakdown -> '_consensus' ->> 'model_count')::integer, 0);
  exception when invalid_text_representation then
    v_model_count := 0;
  end;

  begin
    v_disagreement := (v_forecast.model_breakdown -> '_consensus' ->> 'disagreement')::double precision;
  exception when invalid_text_representation then
    v_disagreement := null;
  end;

  v_evidence_count := jsonb_array_length(coalesce(v_forecast.supporting_evidence, '[]'::jsonb))
    + jsonb_array_length(coalesce(v_forecast.contradicting_evidence, '[]'::jsonb))
    + jsonb_array_length(coalesce(v_forecast.watch_signals, '[]'::jsonb));
  v_yes_base := v_forecast.current_probability >= 0.5;
  v_counter := case when v_yes_base then v_contradict else v_support end;

  insert into public.perception_forecast_scenario_sets (
    forecast_id, user_id, forecast_version, probability_snapshot, confidence_snapshot,
    model_count, model_disagreement, evidence_count
  ) values (
    p_forecast_id, v_user, v_version, v_forecast.current_probability, v_forecast.confidence,
    v_model_count, v_disagreement, v_evidence_count
  ) returning id into v_set_id;

  insert into public.perception_forecast_scenario_branches (
    scenario_set_id, forecast_id, user_id, branch_key, outcome, probability, role,
    label, description, assumptions, trigger_signals, downstream_consequences
  ) values
  (
    v_set_id, p_forecast_id, v_user, 'yes', true, v_forecast.current_probability,
    case when v_yes_base then 'base' else 'alternate' end,
    case when v_yes_base then 'YES — BASE PATH' else 'YES — ALTERNATE PATH' end,
    'A pathway in which the forecast resolves YES by the stated deadline. Its probability is the current calibrated consensus, not a guarantee.',
    v_support,
    v_watch,
    jsonb_build_array('Resolution would verify that the event occurred by the deadline and should be treated as new evidence, while earlier forecast snapshots remain unchanged.')
  ),
  (
    v_set_id, p_forecast_id, v_user, 'no', false, 1 - v_forecast.current_probability,
    case when v_yes_base then 'alternate' else 'base' end,
    case when v_yes_base then 'NO — ALTERNATE PATH' else 'NO — BASE PATH' end,
    'A pathway in which the forecast resolves NO by the stated deadline. Its probability is the complement of the current calibrated consensus.',
    v_contradict,
    v_watch,
    jsonb_build_array('Resolution would verify that the event did not occur by the deadline and should be treated as new evidence, while earlier forecast snapshots remain unchanged.')
  );

  if jsonb_array_length(v_counter) = 0 then
    v_counter_severity := 'high';
    v_counter_observation := concat(
      'The current leading outcome is ', case when v_yes_base then 'YES' else 'NO' end,
      ', but no explicit opposite-direction evidence is recorded. Seek disconfirming evidence before increasing confidence.'
    );
  else
    v_counter_severity := 'medium';
    v_counter_observation := concat(
      'The current leading outcome is ', case when v_yes_base then 'YES' else 'NO' end,
      '. Opposite-direction evidence is recorded below. Material strengthening of those signals is the clearest falsification path.'
    );
  end if;

  if v_model_count <= 1 then
    v_shared_severity := 'high';
    v_shared_observation := 'The forecast does not yet have multiple independent model keys. Apparent confidence can still be single-source confidence.';
  elsif coalesce(v_disagreement, 0) <= 0.05 then
    v_shared_severity := 'medium';
    v_shared_observation := 'Multiple model keys are tightly clustered. Low disagreement is useful, but correlated inputs or shared assumptions can make several models fail together.';
  else
    v_shared_severity := 'low';
    v_shared_observation := 'Independent model disagreement is visible rather than averaged away. Continue checking whether model families and evidence sources are genuinely independent.';
  end if;

  if jsonb_array_length(v_watch) = 0 then
    v_surprise_severity := 'high';
    v_surprise_observation := 'No explicit watch signals are recorded. The forecast has no named early-warning surface for a low-probability surprise.';
  elsif jsonb_array_length(v_watch) = 1 then
    v_surprise_severity := 'medium';
    v_surprise_observation := 'Only one watch signal is recorded. Add independent trigger signals so a surprise is less likely to remain invisible until resolution.';
  else
    v_surprise_severity := 'low';
    v_surprise_observation := 'Multiple watch signals are recorded. Treat abrupt movement in any of them as a reason to refresh the forecast rather than as proof by itself.';
  end if;

  insert into public.perception_forecast_failure_checks (
    scenario_set_id, forecast_id, user_id, check_kind, severity, title, observation, evidence_refs
  ) values
  (v_set_id, p_forecast_id, v_user, 'counterfactual', v_counter_severity,
    'WHAT WOULD MAKE THIS WRONG?', v_counter_observation, v_counter),
  (v_set_id, p_forecast_id, v_user, 'shared_assumption', v_shared_severity,
    'COULD THE MODELS FAIL TOGETHER?', v_shared_observation,
    jsonb_build_object('model_count', v_model_count, 'disagreement', v_disagreement)),
  (v_set_id, p_forecast_id, v_user, 'surprise', v_surprise_severity,
    'WHAT COULD ARRIVE FROM OUTSIDE THE MODEL?', v_surprise_observation, v_watch);

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values (
    v_user,
    v_forecast.project_id,
    'forecast.scenarios.generated',
    jsonb_build_object(
      'forecast_id', p_forecast_id,
      'forecast_version', v_version,
      'scenario_set_id', v_set_id,
      'probability', v_forecast.current_probability,
      'model_count', v_model_count,
      'model_disagreement', v_disagreement,
      'evidence_count', v_evidence_count
    )
  );

  return public.perception_get_forecast_scenario_analysis(p_forecast_id);
end;
$$;

revoke all on function public.perception_get_forecast_scenario_analysis(uuid) from public, anon;
revoke all on function public.perception_refresh_forecast_scenario_analysis(uuid) from public, anon;
grant execute on function public.perception_get_forecast_scenario_analysis(uuid) to authenticated;
grant execute on function public.perception_refresh_forecast_scenario_analysis(uuid) to authenticated;
