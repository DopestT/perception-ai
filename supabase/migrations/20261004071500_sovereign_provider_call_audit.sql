-- Canonical provider-call provenance for the Perception Sovereign Storage Rule.
-- Provider execution is observable evidence; provider-side state is never a restore dependency.

create table if not exists public.perception_provider_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  objective_id uuid references public.perception_objectives(id) on delete set null,
  worker_run_id uuid references public.perception_worker_runs(id) on delete set null,
  capability text not null,
  task_kind text not null,
  stage text,
  attempt_ordinal integer not null check (attempt_ordinal > 0),
  provider text not null check (char_length(provider) between 1 and 120),
  model text not null check (char_length(model) between 1 and 240),
  protocol text not null check (char_length(protocol) between 1 and 80),
  model_lane text check (model_lane is null or model_lane in ('economy','balanced','deep')),
  ok boolean not null,
  reason text check (reason is null or char_length(reason) <= 2000),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  provider_storage_directive text not null default 'none'
    check (provider_storage_directive in ('store_false','none')),
  bounded_copy boolean not null default true check (bounded_copy = true),
  provider_state_authoritative boolean not null default false
    check (provider_state_authoritative = false),
  canonical_dependency boolean not null default false
    check (canonical_dependency = false),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (cached_input_tokens <= input_tokens),
  check (provider <> 'openai' or provider_storage_directive = 'store_false')
);

create index if not exists perception_provider_calls_project_created_idx
  on public.perception_provider_calls(project_id, created_at desc);

create index if not exists perception_provider_calls_objective_created_idx
  on public.perception_provider_calls(objective_id, created_at desc)
  where objective_id is not null;

create index if not exists perception_provider_calls_provider_model_idx
  on public.perception_provider_calls(provider, model, created_at desc);

create unique index if not exists perception_provider_calls_objective_attempt_uidx
  on public.perception_provider_calls(objective_id, task_kind, attempt_ordinal)
  where objective_id is not null and worker_run_id is null;

create unique index if not exists perception_provider_calls_worker_attempt_uidx
  on public.perception_provider_calls(worker_run_id, task_kind, attempt_ordinal)
  where worker_run_id is not null;

alter table public.perception_provider_calls enable row level security;

drop policy if exists "users read own provider calls" on public.perception_provider_calls;
create policy "users read own provider calls"
  on public.perception_provider_calls
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.perception_provider_calls from public, anon, authenticated;
grant select on table public.perception_provider_calls to authenticated;
grant all on table public.perception_provider_calls to service_role;

create or replace function public.perception_record_provider_call_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_objective_id uuid,
  p_worker_run_id uuid,
  p_capability text,
  p_task_kind text,
  p_stage text,
  p_attempt_ordinal integer,
  p_provider text,
  p_model text,
  p_protocol text,
  p_model_lane text,
  p_ok boolean,
  p_reason text,
  p_input_tokens bigint,
  p_cached_input_tokens bigint,
  p_output_tokens bigint,
  p_reasoning_tokens bigint,
  p_provider_storage_directive text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_provider text := nullif(btrim(coalesce(p_provider,'')), '');
  v_model text := nullif(btrim(coalesce(p_model,'')), '');
  v_protocol text := nullif(btrim(coalesce(p_protocol,'')), '');
  v_capability text := coalesce(nullif(btrim(coalesce(p_capability,'')), ''), 'reason');
  v_task_kind text := nullif(btrim(coalesce(p_task_kind,'')), '');
  v_stage text := nullif(btrim(coalesce(p_stage,'')), '');
  v_storage text := coalesce(nullif(btrim(coalesce(p_provider_storage_directive,'')), ''), 'none');
begin
  if p_user_id is null or p_project_id is null then
    raise exception 'User and project are required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.perception_projects p
    where p.id = p_project_id and p.user_id = p_user_id
  ) then
    raise exception 'Project ownership mismatch' using errcode = '42501';
  end if;

  if p_objective_id is not null and not exists (
    select 1
    from public.perception_objectives o
    where o.id = p_objective_id
      and o.project_id = p_project_id
      and o.user_id = p_user_id
  ) then
    raise exception 'Objective ownership mismatch' using errcode = '42501';
  end if;

  if p_worker_run_id is not null and not exists (
    select 1
    from public.perception_worker_runs w
    where w.id = p_worker_run_id
      and w.project_id = p_project_id
      and w.user_id = p_user_id
  ) then
    raise exception 'Worker ownership mismatch' using errcode = '42501';
  end if;

  if p_attempt_ordinal is null or p_attempt_ordinal <= 0 then
    raise exception 'Attempt ordinal must be positive' using errcode = '22023';
  end if;

  if v_provider is null or char_length(v_provider) > 120 then
    raise exception 'Provider is required and must be <= 120 characters' using errcode = '22023';
  end if;

  if v_model is null or char_length(v_model) > 240 then
    raise exception 'Model is required and must be <= 240 characters' using errcode = '22023';
  end if;

  if v_protocol is null or char_length(v_protocol) > 80 then
    raise exception 'Protocol is required and must be <= 80 characters' using errcode = '22023';
  end if;

  if v_task_kind is null or char_length(v_task_kind) > 120 then
    raise exception 'Task kind is required and must be <= 120 characters' using errcode = '22023';
  end if;

  if p_model_lane is not null and p_model_lane not in ('economy','balanced','deep') then
    raise exception 'Invalid model lane' using errcode = '22023';
  end if;

  if v_storage not in ('store_false','none') then
    raise exception 'Invalid provider storage directive' using errcode = '22023';
  end if;

  if v_provider = 'openai' and v_storage <> 'store_false' then
    raise exception 'OpenAI provider calls must record store_false' using errcode = '22023';
  end if;

  if least(
    coalesce(p_input_tokens,0),
    coalesce(p_cached_input_tokens,0),
    coalesce(p_output_tokens,0),
    coalesce(p_reasoning_tokens,0)
  ) < 0 then
    raise exception 'Token counts must be non-negative' using errcode = '22023';
  end if;

  if coalesce(p_cached_input_tokens,0) > coalesce(p_input_tokens,0) then
    raise exception 'Cached input tokens cannot exceed input tokens' using errcode = '22023';
  end if;

  insert into public.perception_provider_calls (
    user_id,
    project_id,
    objective_id,
    worker_run_id,
    capability,
    task_kind,
    stage,
    attempt_ordinal,
    provider,
    model,
    protocol,
    model_lane,
    ok,
    reason,
    input_tokens,
    cached_input_tokens,
    output_tokens,
    reasoning_tokens,
    provider_storage_directive,
    bounded_copy,
    provider_state_authoritative,
    canonical_dependency,
    metadata
  ) values (
    p_user_id,
    p_project_id,
    p_objective_id,
    p_worker_run_id,
    v_capability,
    v_task_kind,
    v_stage,
    p_attempt_ordinal,
    v_provider,
    v_model,
    v_protocol,
    p_model_lane,
    coalesce(p_ok,false),
    left(nullif(btrim(coalesce(p_reason,'')), ''), 2000),
    coalesce(p_input_tokens,0),
    coalesce(p_cached_input_tokens,0),
    coalesce(p_output_tokens,0),
    coalesce(p_reasoning_tokens,0),
    v_storage,
    true,
    false,
    false,
    coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    if p_worker_run_id is not null then
      select id into v_id
      from public.perception_provider_calls
      where worker_run_id = p_worker_run_id
        and task_kind = v_task_kind
        and attempt_ordinal = p_attempt_ordinal;
    elsif p_objective_id is not null then
      select id into v_id
      from public.perception_provider_calls
      where objective_id = p_objective_id
        and worker_run_id is null
        and task_kind = v_task_kind
        and attempt_ordinal = p_attempt_ordinal;
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.perception_record_provider_call_internal(
  uuid,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,boolean,text,
  bigint,bigint,bigint,bigint,text,jsonb
) from public, anon, authenticated;

grant execute on function public.perception_record_provider_call_internal(
  uuid,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,boolean,text,
  bigint,bigint,bigint,bigint,text,jsonb
) to service_role;

create or replace function public.perception_get_sovereignty_dashboard(
  p_project_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_authority jsonb;
  v_latest_export jsonb;
  v_provider_summary jsonb;
  v_recent_calls jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_project_id is null or not exists (
    select 1
    from public.perception_projects p
    where p.id = p_project_id and p.user_id = v_user_id
  ) then
    raise exception 'Project not found' using errcode = '42501';
  end if;

  select to_jsonb(a)
  into v_authority
  from (
    select
      authority_key,
      owner_organization,
      canonical_store_class,
      rule_version,
      provider_state_authoritative,
      conversation_history_authoritative,
      provider_vector_store_authoritative,
      provider_thread_authoritative,
      updated_at
    from public.perception_storage_authority
    where authority_key = 'canonical'
  ) a;

  select to_jsonb(e)
  into v_latest_export
  from (
    select
      id,
      export_kind,
      destination_class,
      manifest_sha256,
      archive_sha256,
      archive_bytes,
      status,
      prepared_at,
      written_at,
      verified_at
    from public.perception_sovereign_exports
    where user_id = v_user_id
      and project_id = p_project_id
    order by prepared_at desc
    limit 1
  ) e;

  select jsonb_build_object(
    'calls_24h', count(*),
    'failed_24h', count(*) filter (where ok = false),
    'openai_calls_24h', count(*) filter (where provider = 'openai'),
    'openai_store_false_24h', count(*) filter (
      where provider = 'openai' and provider_storage_directive = 'store_false'
    ),
    'all_provider_state_non_authoritative', bool_and(provider_state_authoritative = false),
    'all_calls_noncanonical_dependencies', bool_and(canonical_dependency = false)
  )
  into v_provider_summary
  from public.perception_provider_calls
  where user_id = v_user_id
    and project_id = p_project_id
    and created_at >= now() - interval '24 hours';

  select coalesce(
    jsonb_agg(to_jsonb(c) order by c.created_at desc),
    '[]'::jsonb
  )
  into v_recent_calls
  from (
    select
      id,
      capability,
      task_kind,
      stage,
      attempt_ordinal,
      provider,
      model,
      protocol,
      model_lane,
      ok,
      reason,
      input_tokens,
      cached_input_tokens,
      output_tokens,
      reasoning_tokens,
      provider_storage_directive,
      bounded_copy,
      provider_state_authoritative,
      canonical_dependency,
      created_at
    from public.perception_provider_calls
    where user_id = v_user_id
      and project_id = p_project_id
    order by created_at desc
    limit 25
  ) c;

  return jsonb_build_object(
    'authority', coalesce(v_authority, '{}'::jsonb),
    'latest_export', v_latest_export,
    'provider_summary_24h', coalesce(v_provider_summary, '{}'::jsonb),
    'recent_provider_calls', v_recent_calls,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.perception_get_sovereignty_dashboard(uuid) from public, anon;
grant execute on function public.perception_get_sovereignty_dashboard(uuid) to authenticated;

create or replace function public.perception_build_sovereign_manifest_internal(
  p_user_id uuid,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.perception_projects%rowtype;
  v_manifest jsonb;
begin
  if p_user_id is null or p_project_id is null then
    raise exception 'User and project are required' using errcode = '22023';
  end if;

  select *
  into v_project
  from public.perception_projects
  where id = p_project_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Project World not found for user' using errcode = '42501';
  end if;

  v_manifest := jsonb_build_object(
    'schema', 'perception-sovereign-manifest/v1',
    'authority', jsonb_build_object(
      'owner', 'Legacy Works Ventures',
      'canonical_store', 'lw_controlled_perception_database',
      'provider_state_authoritative', false,
      'conversation_history_authoritative', false,
      'provider_vector_store_authoritative', false,
      'provider_thread_authoritative', false
    ),
    'project_id', p_project_id,
    'user_id', p_user_id,
    'generated_at', now(),
    'row_counts', jsonb_build_object(
      'projects', 1,
      'beliefs', (select count(*) from public.perception_beliefs where project_id = p_project_id and user_id = p_user_id),
      'model_events', (select count(*) from public.perception_model_events where project_id = p_project_id and user_id = p_user_id),
      'objectives', (select count(*) from public.perception_objectives where project_id = p_project_id and user_id = p_user_id),
      'routes', (select count(*) from public.perception_routes where project_id = p_project_id and user_id = p_user_id),
      'route_nodes', (select count(*) from public.perception_route_nodes where project_id = p_project_id and user_id = p_user_id),
      'permission_grants', (select count(*) from public.perception_permission_grants where project_id = p_project_id and user_id = p_user_id),
      'artifacts', (select count(*) from public.perception_artifacts where project_id = p_project_id and user_id = p_user_id),
      'verification_runs', (select count(*) from public.perception_verification_runs where project_id = p_project_id and user_id = p_user_id),
      'world_signals', (select count(*) from public.perception_world_signals where project_id = p_project_id and user_id = p_user_id),
      'worker_runs', (select count(*) from public.perception_worker_runs where project_id = p_project_id and user_id = p_user_id),
      'epistemic_ledger', (select count(*) from public.perception_epistemic_ledger where project_id = p_project_id and user_id = p_user_id),
      'execution_ledger', (select count(*) from public.perception_execution_ledger where project_id = p_project_id and user_id = p_user_id),
      'scenarios', (select count(*) from public.perception_scenarios where project_id = p_project_id and user_id = p_user_id),
      'provider_calls', (select count(*) from public.perception_provider_calls where project_id = p_project_id and user_id = p_user_id)
    ),
    'checkpoints', jsonb_build_object(
      'project_updated_at', v_project.updated_at,
      'latest_model_event_at', (select max(created_at) from public.perception_model_events where project_id = p_project_id and user_id = p_user_id),
      'latest_epistemic_at', (select max(created_at) from public.perception_epistemic_ledger where project_id = p_project_id and user_id = p_user_id),
      'latest_execution_at', (select max(created_at) from public.perception_execution_ledger where project_id = p_project_id and user_id = p_user_id),
      'latest_verification_at', (select max(checked_at) from public.perception_verification_runs where project_id = p_project_id and user_id = p_user_id),
      'latest_provider_call_at', (select max(created_at) from public.perception_provider_calls where project_id = p_project_id and user_id = p_user_id)
    )
  );

  return v_manifest;
end;
$$;

revoke all on function public.perception_build_sovereign_manifest_internal(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.perception_build_sovereign_manifest_internal(uuid,uuid)
  to service_role;

comment on table public.perception_provider_calls is
  'Canonical LWV-controlled provenance for model-provider attempts. Provider state is explicitly non-authoritative and never a restore dependency.';
