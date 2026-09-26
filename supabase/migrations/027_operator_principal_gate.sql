-- Secure Operator principal + proof-grant flow.
-- Authenticated clients cannot write permission_grants directly.
-- Only explicitly enrolled Operator principals can request the narrow P2 proof grant.

revoke insert, update
on table public.perception_permission_grants
from authenticated;

create table if not exists public.perception_operator_principals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability in ('code')),
  target text not null,
  max_permission_level text not null default 'P2'
    check (max_permission_level in ('P2','P3')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, capability, target)
);

alter table public.perception_operator_principals enable row level security;
revoke all on table public.perception_operator_principals from public, anon, authenticated;

create or replace function public.perception_request_operator_proof_grant(
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_grant_id uuid;
  v_target text := 'github://DopestT/perception-ai@main';
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
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
$$;

revoke all on function public.perception_request_operator_proof_grant(uuid)
  from public, anon;
grant execute on function public.perception_request_operator_proof_grant(uuid)
  to authenticated;

create or replace function public.perception_revoke_operator_grant(
  p_grant_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
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
$$;

revoke all on function public.perception_revoke_operator_grant(uuid)
  from public, anon;
grant execute on function public.perception_revoke_operator_grant(uuid)
  to authenticated;
