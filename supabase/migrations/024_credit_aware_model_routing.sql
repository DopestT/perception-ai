-- Credit-aware model routing telemetry.
-- Keeps token decisions auditable without changing the existing budget-tier contract.

alter table public.perception_token_decisions
  add column if not exists selected_provider text
    check (selected_provider is null or selected_provider in ('local','openai','openai_compatible')),
  add column if not exists selected_model text,
  add column if not exists routing_strategy text,
  add column if not exists route_attempts jsonb not null default '[]'::jsonb,
  add column if not exists daily_budget_usd numeric(12,4),
  add column if not exists spent_today_usd numeric(16,8) not null default 0,
  add column if not exists budget_pressure numeric(12,4) not null default 0
    check (budget_pressure >= 0);

create index if not exists perception_token_decisions_provider_model_idx
  on public.perception_token_decisions(selected_provider, selected_model, created_at desc)
  where selected_model is not null;

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
      estimated_input_tokens, reasons, selected_provider, selected_model,
      routing_strategy, route_attempts, daily_budget_usd, spent_today_usd,
      budget_pressure, created_at
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
      provider,
      model,
      count(*)::int as requests,
      sum(input_tokens + output_tokens)::bigint as tokens,
      round(sum(estimated_cost_usd), 6) as estimated_cost_usd
    from public.perception_token_usage
    where user_id = v_user_id
      and (p_project_id is null or project_id = p_project_id)
      and created_at >= now() - interval '7 days'
    group by capability, provider, model
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
