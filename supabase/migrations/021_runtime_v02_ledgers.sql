-- Perception Runtime Architecture v0.2 ledgers
-- Additive only. Project World remains authoritative; ledgers make claim/effect provenance explicit.

create table if not exists public.perception_epistemic_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  objective_id uuid references public.perception_objectives(id) on delete set null,
  claim_key text not null check (char_length(btrim(claim_key)) > 0),
  statement text not null check (char_length(btrim(statement)) > 0),
  state text not null check (state in ('observed','inferred','confirmed','unknown','rejected','stale','contradicted')),
  confidence double precision not null check (confidence between 0 and 1),
  provenance jsonb not null default '[]'::jsonb,
  temporal_valid_from timestamptz not null default now(),
  temporal_valid_until timestamptz,
  supersedes_entry_id uuid references public.perception_epistemic_ledger(id) on delete set null,
  contradiction_refs jsonb not null default '[]'::jsonb,
  route_impact text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (temporal_valid_until is null or temporal_valid_until > temporal_valid_from)
);

create table if not exists public.perception_execution_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  objective_id uuid references public.perception_objectives(id) on delete set null,
  route_id uuid references public.perception_routes(id) on delete set null,
  route_node_id uuid references public.perception_route_nodes(id) on delete set null,
  worker_run_id uuid references public.perception_worker_runs(id) on delete set null,
  action_key text not null check (char_length(btrim(action_key)) > 0),
  phase text not null check (phase in ('intended','authorized','attempted','observed','verified','blocked','failed','rolled_back')),
  permission_level text not null check (permission_level in ('P0','P1','P2','P3')),
  capability text,
  target text,
  details jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists perception_epistemic_ledger_project_claim_idx
  on public.perception_epistemic_ledger(project_id, claim_key, created_at desc);
create index if not exists perception_epistemic_ledger_user_idx
  on public.perception_epistemic_ledger(user_id, created_at desc);
create index if not exists perception_execution_ledger_project_action_idx
  on public.perception_execution_ledger(project_id, action_key, created_at);
create index if not exists perception_execution_ledger_user_idx
  on public.perception_execution_ledger(user_id, created_at desc);
create index if not exists perception_execution_ledger_worker_idx
  on public.perception_execution_ledger(worker_run_id, created_at)
  where worker_run_id is not null;

alter table public.perception_epistemic_ledger enable row level security;
alter table public.perception_execution_ledger enable row level security;

drop policy if exists "users read own epistemic ledger" on public.perception_epistemic_ledger;
drop policy if exists "users read own execution ledger" on public.perception_execution_ledger;

create policy "users read own epistemic ledger"
  on public.perception_epistemic_ledger for select
  using ((select auth.uid()) = user_id);

create policy "users read own execution ledger"
  on public.perception_execution_ledger for select
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.perception_epistemic_ledger from anon, authenticated;
revoke insert, update, delete on public.perception_execution_ledger from anon, authenticated;
grant select on public.perception_epistemic_ledger to authenticated;
grant select on public.perception_execution_ledger to authenticated;

create or replace function public.perception_record_epistemic_entry_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_claim_key text,
  p_statement text,
  p_state text,
  p_confidence double precision,
  p_provenance jsonb default '[]'::jsonb,
  p_objective_id uuid default null,
  p_temporal_valid_from timestamptz default now(),
  p_temporal_valid_until timestamptz default null,
  p_supersedes_entry_id uuid default null,
  p_contradiction_refs jsonb default '[]'::jsonb,
  p_route_impact text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
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
  if p_state not in ('observed','inferred','confirmed','unknown','rejected','stale','contradicted') then
    raise exception 'Invalid epistemic state' using errcode = '22023';
  end if;
  if coalesce(p_confidence, -1) < 0 or p_confidence > 1 then
    raise exception 'Confidence must be between 0 and 1' using errcode = '22023';
  end if;

  insert into public.perception_epistemic_ledger (
    user_id, project_id, objective_id, claim_key, statement, state, confidence,
    provenance, temporal_valid_from, temporal_valid_until, supersedes_entry_id,
    contradiction_refs, route_impact, metadata
  ) values (
    p_user_id, p_project_id, p_objective_id, btrim(p_claim_key), btrim(p_statement),
    p_state, p_confidence, coalesce(p_provenance, '[]'::jsonb),
    coalesce(p_temporal_valid_from, now()), p_temporal_valid_until, p_supersedes_entry_id,
    coalesce(p_contradiction_refs, '[]'::jsonb), coalesce(p_route_impact, ''),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'entry_id', v_id);
end;
$$;

create or replace function public.perception_record_execution_entry_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_action_key text,
  p_phase text,
  p_permission_level text,
  p_objective_id uuid default null,
  p_route_id uuid default null,
  p_route_node_id uuid default null,
  p_worker_run_id uuid default null,
  p_capability text default null,
  p_target text default null,
  p_details jsonb default '{}'::jsonb,
  p_evidence jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
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
  if p_phase not in ('intended','authorized','attempted','observed','verified','blocked','failed','rolled_back') then
    raise exception 'Invalid execution phase' using errcode = '22023';
  end if;
  if p_permission_level not in ('P0','P1','P2','P3') then
    raise exception 'Invalid permission level' using errcode = '22023';
  end if;

  insert into public.perception_execution_ledger (
    user_id, project_id, objective_id, route_id, route_node_id, worker_run_id,
    action_key, phase, permission_level, capability, target, details, evidence
  ) values (
    p_user_id, p_project_id, p_objective_id, p_route_id, p_route_node_id, p_worker_run_id,
    btrim(p_action_key), p_phase, p_permission_level, p_capability, p_target,
    coalesce(p_details, '{}'::jsonb), coalesce(p_evidence, '[]'::jsonb)
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'entry_id', v_id);
end;
$$;

create or replace function public.perception_get_project_ledgers(p_project_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.perception_projects
    where id = p_project_id and user_id = v_user
  ) then
    raise exception 'Project World not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'epistemic', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at)
      from public.perception_epistemic_ledger e
      where e.project_id = p_project_id and e.user_id = v_user
    ), '[]'::jsonb),
    'execution', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.perception_execution_ledger x
      where x.project_id = p_project_id and x.user_id = v_user
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.perception_record_epistemic_entry_internal(uuid,uuid,text,text,text,double precision,jsonb,uuid,timestamptz,timestamptz,uuid,jsonb,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.perception_record_execution_entry_internal(uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text,text,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.perception_record_epistemic_entry_internal(uuid,uuid,text,text,text,double precision,jsonb,uuid,timestamptz,timestamptz,uuid,jsonb,text,jsonb)
  to service_role;
grant execute on function public.perception_record_execution_entry_internal(uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text,text,jsonb,jsonb)
  to service_role;

revoke all on function public.perception_get_project_ledgers(uuid) from public, anon;
grant execute on function public.perception_get_project_ledgers(uuid) to authenticated;
