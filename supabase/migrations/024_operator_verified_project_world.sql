-- External Operator verified-effect bridge.
-- Only a verified execution-ledger entry may advance authoritative Project World state.

create or replace function public.perception_apply_verified_operator_effect_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_action_key text,
  p_summary text,
  p_evidence jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_verified public.perception_execution_ledger%rowtype;
  v_reality text;
begin
  if p_user_id is null or p_project_id is null then
    raise exception 'User and project are required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.perception_projects
    where id = p_project_id and user_id = p_user_id
  ) then
    raise exception 'Project not found for user' using errcode = 'P0002';
  end if;

  select *
  into v_verified
  from public.perception_execution_ledger
  where user_id = p_user_id
    and project_id = p_project_id
    and action_key = p_action_key
    and phase = 'verified'
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'Verified execution evidence is required before Project World may advance'
      using errcode = '42501';
  end if;

  v_reality := left(
    coalesce(nullif(btrim(p_summary), ''), 'Verified external operator effect observed.'),
    2000
  );

  update public.perception_projects
  set current_reality = v_reality,
      updated_at = now()
  where id = p_project_id and user_id = p_user_id;

  insert into public.perception_epistemic_ledger (
    user_id, project_id, objective_id, claim_key, statement, state, confidence,
    provenance, route_impact, metadata
  ) values (
    p_user_id,
    p_project_id,
    v_verified.objective_id,
    left('operator.verified.' || p_action_key, 160),
    v_reality,
    'observed',
    1,
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'verified_execution',
        'execution_ledger_id', v_verified.id,
        'action_key', p_action_key,
        'evidence', coalesce(p_evidence, v_verified.evidence),
        'observed_at', now()
      )
    ),
    'Authoritative verified external effect; safe to use for subsequent routing.',
    jsonb_build_object('truth_rule', 'verified_effects_only')
  );

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values (
    p_user_id,
    p_project_id,
    'project_world.updated',
    jsonb_build_object(
      'action_key', p_action_key,
      'execution_ledger_id', v_verified.id,
      'truth_rule', 'verified_effects_only',
      'source', 'external_operator'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'project_id', p_project_id,
    'action_key', p_action_key,
    'current_reality', v_reality,
    'execution_ledger_id', v_verified.id
  );
end;
$$;

revoke all on function public.perception_apply_verified_operator_effect_internal(uuid,uuid,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.perception_apply_verified_operator_effect_internal(uuid,uuid,text,text,jsonb)
  to service_role;
