create or replace function public.perception_record_token_usage_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_objective_id uuid,
  p_worker_run_id uuid,
  p_capability text,
  p_task_kind text,
  p_provider text,
  p_model text,
  p_budget_tier text,
  p_input_tokens bigint,
  p_cached_input_tokens bigint,
  p_output_tokens bigint,
  p_reasoning_tokens bigint,
  p_max_output_tokens integer,
  p_estimated_cost_usd numeric,
  p_baseline_cost_usd numeric,
  p_request_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_budget_tier not in ('tiny', 'normal', 'deep', 'max') then
    raise exception 'Invalid token budget tier';
  end if;

  if p_input_tokens < 0 or p_cached_input_tokens < 0 or p_output_tokens < 0 or p_reasoning_tokens < 0 then
    raise exception 'Token counts must be non-negative';
  end if;

  if p_cached_input_tokens > p_input_tokens then
    raise exception 'Cached input tokens cannot exceed input tokens';
  end if;

  if p_project_id is not null and not exists (
    select 1 from public.perception_projects p
    where p.id = p_project_id and p.user_id = p_user_id
  ) then
    raise exception 'Project ownership mismatch';
  end if;

  insert into public.perception_token_usage (
    user_id,
    project_id,
    objective_id,
    worker_run_id,
    capability,
    task_kind,
    provider,
    model,
    budget_tier,
    input_tokens,
    cached_input_tokens,
    output_tokens,
    reasoning_tokens,
    max_output_tokens,
    estimated_cost_usd,
    baseline_cost_usd,
    request_id,
    metadata
  ) values (
    p_user_id,
    p_project_id,
    p_objective_id,
    p_worker_run_id,
    coalesce(nullif(trim(p_capability), ''), 'reason'),
    coalesce(nullif(trim(p_task_kind), ''), 'runtime'),
    coalesce(nullif(trim(p_provider), ''), 'openai'),
    nullif(trim(p_model), ''),
    p_budget_tier,
    p_input_tokens,
    p_cached_input_tokens,
    p_output_tokens,
    p_reasoning_tokens,
    p_max_output_tokens,
    greatest(coalesce(p_estimated_cost_usd, 0), 0),
    greatest(coalesce(p_baseline_cost_usd, 0), 0),
    nullif(trim(p_request_id), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.perception_record_token_usage_internal(
  uuid, uuid, uuid, uuid, text, text, text, text, text,
  bigint, bigint, bigint, bigint, integer, numeric, numeric, text, jsonb
) from public;

grant execute on function public.perception_record_token_usage_internal(
  uuid, uuid, uuid, uuid, text, text, text, text, text,
  bigint, bigint, bigint, bigint, integer, numeric, numeric, text, jsonb
) to service_role;
