-- Perception Runtime v0.2 continuation route planning
-- Preserves the verified first-action route as history, then supersedes it with a dynamic route v2.

create or replace function public.perception_submit_planned_objective_internal(
  p_user_id uuid,
  p_statement text,
  p_semantics jsonb,
  p_plan jsonb
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
  v_previous_route_id uuid;
  v_continuation_route_id uuid;
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
  v_continuation_count integer := 0;
begin
  v_result := public.perception_submit_resolved_objective_internal(
    p_user_id,
    p_statement,
    coalesce(p_semantics, '{}'::jsonb)
  );

  if coalesce((v_result->>'ok')::boolean, false) is not true then
    return v_result;
  end if;

  v_project_id := (v_result->>'project_id')::uuid;
  v_objective_id := (v_result->>'objective_id')::uuid;
  v_previous_route_id := (v_result->>'route_id')::uuid;

  if jsonb_typeof(p_plan->'nodes') <> 'array' then
    return v_result || jsonb_build_object('continuation_route_created', false);
  end if;

  select count(*)
  into v_continuation_count
  from jsonb_array_elements(p_plan->'nodes') as item(value)
  where coalesce(value->>'key', '') not in (
    'resolve-meaning',
    'first-reversible-action',
    'verify-first-action'
  );

  if v_continuation_count = 0 then
    insert into public.perception_model_events(user_id, project_id, event_type, payload)
    values (
      p_user_id,
      v_project_id,
      'route.continuation_not_required',
      jsonb_build_object('objective_id', v_objective_id, 'route_id', v_previous_route_id)
    );

    return v_result || jsonb_build_object('continuation_route_created', false);
  end if;

  update public.perception_routes
  set active = false
  where id = v_previous_route_id
    and user_id = p_user_id
    and project_id = v_project_id;

  v_reason := coalesce(
    nullif(btrim(p_plan->>'reason'), ''),
    'Continuation route generated from structured objective meaning after the first verified action.'
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
    v_project_id,
    v_objective_id,
    2,
    v_reason,
    v_previous_route_id,
    true
  )
  returning id into v_continuation_route_id;

  for v_node in
    select value
    from jsonb_array_elements(p_plan->'nodes')
  loop
    v_key := coalesce(v_node->>'key', '');
    if v_key in ('resolve-meaning', 'first-reversible-action', 'verify-first-action') then
      continue;
    end if;

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

    select coalesce(jsonb_agg(dep), '[]'::jsonb)
    into v_dependencies
    from (
      select to_jsonb(value) as dep
      from jsonb_array_elements_text(coalesce(v_node->'dependencies', '[]'::jsonb)) as d(value)
      where value not in ('resolve-meaning', 'first-reversible-action', 'verify-first-action')
    ) filtered;

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
      v_project_id,
      v_continuation_route_id,
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
    v_key := coalesce(v_node->>'key', '');
    if not (v_node_ids ? v_key) then
      continue;
    end if;

    v_node_id := (v_node_ids->>v_key)::uuid;

    for v_dep in
      select value
      from jsonb_array_elements_text(coalesce(v_node->'dependencies', '[]'::jsonb))
      where value not in ('resolve-meaning', 'first-reversible-action', 'verify-first-action')
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
      v_project_id,
      'route.superseded',
      jsonb_build_object(
        'objective_id', v_objective_id,
        'route_id', v_previous_route_id,
        'superseded_by', v_continuation_route_id,
        'reason', 'First bounded action was verified; structured continuation route is now active.'
      )
    ),
    (
      p_user_id,
      v_project_id,
      'route.created',
      jsonb_build_object(
        'objective_id', v_objective_id,
        'route_id', v_continuation_route_id,
        'version', 2,
        'reason', v_reason,
        'source', 'reality_mapper_v0_2',
        'node_count', v_continuation_count,
        'blocked_capabilities', coalesce(p_plan->'blockedCapabilities', '[]'::jsonb)
      )
    );

  return v_result || jsonb_build_object(
    'continuation_route_created', true,
    'continuation_route_id', v_continuation_route_id,
    'continuation_route_version', 2,
    'continuation_node_count', v_continuation_count
  );
end;
$$;

revoke all on function public.perception_submit_planned_objective_internal(uuid,text,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.perception_submit_planned_objective_internal(uuid,text,jsonb,jsonb)
  to service_role;
