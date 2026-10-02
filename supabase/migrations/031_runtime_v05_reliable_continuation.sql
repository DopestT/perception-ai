-- Runtime v0.5 reliable continuation.
-- Adds logical idempotency, leases, bounded retries, and service-only claim/fail/apply RPCs
-- for bounded local generation workers.

alter table public.perception_worker_runs
  add column if not exists attempt integer not null default 1
    check (attempt > 0),
  add column if not exists idempotency_key text,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists retry_after timestamptz,
  add column if not exists failure_code text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists perception_worker_runs_retry_idx
  on public.perception_worker_runs(idempotency_key, retry_after, created_at desc)
  where idempotency_key is not null;

create unique index if not exists perception_worker_runs_logical_active_idx
  on public.perception_worker_runs(idempotency_key)
  where idempotency_key is not null
    and status in ('queued','running','succeeded');

create or replace function public.perception_claim_local_node_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_objective_id uuid,
  p_route_id uuid,
  p_route_node_id uuid,
  p_worker_key text,
  p_input jsonb default '{}'::jsonb,
  p_lease_token uuid default gen_random_uuid(),
  p_lease_seconds integer default 600,
  p_max_attempts integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_node public.perception_route_nodes%rowtype;
  v_existing public.perception_worker_runs%rowtype;
  v_worker public.perception_worker_runs%rowtype;
  v_idempotency_key text;
  v_attempt integer := 1;
  v_lease_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 600), 1800));
  v_max_attempts integer := greatest(1, least(coalesce(p_max_attempts, 3), 5));
begin
  if p_user_id is null or p_project_id is null or p_objective_id is null
     or p_route_id is null or p_route_node_id is null then
    raise exception 'Local claim identifiers are required' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_worker_key, '')), '') is null then
    raise exception 'Worker key is required' using errcode = '22023';
  end if;

  if p_lease_token is null then
    raise exception 'Lease token is required' using errcode = '22023';
  end if;

  select n.*
  into v_node
  from public.perception_route_nodes n
  join public.perception_routes r on r.id = n.route_id
  where n.id = p_route_node_id
    and n.user_id = p_user_id
    and n.project_id = p_project_id
    and n.route_id = p_route_id
    and r.objective_id = p_objective_id
    and r.user_id = p_user_id
    and r.project_id = p_project_id
  for update of n;

  if not found then
    raise exception 'Route node is not owned by this objective' using errcode = '42501';
  end if;

  if v_node.capability <> 'generate' or v_node.permission_level not in ('P0','P1') then
    raise exception 'Only bounded P0/P1 generate nodes may use the local claim runtime'
      using errcode = '42501';
  end if;

  if v_node.status = 'completed' then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'reason', 'already_completed',
      'route_node_id', p_route_node_id
    );
  end if;

  v_idempotency_key :=
    left(p_worker_key, 120)
    || ':' || p_objective_id::text
    || ':' || md5(lower(btrim(coalesce(v_node.outcome, v_node.label, p_route_node_id::text))));

  perform pg_advisory_xact_lock(hashtextextended(v_idempotency_key, 0));

  select *
  into v_existing
  from public.perception_worker_runs
  where idempotency_key = v_idempotency_key
  order by created_at desc
  limit 1
  for update;

  if found and v_existing.status = 'succeeded' then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'reason', 'already_succeeded',
      'worker_run_id', v_existing.id,
      'output_artifact_id', v_existing.output_artifact_id,
      'attempt', v_existing.attempt,
      'idempotency_key', v_idempotency_key
    );
  end if;

  if found and v_existing.status in ('queued','running') then
    if v_existing.lease_expires_at is not null and v_existing.lease_expires_at > now() then
      return jsonb_build_object(
        'ok', true,
        'claimed', false,
        'reason', 'in_progress',
        'worker_run_id', v_existing.id,
        'attempt', v_existing.attempt,
        'lease_expires_at', v_existing.lease_expires_at,
        'idempotency_key', v_idempotency_key
      );
    end if;

    update public.perception_worker_runs
    set status = 'failed',
        failure_code = 'lease_expired',
        evidence = coalesce(evidence, '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('kind','failure','failure','Worker lease expired before completion.')),
        finished_at = coalesce(finished_at, now()),
        retry_after = now(),
        lease_token = null,
        lease_expires_at = null,
        updated_at = now()
    where id = v_existing.id;

    update public.perception_route_nodes
    set status = 'failed',
        blocker = 'Previous local worker lease expired before completion.',
        updated_at = now()
    where id = v_existing.route_node_id
      and status <> 'completed';

    if not exists (
      select 1
      from public.perception_execution_ledger
      where worker_run_id = v_existing.id
        and phase = 'failed'
    ) then
      insert into public.perception_execution_ledger (
        user_id, project_id, objective_id, route_id, route_node_id, worker_run_id,
        action_key, phase, permission_level, capability, details
      ) values (
        v_existing.user_id,
        v_existing.project_id,
        p_objective_id,
        p_route_id,
        v_existing.route_node_id,
        v_existing.id,
        concat('worker:', v_existing.worker_key, ':', v_existing.id::text),
        'failed',
        v_existing.permission_level,
        v_existing.capability,
        jsonb_build_object('failure_code','lease_expired','retryable',true)
      );
    end if;
  end if;

  select coalesce(max(attempt), 0) + 1
  into v_attempt
  from public.perception_worker_runs
  where idempotency_key = v_idempotency_key;

  select *
  into v_existing
  from public.perception_worker_runs
  where idempotency_key = v_idempotency_key
    and status = 'failed'
  order by created_at desc
  limit 1;

  if found and v_existing.retry_after is not null and v_existing.retry_after > now() then
    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'reason', 'retry_wait',
      'worker_run_id', v_existing.id,
      'attempt', v_existing.attempt,
      'retry_after', v_existing.retry_after,
      'idempotency_key', v_idempotency_key
    );
  end if;

  if v_attempt > v_max_attempts then
    update public.perception_route_nodes
    set status = 'failed',
        blocker = 'Local worker retry limit reached. Resume requires a materially changed route or new objective.',
        updated_at = now()
    where id = p_route_node_id
      and status <> 'completed';

    return jsonb_build_object(
      'ok', true,
      'claimed', false,
      'reason', 'retry_exhausted',
      'attempt', v_attempt - 1,
      'max_attempts', v_max_attempts,
      'idempotency_key', v_idempotency_key
    );
  end if;

  update public.perception_route_nodes
  set status = 'running',
      blocker = null,
      updated_at = now()
  where id = p_route_node_id;

  insert into public.perception_worker_runs (
    user_id,
    project_id,
    route_node_id,
    worker_key,
    capability,
    permission_level,
    status,
    input,
    evidence,
    started_at,
    attempt,
    idempotency_key,
    lease_token,
    lease_expires_at,
    retry_after,
    failure_code,
    updated_at
  ) values (
    p_user_id,
    p_project_id,
    p_route_node_id,
    p_worker_key,
    v_node.capability,
    v_node.permission_level,
    'running',
    coalesce(p_input, '{}'::jsonb),
    '[]'::jsonb,
    now(),
    v_attempt,
    v_idempotency_key,
    p_lease_token,
    now() + make_interval(secs => v_lease_seconds),
    null,
    null,
    now()
  )
  returning *
  into v_worker;

  return jsonb_build_object(
    'ok', true,
    'claimed', true,
    'reason', 'claimed',
    'worker_run_id', v_worker.id,
    'attempt', v_worker.attempt,
    'idempotency_key', v_worker.idempotency_key,
    'lease_token', v_worker.lease_token,
    'lease_expires_at', v_worker.lease_expires_at
  );
end;
$$;

revoke all on function public.perception_claim_local_node_internal(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.perception_claim_local_node_internal(uuid,uuid,uuid,uuid,uuid,text,jsonb,uuid,integer,integer)
  to service_role;

create or replace function public.perception_fail_local_worker_internal(
  p_worker_run_id uuid,
  p_lease_token uuid,
  p_failure_code text,
  p_failure_text text,
  p_retry_delay_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker public.perception_worker_runs%rowtype;
  v_route_id uuid;
  v_objective_id uuid;
  v_retry_delay integer := greatest(0, least(coalesce(p_retry_delay_seconds, 30), 3600));
begin
  select *
  into v_worker
  from public.perception_worker_runs
  where id = p_worker_run_id
  for update;

  if not found then
    raise exception 'Worker run not found' using errcode = '22023';
  end if;

  if v_worker.status <> 'running'
     or v_worker.lease_token is distinct from p_lease_token
     or v_worker.lease_expires_at is null
     or v_worker.lease_expires_at <= now() then
    raise exception 'Worker lease is not active' using errcode = '55000';
  end if;

  select r.id, r.objective_id
  into v_route_id, v_objective_id
  from public.perception_route_nodes n
  join public.perception_routes r on r.id = n.route_id
  where n.id = v_worker.route_node_id;

  update public.perception_worker_runs
  set status = 'failed',
      failure_code = left(coalesce(nullif(btrim(p_failure_code), ''), 'local_worker_failed'), 120),
      evidence = coalesce(evidence, '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
          'kind','failure',
          'failure',left(coalesce(nullif(btrim(p_failure_text), ''), 'Local worker failed.'), 2000)
        )),
      finished_at = now(),
      retry_after = now() + make_interval(secs => v_retry_delay),
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where id = v_worker.id;

  update public.perception_route_nodes
  set status = 'failed',
      blocker = left(coalesce(nullif(btrim(p_failure_text), ''), 'Local worker failed.'), 1000),
      updated_at = now()
  where id = v_worker.route_node_id
    and status <> 'completed';

  if not exists (
    select 1
    from public.perception_execution_ledger
    where worker_run_id = v_worker.id
      and phase = 'failed'
  ) then
    insert into public.perception_execution_ledger (
      user_id, project_id, objective_id, route_id, route_node_id, worker_run_id,
      action_key, phase, permission_level, capability, details
    ) values (
      v_worker.user_id,
      v_worker.project_id,
      v_objective_id,
      v_route_id,
      v_worker.route_node_id,
      v_worker.id,
      concat('worker:', v_worker.worker_key, ':', v_worker.id::text),
      'failed',
      v_worker.permission_level,
      v_worker.capability,
      jsonb_build_object(
        'failure_code', left(coalesce(nullif(btrim(p_failure_code), ''), 'local_worker_failed'), 120),
        'failure', left(coalesce(nullif(btrim(p_failure_text), ''), 'Local worker failed.'), 2000),
        'retry_after', now() + make_interval(secs => v_retry_delay),
        'retryable', true
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'worker_run_id', v_worker.id,
    'status', 'failed',
    'retry_after', now() + make_interval(secs => v_retry_delay)
  );
end;
$$;

revoke all on function public.perception_fail_local_worker_internal(uuid,uuid,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.perception_fail_local_worker_internal(uuid,uuid,text,text,integer)
  to service_role;

create or replace function public.perception_apply_verified_local_effect_leased_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_objective_id uuid,
  p_route_node_id uuid,
  p_worker_run_id uuid,
  p_lease_token uuid,
  p_artifact_id uuid,
  p_summary text,
  p_evidence jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform 1
  from public.perception_worker_runs
  where id = p_worker_run_id
    and user_id = p_user_id
    and project_id = p_project_id
    and route_node_id = p_route_node_id
    and status = 'running'
    and lease_token = p_lease_token
    and lease_expires_at > now()
  for update;

  if not found then
    raise exception 'Active local worker lease is required before Project World may advance'
      using errcode = '55000';
  end if;

  v_result := public.perception_apply_verified_local_effect_internal(
    p_user_id,
    p_project_id,
    p_objective_id,
    p_route_node_id,
    p_worker_run_id,
    p_artifact_id,
    p_summary,
    p_evidence
  );

  update public.perception_worker_runs
  set lease_token = null,
      lease_expires_at = null,
      retry_after = null,
      failure_code = null,
      updated_at = now()
  where id = p_worker_run_id;

  return coalesce(v_result, '{}'::jsonb)
    || jsonb_build_object('lease_released', true);
end;
$$;

revoke all on function public.perception_apply_verified_local_effect_leased_internal(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.perception_apply_verified_local_effect_leased_internal(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb)
  to service_role;
