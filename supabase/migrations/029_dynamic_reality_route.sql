-- Perception Runtime v0.3: apply a dynamic continuation route after Project World exists.
-- This keeps the verified v1 first-action route as history, then derives the next route from
-- observed Project World + ledgers rather than pre-Project heuristics.

create or replace function public.perception_apply_dynamic_route_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_objective_id uuid,
  p_previous_route_id uuid,
  p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_route_id uuid;
  v_version integer;
  v_reason text;
  v_node jsonb;
  v_dep text;
  v_node_id uuid;
  v_dep_id uuid;
  v_node_ids jsonb := '{}'::jsonb;
  v_key text;
  v_capability text;
  v_permission text;
  v_risk text;
  v_status text;
  v_blocker text;
  v_dependencies jsonb;
  v_completion_tests jsonb;
  v_sort integer := 0;
  v_node_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'User id is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.perception_projects
    where id = p_project_id
      and user_id = p_user_id
  ) then
    raise exception 'Project World not found for user' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.perception_objectives
    where id = p_objective_id
      and project_id = p_project_id
      and user_id = p_user_id
  ) then
    raise exception 'Objective not found for Project World' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.perception_routes
    where id = p_previous_route_id
      and objective_id = p_objective_id
      and project_id = p_project_id
      and user_id = p_user_id
  ) then
    raise exception 'Previous route not found for objective' using errcode = '42501';
  end if;

  if jsonb_typeof(p_plan->'nodes') <> 'array' then
    raise exception 'Dynamic route plan must contain nodes' using errcode = '22023';
  end if;

  v_node_count := jsonb_array_length(p_plan->'nodes');

  if v_node_count = 0 then
    insert into public.perception_model_events(user_id, project_id, event_type, payload)
    values (
      p_user_id,
      p_project_id,
      'route.continuation_not_required',
      jsonb_build_object(
        'objective_id', p_objective_id,
        'route_id', p_previous_route_id,
        'source', 'reality_mapper_v0_3'
      )
    );

    return jsonb_build_object(
      'continuation_route_created', false,
      'continuation_route_id', null,
      'continuation_node_count', 0
    );
  end if;

  select coalesce(max(version), 0) + 1
  into v_version
  from public.perception_routes
  where objective_id = p_objective_id
    and user_id = p_user_id;

  update public.perception_routes
  set active = false
  where objective_id = p_objective_id
    and user_id = p_user_id
    and active = true;

  v_reason := coalesce(
    nullif(btrim(p_plan->>'reason'), ''),
    'Dynamic continuation route derived from verified Project World state.'
  );

  insert into public.perception_routes(
    user_id,
    project_id,
    objective_id,
    version,
    reason,
    supersedes_route_id,
    active
  ) values (
    p_user_id,
    p_project_id,
    p_objective_id,
    v_version,
    v_reason,
    p_previous_route_id,
    true
  )
  returning id into v_route_id;

  for v_node in
    select value
    from jsonb_array_elements(p_plan->'nodes')
  loop
    v_key := left(coalesce(nullif(btrim(v_node->>'key'), ''), 'node-' || (v_sort + 1)::text), 160);

    v_capability := case
      when v_node->>'capability' in (
        'reason','research','retrieve','generate','edit','code',
        'communicate','schedule','calculate','verify'
      ) then v_node->>'capability'
      else 'reason'
    end;

    v_permission := case
      when v_node->>'permissionLevel' in ('P0','P1','P2','P3') then v_node->>'permissionLevel'
      else 'P0'
    end;

    v_risk := case
      when v_node->>'risk' in ('low','medium','high') then v_node->>'risk'
      else 'low'
    end;

    v_blocker := nullif(btrim(coalesce(v_node->>'blocker', '')), '');

    select coalesce(jsonb_agg(to_jsonb(value)), '[]'::jsonb)
    into v_dependencies
    from jsonb_array_elements_text(coalesce(v_node->'dependencies', '[]'::jsonb)) as d(value);

    v_status := case
      when v_blocker is not null then 'blocked'
      when jsonb_array_length(v_dependencies) = 0 and v_permission in ('P2','P3') then 'awaiting_approval'
      when jsonb_array_length(v_dependencies) = 0 then 'ready'
      else 'pending'
    end;

    v_completion_tests := case
      when jsonb_typeof(v_node->'completionTests') = 'array'
        then v_node->'completionTests'
      else '[]'::jsonb
    end;

    v_sort := v_sort + 1;

    insert into public.perception_route_nodes(
      user_id,
      project_id,
      route_id,
      label,
      outcome,
      status,
      capability,
      permission_level,
      confidence,
      risk,
      completion_tests,
      blocker,
      sort_order
    ) values (
      p_user_id,
      p_project_id,
      v_route_id,
      left(coalesce(nullif(btrim(v_node->>'label'), ''), v_key), 500),
      left(coalesce(nullif(btrim(v_node->>'outcome'), ''), 'Complete planned route node.'), 4000),
      v_status,
      v_capability,
      v_permission,
      greatest(0, least(1, coalesce((v_node->>'confidence')::double precision, 0.5))),
      v_risk,
      v_completion_tests,
      v_blocker,
      v_sort
    )
    returning id into v_node_id;

    v_node_ids := v_node_ids || jsonb_build_object(v_key, v_node_id::text);
  end loop;

  for v_node in
    select value
    from jsonb_array_elements(p_plan->'nodes')
  loop
    v_key := left(coalesce(nullif(btrim(v_node->>'key'), ''), ''), 160);
    if not (v_node_ids ? v_key) then
      continue;
    end if;

    v_node_id := (v_node_ids->>v_key)::uuid;

    for v_dep in
      select value
      from jsonb_array_elements_text(coalesce(v_node->'dependencies', '[]'::jsonb))
    loop
      if v_node_ids ? v_dep then
        v_dep_id := (v_node_ids->>v_dep)::uuid;
        insert into public.perception_route_dependencies(route_node_id, depends_on_node_id)
        values (v_node_id, v_dep_id)
        on conflict do nothing;
      end if;
    end loop;
  end loop;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values
    (
      p_user_id,
      p_project_id,
      'route.superseded',
      jsonb_build_object(
        'objective_id', p_objective_id,
        'route_id', p_previous_route_id,
        'superseded_by', v_route_id,
        'reason', 'Verified first action completed; Project World was remapped.'
      )
    ),
    (
      p_user_id,
      p_project_id,
      'reality.mapped',
      jsonb_build_object(
        'objective_id', p_objective_id,
        'route_id', v_route_id,
        'source', 'reality_mapper_v0_3',
        'gap_count', coalesce(jsonb_array_length(p_plan->'gaps'), 0),
        'world_blocker_count', coalesce(jsonb_array_length(p_plan->'worldBlockers'), 0)
      )
    ),
    (
      p_user_id,
      p_project_id,
      'route.created',
      jsonb_build_object(
        'objective_id', p_objective_id,
        'route_id', v_route_id,
        'version', v_version,
        'reason', v_reason,
        'source', 'dynamic_route_planner_v0_3',
        'node_count', v_node_count,
        'blocked_capabilities', coalesce(p_plan->'blockedCapabilities', '[]'::jsonb)
      )
    );

  return jsonb_build_object(
    'continuation_route_created', true,
    'continuation_route_id', v_route_id,
    'continuation_route_version', v_version,
    'continuation_node_count', v_node_count
  );
end;
$$;

revoke all on function public.perception_apply_dynamic_route_internal(uuid,uuid,uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.perception_apply_dynamic_route_internal(uuid,uuid,uuid,uuid,jsonb)
  to service_role;
