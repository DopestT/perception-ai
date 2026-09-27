-- Durable user denial for bounded Operator approvals.
-- Approval execution remains grant-gated; this function only records an explicit user denial
-- against an already-planned action owned by the authenticated user.

create or replace function public.perception_deny_operator_action(
  p_project_id uuid,
  p_action_key text,
  p_reason text default 'user_denied'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_latest public.perception_execution_ledger%rowtype;
  v_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_action_key is null or length(trim(p_action_key)) < 3 then
    raise exception 'Action key is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.perception_projects
    where id = p_project_id
      and user_id = v_user_id
  ) then
    raise exception 'Project not found for user' using errcode = '42501';
  end if;

  select *
  into v_latest
  from public.perception_execution_ledger
  where user_id = v_user_id
    and project_id = p_project_id
    and action_key = p_action_key
  order by created_at desc
  limit 1;

  if v_latest.id is null then
    raise exception 'Planned action not found' using errcode = 'P0002';
  end if;

  if v_latest.phase <> 'intended'
     or v_latest.capability <> 'code'
     or v_latest.permission_level not in ('P2','P3') then
    raise exception 'Action is no longer awaiting approval' using errcode = '55000';
  end if;

  insert into public.perception_execution_ledger (
    user_id,
    project_id,
    objective_id,
    route_id,
    route_node_id,
    worker_run_id,
    action_key,
    phase,
    permission_level,
    capability,
    target,
    details,
    evidence
  ) values (
    v_user_id,
    v_latest.project_id,
    v_latest.objective_id,
    v_latest.route_id,
    v_latest.route_node_id,
    null,
    v_latest.action_key,
    'blocked',
    v_latest.permission_level,
    v_latest.capability,
    v_latest.target,
    jsonb_build_object(
      'decision', 'denied',
      'reason', left(coalesce(nullif(trim(p_reason), ''), 'user_denied'), 500),
      'source', 'approval_ui',
      'denied_at', now()
    ),
    jsonb_build_array(
      jsonb_build_object('kind', 'user_decision', 'decision', 'denied')
    )
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

revoke all on function public.perception_deny_operator_action(uuid, text, text)
  from public, anon;
grant execute on function public.perception_deny_operator_action(uuid, text, text)
  to authenticated;
