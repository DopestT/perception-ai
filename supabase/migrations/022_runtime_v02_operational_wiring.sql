-- Perception Runtime v0.2 operational wiring
-- Structured objective semantics + automatic execution-ledger capture + permission enforcement.

alter table public.perception_objectives
  add column if not exists meaning jsonb not null default '{}'::jsonb,
  add column if not exists meaning_source text,
  add column if not exists meaning_confidence double precision
    check (meaning_confidence is null or meaning_confidence between 0 and 1);

create or replace function public.perception_permission_rank(p_level text)
returns integer
language sql
immutable
as $$
  select case p_level
    when 'P0' then 0
    when 'P1' then 1
    when 'P2' then 2
    when 'P3' then 3
    else -1
  end;
$$;

create or replace function public.perception_enforce_worker_permission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allowed boolean := false;
begin
  if new.permission_level in ('P0', 'P1') then
    return new;
  end if;

  select exists (
    select 1
    from public.perception_permission_grants g
    where g.user_id = new.user_id
      and g.project_id = new.project_id
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and public.perception_permission_rank(g.permission_level) >= public.perception_permission_rank(new.permission_level)
      and (g.capability is null or g.capability = new.capability)
  ) into v_allowed;

  if not v_allowed then
    raise exception 'Permission grant required for % worker capability %', new.permission_level, new.capability
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists perception_worker_permission_gate on public.perception_worker_runs;
create trigger perception_worker_permission_gate
before insert on public.perception_worker_runs
for each row execute function public.perception_enforce_worker_permission();

create or replace function public.perception_capture_worker_execution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_objective_id uuid;
  v_route_id uuid;
  v_action_key text := concat('worker:', new.worker_key, ':', new.id::text);
begin
  select r.objective_id, n.route_id
  into v_objective_id, v_route_id
  from public.perception_route_nodes n
  join public.perception_routes r on r.id = n.route_id
  where n.id = new.route_node_id;

  insert into public.perception_execution_ledger (
    user_id, project_id, objective_id, route_id, route_node_id, worker_run_id,
    action_key, phase, permission_level, capability, details
  ) values
    (
      new.user_id, new.project_id, v_objective_id, v_route_id, new.route_node_id, new.id,
      v_action_key, 'intended', new.permission_level, new.capability,
      jsonb_build_object('worker_key', new.worker_key)
    ),
    (
      new.user_id, new.project_id, v_objective_id, v_route_id, new.route_node_id, new.id,
      v_action_key, 'authorized', new.permission_level, new.capability,
      jsonb_build_object(
        'worker_key', new.worker_key,
        'authorization_basis',
        case when new.permission_level in ('P0','P1') then 'runtime_default' else 'active_permission_grant' end
      )
    ),
    (
      new.user_id, new.project_id, v_objective_id, v_route_id, new.route_node_id, new.id,
      v_action_key, 'attempted', new.permission_level, new.capability,
      jsonb_build_object('worker_key', new.worker_key, 'worker_status', new.status)
    );

  return new;
end;
$$;

drop trigger if exists perception_worker_execution_ledger on public.perception_worker_runs;
create trigger perception_worker_execution_ledger
after insert on public.perception_worker_runs
for each row execute function public.perception_capture_worker_execution();

create or replace function public.perception_capture_artifact_observation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker public.perception_worker_runs%rowtype;
  v_route_id uuid;
  v_action_key text;
begin
  if new.route_node_id is null then
    return new;
  end if;

  select *
  into v_worker
  from public.perception_worker_runs
  where route_node_id = new.route_node_id
    and project_id = new.project_id
  order by created_at desc
  limit 1;

  if not found then
    return new;
  end if;

  select route_id into v_route_id
  from public.perception_route_nodes
  where id = new.route_node_id;

  v_action_key := concat('worker:', v_worker.worker_key, ':', v_worker.id::text);

  insert into public.perception_execution_ledger (
    user_id, project_id, objective_id, route_id, route_node_id, worker_run_id,
    action_key, phase, permission_level, capability, details, evidence
  ) values (
    new.user_id, new.project_id, new.objective_id, v_route_id, new.route_node_id, v_worker.id,
    v_action_key, 'observed', v_worker.permission_level, v_worker.capability,
    jsonb_build_object('artifact_id', new.id, 'artifact_type', new.artifact_type, 'title', new.title),
    jsonb_build_array(jsonb_build_object('kind', 'artifact', 'artifact_id', new.id))
  );

  return new;
end;
$$;

drop trigger if exists perception_artifact_execution_ledger on public.perception_artifacts;
create trigger perception_artifact_execution_ledger
after insert on public.perception_artifacts
for each row execute function public.perception_capture_artifact_observation();

create or replace function public.perception_capture_verification_execution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worker public.perception_worker_runs%rowtype;
  v_objective_id uuid;
  v_route_id uuid;
  v_action_key text;
begin
  if new.worker_run_id is null then
    return new;
  end if;

  select *
  into v_worker
  from public.perception_worker_runs
  where id = new.worker_run_id;

  if not found then
    return new;
  end if;

  select r.objective_id, n.route_id
  into v_objective_id, v_route_id
  from public.perception_route_nodes n
  join public.perception_routes r on r.id = n.route_id
  where n.id = new.route_node_id;

  v_action_key := concat('worker:', v_worker.worker_key, ':', v_worker.id::text);

  insert into public.perception_execution_ledger (
    user_id, project_id, objective_id, route_id, route_node_id, worker_run_id,
    action_key, phase, permission_level, capability, details, evidence
  ) values (
    new.user_id, new.project_id, v_objective_id, v_route_id, new.route_node_id, v_worker.id,
    v_action_key, case when new.passed then 'verified' else 'failed' end,
    v_worker.permission_level, v_worker.capability,
    jsonb_build_object('verification_id', new.id, 'passed', new.passed, 'details', new.details),
    coalesce(new.evidence, '[]'::jsonb)
  );

  return new;
end;
$$;

drop trigger if exists perception_verification_execution_ledger on public.perception_verification_runs;
create trigger perception_verification_execution_ledger
after insert on public.perception_verification_runs
for each row execute function public.perception_capture_verification_execution();

create or replace function public.perception_submit_resolved_objective_internal(
  p_user_id uuid,
  p_statement text,
  p_semantics jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_project_id uuid;
  v_objective_id uuid;
  v_desired_reality text;
  v_semantic_current_reality text;
  v_source text;
  v_confidence double precision;
  v_urgency text;
  v_claim jsonb;
begin
  if p_user_id is null then
    raise exception 'User id is required' using errcode = '22023';
  end if;

  v_result := public.perception_submit_objective_internal(p_user_id, p_statement);

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;

  v_project_id := (v_result->>'project_id')::uuid;
  v_objective_id := (v_result->>'objective_id')::uuid;
  v_desired_reality := coalesce(nullif(btrim(p_semantics->>'desired_reality'), ''), p_statement);
  v_semantic_current_reality := coalesce(
    nullif(btrim(p_semantics->>'current_reality'), ''),
    'Only the direct objective statement is currently known.'
  );
  v_source := case
    when p_semantics->>'source' in ('openai','deterministic_fallback') then p_semantics->>'source'
    else 'deterministic_fallback'
  end;
  v_confidence := greatest(0, least(1, coalesce((p_semantics->>'confidence')::double precision, 0.55)));
  v_urgency := case
    when p_semantics->>'urgency' in ('low','normal','high','critical') then p_semantics->>'urgency'
    else 'normal'
  end;

  update public.perception_objectives
  set desired_reality = v_desired_reality,
      constraints = case when jsonb_typeof(p_semantics->'constraints') = 'array' then p_semantics->'constraints' else constraints end,
      success_criteria = case
        when jsonb_typeof(p_semantics->'success_criteria') = 'array'
          and jsonb_array_length(p_semantics->'success_criteria') > 0
        then p_semantics->'success_criteria'
        else success_criteria
      end,
      deliverables = case
        when jsonb_typeof(p_semantics->'deliverables') = 'array'
          and jsonb_array_length(p_semantics->'deliverables') > 0
        then p_semantics->'deliverables'
        else deliverables
      end,
      known_unknowns = case when jsonb_typeof(p_semantics->'known_unknowns') = 'array' then p_semantics->'known_unknowns' else known_unknowns end,
      urgency = v_urgency,
      meaning = coalesce(p_semantics, '{}'::jsonb),
      meaning_source = v_source,
      meaning_confidence = v_confidence,
      updated_at = now()
  where id = v_objective_id and user_id = p_user_id;

  update public.perception_projects
  set desired_reality = v_desired_reality,
      updated_at = now()
  where id = v_project_id and user_id = p_user_id;

  insert into public.perception_epistemic_ledger (
    user_id, project_id, objective_id, claim_key, statement, state, confidence,
    provenance, route_impact, metadata
  ) values (
    p_user_id, v_project_id, v_objective_id,
    'objective.user_statement',
    p_statement,
    'observed',
    1,
    jsonb_build_array(jsonb_build_object('kind','user_input','ref',p_statement,'observed_at',now())),
    'Anchors the objective and may be trusted for routing.',
    jsonb_build_object('meaning_source', v_source)
  );

  insert into public.perception_epistemic_ledger (
    user_id, project_id, objective_id, claim_key, statement, state, confidence,
    provenance, route_impact, metadata
  ) values (
    p_user_id, v_project_id, v_objective_id,
    'objective.desired_reality',
    v_desired_reality,
    case when v_desired_reality = p_statement then 'observed' else 'inferred' end,
    case when v_desired_reality = p_statement then 1 else v_confidence end,
    jsonb_build_array(jsonb_build_object('kind','meaning_resolver','source',v_source,'model',p_semantics->>'model')),
    'Defines the target state; inferred phrasing remains revisable.',
    jsonb_build_object('source_statement', p_statement)
  );

  insert into public.perception_epistemic_ledger (
    user_id, project_id, objective_id, claim_key, statement, state, confidence,
    provenance, route_impact, metadata
  ) values (
    p_user_id, v_project_id, v_objective_id,
    'objective.semantic_current_reality',
    v_semantic_current_reality,
    'inferred',
    least(v_confidence, 0.75),
    jsonb_build_array(jsonb_build_object('kind','meaning_resolver','source',v_source,'model',p_semantics->>'model')),
    'May guide inspection but must not override verified Project World state.',
    jsonb_build_object('authoritative', false)
  );

  if jsonb_typeof(p_semantics->'inferred_claims') = 'array' then
    for v_claim in select value from jsonb_array_elements(p_semantics->'inferred_claims')
    loop
      if nullif(btrim(v_claim->>'claim_key'), '') is not null
         and nullif(btrim(v_claim->>'statement'), '') is not null then
        insert into public.perception_epistemic_ledger (
          user_id, project_id, objective_id, claim_key, statement, state, confidence,
          provenance, route_impact, metadata
        ) values (
          p_user_id, v_project_id, v_objective_id,
          left(btrim(v_claim->>'claim_key'), 160),
          left(btrim(v_claim->>'statement'), 2000),
          'inferred',
          greatest(0, least(1, coalesce((v_claim->>'confidence')::double precision, 0.5))),
          jsonb_build_array(jsonb_build_object('kind','meaning_resolver','source',v_source,'model',p_semantics->>'model')),
          left(coalesce(v_claim->>'route_impact', ''), 1000),
          '{}'::jsonb
        );
      end if;
    end loop;
  end if;

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values (
    p_user_id,
    v_project_id,
    'meaning.resolved',
    jsonb_build_object(
      'objective_id', v_objective_id,
      'source', v_source,
      'model', p_semantics->>'model',
      'confidence', v_confidence,
      'known_unknown_count', coalesce(jsonb_array_length(p_semantics->'known_unknowns'), 0),
      'inferred_claim_count', coalesce(jsonb_array_length(p_semantics->'inferred_claims'), 0)
    )
  );

  return v_result || jsonb_build_object(
    'meaning_source', v_source,
    'meaning_confidence', v_confidence
  );
end;
$$;

revoke all on function public.perception_permission_rank(text) from public, anon, authenticated;
grant execute on function public.perception_permission_rank(text) to service_role;

revoke all on function public.perception_submit_resolved_objective_internal(uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.perception_submit_resolved_objective_internal(uuid,text,jsonb)
  to service_role;
