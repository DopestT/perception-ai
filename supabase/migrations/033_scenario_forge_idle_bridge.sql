-- Runtime v0.7: idle Scenario Forge bridge.
-- Reuses Continuous Mind's existing 15-minute scheduler and only refreshes
-- compact scenario seeds when Project World changed or warm memory is due.

create or replace function public.perception_project_activity_at_internal(
  p_user_id uuid,
  p_project_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(
    p.updated_at,
    coalesce((
      select max(r.created_at)
      from public.perception_routes r
      where r.user_id = p_user_id
        and r.project_id = p_project_id
    ), '-infinity'::timestamptz),
    coalesce((
      select max(n.updated_at)
      from public.perception_route_nodes n
      where n.user_id = p_user_id
        and n.project_id = p_project_id
    ), '-infinity'::timestamptz),
    coalesce((
      select max(e.created_at)
      from public.perception_execution_ledger e
      where e.user_id = p_user_id
        and e.project_id = p_project_id
    ), '-infinity'::timestamptz),
    coalesce((
      select max(ep.created_at)
      from public.perception_epistemic_ledger ep
      where ep.user_id = p_user_id
        and ep.project_id = p_project_id
    ), '-infinity'::timestamptz),
    coalesce((
      select max(a.updated_at)
      from public.perception_artifacts a
      where a.user_id = p_user_id
        and a.project_id = p_project_id
    ), '-infinity'::timestamptz)
  )
  from public.perception_projects p
  where p.id = p_project_id
    and p.user_id = p_user_id;
$$;

create or replace function public.perception_project_needs_scenario_refresh_internal(
  p_user_id uuid,
  p_project_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_active boolean;
  v_activity_at timestamptz;
  v_last_validated timestamptz;
  v_next_expiry timestamptz;
begin
  select active
  into v_active
  from public.perception_projects
  where id = p_project_id
    and user_id = p_user_id;

  if not found or not coalesce(v_active, false) then
    return false;
  end if;

  if not exists (
    select 1
    from public.perception_objectives o
    join public.perception_routes r
      on r.objective_id = o.id
     and r.project_id = o.project_id
     and r.user_id = o.user_id
    where o.user_id = p_user_id
      and o.project_id = p_project_id
  ) then
    return false;
  end if;

  v_activity_at := public.perception_project_activity_at_internal(p_user_id, p_project_id);

  select
    max(last_validated_at),
    min(expires_at)
  into v_last_validated, v_next_expiry
  from public.perception_scenarios
  where user_id = p_user_id
    and project_id = p_project_id
    and status = 'active';

  return
    v_last_validated is null
    or v_next_expiry is null
    or v_next_expiry <= now() + interval '30 minutes'
    or coalesce(v_activity_at, '-infinity'::timestamptz) > v_last_validated;
end;
$$;

create or replace function public.perception_refresh_idle_scenarios_internal(
  p_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 20));
  v_project record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_refreshed integer := 0;
  v_skipped_recent integer := 0;
begin
  for v_project in
    select
      p.user_id,
      p.id as project_id,
      public.perception_project_activity_at_internal(p.user_id, p.id) as activity_at
    from public.perception_projects p
    where p.active is true
      and public.perception_project_needs_scenario_refresh_internal(p.user_id, p.id)
    order by
      coalesce((
        select min(s.expires_at)
        from public.perception_scenarios s
        where s.user_id = p.user_id
          and s.project_id = p.id
          and s.status = 'active'
      ), '-infinity'::timestamptz) asc,
      p.updated_at desc
    limit v_limit
  loop
    -- "Idle" means the Project World has been quiet long enough to avoid
    -- racing an active user request. A changed project will be picked up on
    -- the next scheduler pass.
    if v_project.activity_at is not null
       and v_project.activity_at > now() - interval '5 minutes' then
      v_skipped_recent := v_skipped_recent + 1;
      continue;
    end if;

    begin
      v_result := public.perception_refresh_scenario_forge_internal(
        v_project.user_id,
        v_project.project_id
      );
      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'project_id', v_project.project_id,
          'activity_at', v_project.activity_at,
          'result', v_result
        )
      );
      v_refreshed := v_refreshed + 1;
    exception
      when others then
        v_results := v_results || jsonb_build_array(
          jsonb_build_object(
            'project_id', v_project.project_id,
            'activity_at', v_project.activity_at,
            'error', sqlstate
          )
        );
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'source', 'scenario_forge_idle_v0_7',
    'limit', v_limit,
    'refreshed', v_refreshed,
    'skipped_recent', v_skipped_recent,
    'projects', v_results
  );
end;
$$;

revoke all on function public.perception_project_activity_at_internal(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.perception_project_needs_scenario_refresh_internal(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.perception_refresh_idle_scenarios_internal(integer)
  from public, anon, authenticated;

grant execute on function public.perception_project_activity_at_internal(uuid,uuid)
  to service_role;
grant execute on function public.perception_project_needs_scenario_refresh_internal(uuid,uuid)
  to service_role;
grant execute on function public.perception_refresh_idle_scenarios_internal(integer)
  to service_role;
