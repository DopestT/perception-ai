-- Runtime v0.4 local execution truth bridge.
-- A P0/P1 local worker may advance Project World only after a persisted passing
-- verification and matching verified Execution Ledger entry.

create or replace function public.perception_apply_verified_local_effect_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_objective_id uuid,
  p_route_node_id uuid,
  p_worker_run_id uuid,
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
  v_worker public.perception_worker_runs%rowtype;
  v_verification public.perception_verification_runs%rowtype;
  v_verified public.perception_execution_ledger%rowtype;
  v_reality text;
begin
  if p_user_id is null or p_project_id is null or p_objective_id is null
     or p_route_node_id is null or p_worker_run_id is null or p_artifact_id is null then
    raise exception 'Local verified-effect identifiers are required' using errcode = '22023';
  end if;

  select *
  into v_worker
  from public.perception_worker_runs
  where id = p_worker_run_id
    and user_id = p_user_id
    and project_id = p_project_id
    and route_node_id = p_route_node_id
    and permission_level in ('P0','P1');

  if not found then
    raise exception 'Eligible P0/P1 local worker not found' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.perception_artifacts
    where id = p_artifact_id
      and user_id = p_user_id
      and project_id = p_project_id
      and objective_id = p_objective_id
      and route_node_id = p_route_node_id
  ) then
    raise exception 'Bounded worker artifact not found' using errcode = '42501';
  end if;

  select *
  into v_verification
  from public.perception_verification_runs
  where user_id = p_user_id
    and project_id = p_project_id
    and route_node_id = p_route_node_id
    and worker_run_id = p_worker_run_id
    and passed = true
  order by checked_at desc
  limit 1;

  if not found then
    raise exception 'Passing verification is required before Project World may advance'
      using errcode = '42501';
  end if;

  select *
  into v_verified
  from public.perception_execution_ledger
  where user_id = p_user_id
    and project_id = p_project_id
    and route_node_id = p_route_node_id
    and worker_run_id = p_worker_run_id
    and phase = 'verified'
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'Verified execution-ledger evidence is required before Project World may advance'
      using errcode = '42501';
  end if;

  v_reality := left(
    coalesce(nullif(btrim(p_summary), ''), 'Verified bounded local artifact created.'),
    2000
  );

  update public.perception_worker_runs
  set status = 'succeeded',
      output_artifact_id = p_artifact_id,
      evidence = coalesce(p_evidence, '[]'::jsonb),
      finished_at = now()
  where id = p_worker_run_id;

  update public.perception_route_nodes
  set status = 'completed',
      blocker = null,
      updated_at = now()
  where id = p_route_node_id
    and user_id = p_user_id
    and project_id = p_project_id;

  update public.perception_projects
  set current_reality = v_reality,
      updated_at = now()
  where id = p_project_id
    and user_id = p_user_id;

  update public.perception_objectives
  set current_reality = v_reality,
      status = case when status = 'resolved' then 'running' else status end,
      updated_at = now()
  where id = p_objective_id
    and project_id = p_project_id
    and user_id = p_user_id;

  insert into public.perception_epistemic_ledger (
    user_id, project_id, objective_id, claim_key, statement, state, confidence,
    provenance, route_impact, metadata
  ) values (
    p_user_id,
    p_project_id,
    p_objective_id,
    left('local.verified.' || p_worker_run_id::text, 160),
    v_reality,
    'observed',
    1,
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'verified_local_execution',
        'worker_run_id', p_worker_run_id,
        'artifact_id', p_artifact_id,
        'verification_id', v_verification.id,
        'execution_ledger_id', v_verified.id,
        'evidence', coalesce(p_evidence, v_verification.evidence),
        'observed_at', now()
      )
    ),
    'Authoritative verified bounded local effect; safe input for Reality Mapping.',
    jsonb_build_object('truth_rule','verified_effects_only','capability',v_worker.capability)
  );

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values
    (
      p_user_id,
      p_project_id,
      'route_node.completed',
      jsonb_build_object(
        'objective_id', p_objective_id,
        'route_node_id', p_route_node_id,
        'worker_run_id', p_worker_run_id,
        'artifact_id', p_artifact_id,
        'verification_id', v_verification.id
      )
    ),
    (
      p_user_id,
      p_project_id,
      'project_world.updated',
      jsonb_build_object(
        'objective_id', p_objective_id,
        'route_node_id', p_route_node_id,
        'worker_run_id', p_worker_run_id,
        'artifact_id', p_artifact_id,
        'verification_id', v_verification.id,
        'execution_ledger_id', v_verified.id,
        'truth_rule', 'verified_effects_only',
        'source', 'local_runtime_v0_4'
      )
    );

  return jsonb_build_object(
    'ok', true,
    'project_id', p_project_id,
    'objective_id', p_objective_id,
    'route_node_id', p_route_node_id,
    'worker_run_id', p_worker_run_id,
    'artifact_id', p_artifact_id,
    'verification_id', v_verification.id,
    'execution_ledger_id', v_verified.id,
    'current_reality', v_reality
  );
end;
$$;

revoke all on function public.perception_apply_verified_local_effect_internal(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.perception_apply_verified_local_effect_internal(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb)
  to service_role;
