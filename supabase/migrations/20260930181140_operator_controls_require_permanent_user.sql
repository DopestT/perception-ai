create or replace function public.perception_request_operator_proof_grant(p_project_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_grant_id uuid;
  v_target text := 'github://DopestT/perception-ai@main';
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Permanent account required for Operator authority' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.perception_projects
    where id = p_project_id
      and user_id = v_user_id
  ) then
    raise exception 'Project not found for user' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.perception_operator_principals
    where user_id = v_user_id
      and capability = 'code'
      and target = v_target
      and enabled = true
      and max_permission_level in ('P2','P3')
  ) then
    raise exception 'Operator access is not enabled for this account' using errcode = '42501';
  end if;

  insert into public.perception_permission_grants (
    user_id,
    project_id,
    permission_level,
    capability,
    target,
    scope_note,
    expires_at
  ) values (
    v_user_id,
    p_project_id,
    'P2',
    'code',
    v_target,
    'One-time Perception self-test: bounded branch write only.',
    now() + interval '15 minutes'
  )
  returning id into v_grant_id;

  return v_grant_id;
end;
$function$;

create or replace function public.perception_revoke_operator_grant(p_grant_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Permanent account required for Operator authority' using errcode = '42501';
  end if;

  update public.perception_permission_grants
  set revoked_at = coalesce(revoked_at, now())
  where id = p_grant_id
    and user_id = v_user_id
    and permission_level = 'P2'
    and capability = 'code'
    and target = 'github://DopestT/perception-ai@main';

  return found;
end;
$function$;

create or replace function public.perception_deny_operator_action(
  p_project_id uuid,
  p_action_key text,
  p_reason text default 'user_denied'::text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_latest public.perception_execution_ledger%rowtype;
  v_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Permanent account required for Operator authority' using errcode = '42501';
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
$function$;

revoke all on function public.perception_request_operator_proof_grant(uuid)
  from public, anon;
revoke all on function public.perception_revoke_operator_grant(uuid)
  from public, anon;
revoke all on function public.perception_deny_operator_action(uuid,text,text)
  from public, anon;

grant execute on function public.perception_request_operator_proof_grant(uuid)
  to authenticated, service_role;
grant execute on function public.perception_revoke_operator_grant(uuid)
  to authenticated, service_role;
grant execute on function public.perception_deny_operator_action(uuid,text,text)
  to authenticated, service_role;
