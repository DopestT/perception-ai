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
  v_learning_due boolean := false;
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

  v_activity_at := public.perception_project_activity_at_internal(
    p_user_id,
    p_project_id
  );

  select
    max(last_validated_at),
    min(expires_at)
  into v_last_validated, v_next_expiry
  from public.perception_scenarios
  where user_id = p_user_id
    and project_id = p_project_id
    and status = 'active';

  with eligible_learning as (
    select c.id, c.last_seen_at
    from public.perception_learning_candidates c
    where c.user_id = p_user_id
      and c.project_id = p_project_id
      and c.status = 'accepted'
      and c.materiality_score >= 0.65
      and c.confidence >= 0.50
      and c.last_seen_at >= now() - interval '45 days'
    order by
      c.materiality_score desc,
      c.confidence desc,
      c.urgency desc,
      c.last_seen_at desc,
      c.id
    limit 3
  )
  select exists (
    select 1
    from eligible_learning c
    where not exists (
      select 1
      from public.perception_scenarios s
      where s.user_id = p_user_id
        and s.project_id = p_project_id
        and s.scenario_key = 'learning-impact:' || c.id::text
        and s.status = 'active'
        and s.expires_at > now()
        and s.last_validated_at >= c.last_seen_at
    )
  )
  into v_learning_due;

  return
    v_learning_due
    or v_last_validated is null
    or v_next_expiry is null
    or v_next_expiry <= now() + interval '30 minutes'
    or coalesce(v_activity_at, '-infinity'::timestamptz) > v_last_validated;
end;
$$;

revoke all on function public.perception_project_needs_scenario_refresh_internal(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.perception_project_needs_scenario_refresh_internal(uuid,uuid)
  to service_role;
