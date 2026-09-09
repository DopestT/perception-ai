create table if not exists public.perception_token_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.perception_projects(id) on delete cascade,
  enabled boolean not null default true,
  default_tier text not null default 'normal' check (default_tier in ('tiny', 'normal', 'deep', 'max')),
  daily_budget_usd numeric(12,4),
  lane_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists perception_token_policy_default_user_idx
  on public.perception_token_policies(user_id)
  where project_id is null;

create unique index if not exists perception_token_policy_project_idx
  on public.perception_token_policies(user_id, project_id)
  where project_id is not null;

create table if not exists public.perception_token_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.perception_projects(id) on delete cascade,
  objective_id uuid references public.perception_objectives(id) on delete set null,
  capability text not null,
  budget_tier text not null check (budget_tier in ('tiny', 'normal', 'deep', 'max')),
  model_lane text not null check (model_lane in ('economy', 'balanced', 'deep')),
  max_context_tokens integer not null check (max_context_tokens > 0),
  max_output_tokens integer not null check (max_output_tokens > 0),
  estimated_input_tokens integer not null default 0 check (estimated_input_tokens >= 0),
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists perception_token_decisions_project_created_idx
  on public.perception_token_decisions(project_id, created_at desc);

create table if not exists public.perception_token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.perception_projects(id) on delete cascade,
  objective_id uuid references public.perception_objectives(id) on delete set null,
  worker_run_id uuid references public.perception_worker_runs(id) on delete set null,
  capability text not null,
  task_kind text not null default 'runtime',
  provider text not null default 'openai',
  model text not null,
  budget_tier text not null check (budget_tier in ('tiny', 'normal', 'deep', 'max')),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  max_output_tokens integer,
  estimated_cost_usd numeric(16,8) not null default 0,
  baseline_cost_usd numeric(16,8) not null default 0,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (cached_input_tokens <= input_tokens)
);

create index if not exists perception_token_usage_user_created_idx
  on public.perception_token_usage(user_id, created_at desc);

create index if not exists perception_token_usage_project_created_idx
  on public.perception_token_usage(project_id, created_at desc);

alter table public.perception_token_policies enable row level security;
alter table public.perception_token_decisions enable row level security;
alter table public.perception_token_usage enable row level security;

drop policy if exists perception_token_policies_select_own on public.perception_token_policies;
create policy perception_token_policies_select_own
  on public.perception_token_policies for select
  using (user_id = auth.uid());

drop policy if exists perception_token_policies_insert_own on public.perception_token_policies;
create policy perception_token_policies_insert_own
  on public.perception_token_policies for insert
  with check (
    user_id = auth.uid()
    and (project_id is null or exists (
      select 1 from public.perception_projects p
      where p.id = project_id and p.user_id = auth.uid()
    ))
  );

drop policy if exists perception_token_policies_update_own on public.perception_token_policies;
create policy perception_token_policies_update_own
  on public.perception_token_policies for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists perception_token_decisions_select_own on public.perception_token_decisions;
create policy perception_token_decisions_select_own
  on public.perception_token_decisions for select
  using (user_id = auth.uid());

drop policy if exists perception_token_usage_select_own on public.perception_token_usage;
create policy perception_token_usage_select_own
  on public.perception_token_usage for select
  using (user_id = auth.uid());

grant select, insert, update on public.perception_token_policies to authenticated;
grant select on public.perception_token_decisions to authenticated;
grant select on public.perception_token_usage to authenticated;

create or replace function public.perception_get_token_dashboard(p_project_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy jsonb;
  v_today jsonb;
  v_week jsonb;
  v_latest jsonb;
  v_top jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_project_id is not null and not exists (
    select 1 from public.perception_projects p
    where p.id = p_project_id and p.user_id = v_user_id
  ) then
    raise exception 'Project not found';
  end if;

  select to_jsonb(policy_row) into v_policy
  from (
    select enabled, default_tier, daily_budget_usd, lane_overrides
    from public.perception_token_policies
    where user_id = v_user_id
      and (project_id = p_project_id or project_id is null)
    order by (project_id is not null) desc
    limit 1
  ) policy_row;

  if v_policy is null then
    v_policy := jsonb_build_object(
      'enabled', true,
      'default_tier', 'normal',
      'daily_budget_usd', null,
      'lane_overrides', '{}'::jsonb
    );
  end if;

  select jsonb_build_object(
    'input_tokens', coalesce(sum(input_tokens), 0),
    'cached_input_tokens', coalesce(sum(cached_input_tokens), 0),
    'output_tokens', coalesce(sum(output_tokens), 0),
    'reasoning_tokens', coalesce(sum(reasoning_tokens), 0),
    'estimated_cost_usd', coalesce(sum(estimated_cost_usd), 0),
    'baseline_cost_usd', coalesce(sum(baseline_cost_usd), 0),
    'saved_cost_usd', coalesce(sum(greatest(baseline_cost_usd - estimated_cost_usd, 0)), 0),
    'cache_ratio', case when coalesce(sum(input_tokens), 0) = 0 then 0
      else round(coalesce(sum(cached_input_tokens), 0)::numeric / sum(input_tokens)::numeric, 4) end,
    'requests', count(*)
  ) into v_today
  from public.perception_token_usage
  where user_id = v_user_id
    and (p_project_id is null or project_id = p_project_id)
    and created_at >= date_trunc('day', now());

  select jsonb_build_object(
    'input_tokens', coalesce(sum(input_tokens), 0),
    'cached_input_tokens', coalesce(sum(cached_input_tokens), 0),
    'output_tokens', coalesce(sum(output_tokens), 0),
    'estimated_cost_usd', coalesce(sum(estimated_cost_usd), 0),
    'saved_cost_usd', coalesce(sum(greatest(baseline_cost_usd - estimated_cost_usd, 0)), 0),
    'requests', count(*)
  ) into v_week
  from public.perception_token_usage
  where user_id = v_user_id
    and (p_project_id is null or project_id = p_project_id)
    and created_at >= now() - interval '7 days';

  select to_jsonb(decision_row) into v_latest
  from (
    select capability, budget_tier, model_lane, max_context_tokens, max_output_tokens,
      estimated_input_tokens, reasons, created_at
    from public.perception_token_decisions
    where user_id = v_user_id
      and (p_project_id is null or project_id = p_project_id)
    order by created_at desc
    limit 1
  ) decision_row;

  select coalesce(jsonb_agg(to_jsonb(top_row) order by top_row.estimated_cost_usd desc), '[]'::jsonb)
  into v_top
  from (
    select capability,
      model,
      count(*)::int as requests,
      sum(input_tokens + output_tokens)::bigint as tokens,
      round(sum(estimated_cost_usd), 6) as estimated_cost_usd
    from public.perception_token_usage
    where user_id = v_user_id
      and (p_project_id is null or project_id = p_project_id)
      and created_at >= now() - interval '7 days'
    group by capability, model
    order by sum(estimated_cost_usd) desc
    limit 5
  ) top_row;

  return jsonb_build_object(
    'automatic_cost_control', coalesce((v_policy ->> 'enabled')::boolean, true),
    'policy', v_policy,
    'today', v_today,
    'last_7_days', v_week,
    'latest_decision', v_latest,
    'top_consumers', v_top,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.perception_get_token_dashboard(uuid) from public;
grant execute on function public.perception_get_token_dashboard(uuid) to authenticated;
