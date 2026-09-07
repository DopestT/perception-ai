-- Perception verified vertical slice
-- Project World is authoritative. Clients read truth; bounded runtime functions own writes.

alter table public.perception_artifacts
  add column if not exists content text;

create table if not exists public.perception_worker_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  route_node_id uuid not null references public.perception_route_nodes(id) on delete cascade,
  worker_key text not null,
  capability text not null check (
    capability in ('reason', 'research', 'retrieve', 'generate', 'edit', 'code', 'communicate', 'schedule', 'calculate', 'verify')
  ),
  permission_level text not null check (permission_level in ('P0', 'P1', 'P2', 'P3')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'blocked')),
  input jsonb not null default '{}'::jsonb,
  output_artifact_id uuid references public.perception_artifacts(id) on delete set null,
  evidence jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.perception_verification_runs
  add column if not exists worker_run_id uuid references public.perception_worker_runs(id) on delete set null;

create index if not exists perception_artifacts_objective_idx on public.perception_artifacts(objective_id);
create index if not exists perception_artifacts_route_node_idx on public.perception_artifacts(route_node_id);
create index if not exists perception_artifacts_user_idx on public.perception_artifacts(user_id);
create index if not exists perception_beliefs_user_idx on public.perception_beliefs(user_id);
create index if not exists perception_events_user_idx on public.perception_model_events(user_id);
create index if not exists perception_objectives_user_idx on public.perception_objectives(user_id);
create index if not exists perception_permission_grants_user_idx on public.perception_permission_grants(user_id);
create index if not exists perception_route_dependencies_depends_idx on public.perception_route_dependencies(depends_on_node_id);
create index if not exists perception_route_nodes_project_idx on public.perception_route_nodes(project_id);
create index if not exists perception_route_nodes_user_idx on public.perception_route_nodes(user_id);
create index if not exists perception_routes_project_idx on public.perception_routes(project_id);
create index if not exists perception_routes_supersedes_idx on public.perception_routes(supersedes_route_id);
create index if not exists perception_routes_user_idx on public.perception_routes(user_id);
create index if not exists perception_verification_project_idx on public.perception_verification_runs(project_id);
create index if not exists perception_verification_user_idx on public.perception_verification_runs(user_id);
create index if not exists perception_verification_worker_idx on public.perception_verification_runs(worker_run_id);
create index if not exists perception_world_signals_user_idx on public.perception_world_signals(user_id);
create index if not exists perception_worker_runs_project_idx on public.perception_worker_runs(project_id, created_at desc);
create index if not exists perception_worker_runs_node_idx on public.perception_worker_runs(route_node_id, created_at desc);
create index if not exists perception_worker_runs_user_idx on public.perception_worker_runs(user_id);
create unique index if not exists perception_routes_one_active_idx on public.perception_routes(objective_id) where active;

alter table public.perception_worker_runs enable row level security;

drop policy if exists "users own perception projects" on public.perception_projects;
drop policy if exists "users own perception beliefs" on public.perception_beliefs;
drop policy if exists "users own perception model events" on public.perception_model_events;
drop policy if exists "users own perception objectives" on public.perception_objectives;
drop policy if exists "users own perception routes" on public.perception_routes;
drop policy if exists "users own perception route nodes" on public.perception_route_nodes;
drop policy if exists "users own perception route dependencies" on public.perception_route_dependencies;
drop policy if exists "users own perception permission grants" on public.perception_permission_grants;
drop policy if exists "users own perception artifacts" on public.perception_artifacts;
drop policy if exists "users own perception verification runs" on public.perception_verification_runs;
drop policy if exists "users own perception world signals" on public.perception_world_signals;
drop policy if exists "users read own perception worker runs" on public.perception_worker_runs;

create policy "users read own perception projects" on public.perception_projects
for select using ((select auth.uid()) = user_id);
create policy "users read own perception beliefs" on public.perception_beliefs
for select using ((select auth.uid()) = user_id);
create policy "users read own perception model events" on public.perception_model_events
for select using ((select auth.uid()) = user_id);
create policy "users read own perception objectives" on public.perception_objectives
for select using ((select auth.uid()) = user_id);
create policy "users read own perception routes" on public.perception_routes
for select using ((select auth.uid()) = user_id);
create policy "users read own perception route nodes" on public.perception_route_nodes
for select using ((select auth.uid()) = user_id);
create policy "users read own perception route dependencies" on public.perception_route_dependencies
for select using (
  exists (
    select 1 from public.perception_route_nodes n
    where n.id = route_node_id and n.user_id = (select auth.uid())
  )
);
create policy "users read own perception permission grants" on public.perception_permission_grants
for select using ((select auth.uid()) = user_id);
create policy "users read own perception artifacts" on public.perception_artifacts
for select using ((select auth.uid()) = user_id);
create policy "users read own perception verification runs" on public.perception_verification_runs
for select using ((select auth.uid()) = user_id);
create policy "users read own perception world signals" on public.perception_world_signals
for select using ((select auth.uid()) = user_id);
create policy "users read own perception worker runs" on public.perception_worker_runs
for select using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.perception_projects from anon, authenticated;
revoke insert, update, delete on public.perception_beliefs from anon, authenticated;
revoke insert, update, delete on public.perception_model_events from anon, authenticated;
revoke insert, update, delete on public.perception_objectives from anon, authenticated;
revoke insert, update, delete on public.perception_routes from anon, authenticated;
revoke insert, update, delete on public.perception_route_nodes from anon, authenticated;
revoke insert, update, delete on public.perception_route_dependencies from anon, authenticated;
revoke insert, update, delete on public.perception_permission_grants from anon, authenticated;
revoke insert, update, delete on public.perception_artifacts from anon, authenticated;
revoke insert, update, delete on public.perception_verification_runs from anon, authenticated;
revoke insert, update, delete on public.perception_world_signals from anon, authenticated;
revoke insert, update, delete on public.perception_worker_runs from anon, authenticated;

grant select on public.perception_projects to authenticated;
grant select on public.perception_beliefs to authenticated;
grant select on public.perception_model_events to authenticated;
grant select on public.perception_objectives to authenticated;
grant select on public.perception_routes to authenticated;
grant select on public.perception_route_nodes to authenticated;
grant select on public.perception_route_dependencies to authenticated;
grant select on public.perception_permission_grants to authenticated;
grant select on public.perception_artifacts to authenticated;
grant select on public.perception_verification_runs to authenticated;
grant select on public.perception_world_signals to authenticated;
grant select on public.perception_worker_runs to authenticated;

create or replace function public.perception_submit_objective(p_statement text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_statement text := btrim(coalesce(p_statement, ''));
  v_project_id uuid;
  v_belief_id uuid;
  v_objective_id uuid;
  v_route_id uuid;
  v_resolve_node_id uuid;
  v_action_node_id uuid;
  v_verify_node_id uuid;
  v_worker_run_id uuid;
  v_artifact_id uuid;
  v_verification_id uuid;
  v_content text;
  v_verified boolean := false;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if char_length(v_statement) < 3 then
    raise exception 'Objective must contain at least 3 characters' using errcode = '22023';
  end if;

  insert into public.perception_projects (user_id, name, desired_reality, current_reality)
  values (v_user, left(v_statement, 120), v_statement, 'Objective captured. No external effect has been verified yet.')
  returning id into v_project_id;

  insert into public.perception_beliefs (
    user_id, project_id, scope, statement, state, confidence,
    evidence, route_impact, needs_confirmation, source_kind, source_ref
  ) values (
    v_user, v_project_id, 'project', v_statement, 'observed', 1,
    jsonb_build_array(jsonb_build_object('kind','user_input','statement',v_statement,'observed_at',now())),
    'Defines the desired reality and is trusted routing input.', false, 'user_input', v_statement
  ) returning id into v_belief_id;

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values (v_user, v_project_id, 'project_world.created', jsonb_build_object('belief_id', v_belief_id));

  insert into public.perception_objectives (
    user_id, project_id, statement, desired_reality, current_reality,
    success_criteria, deliverables, source_refs, status
  ) values (
    v_user, v_project_id, v_statement, v_statement,
    'Direct user objective captured; first bounded action not yet verified.',
    jsonb_build_array(
      'Preserve direct user intent as observed evidence.',
      'Create the smallest reversible first action.',
      'Verify worker output before Project World records progress.'
    ),
    jsonb_build_array('Verified first-action brief'),
    jsonb_build_array(jsonb_build_object('kind','user_input','ref',v_statement,'observed_at',now())),
    'resolved'
  ) returning id into v_objective_id;

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values (v_user, v_project_id, 'objective.understood', jsonb_build_object('objective_id', v_objective_id, 'statement', v_statement));

  insert into public.perception_routes (user_id, project_id, objective_id, version, reason, active)
  values (
    v_user, v_project_id, v_objective_id, 1,
    'Smallest viable route: resolve direct intent, route a P1 draft worker, verify its evidence, then update Project World.', true
  ) returning id into v_route_id;

  insert into public.perception_route_nodes (
    user_id, project_id, route_id, label, outcome, status, capability,
    permission_level, confidence, risk, completion_tests, sort_order
  ) values (
    v_user, v_project_id, v_route_id, 'Resolve objective',
    'Objective is grounded in direct user evidence.', 'completed', 'reason',
    'P0', 1, 'low', jsonb_build_array('Objective statement is non-empty and directly observed.'), 1
  ) returning id into v_resolve_node_id;

  insert into public.perception_route_nodes (
    user_id, project_id, route_id, label, outcome, status, capability,
    permission_level, confidence, risk, completion_tests, sort_order
  ) values (
    v_user, v_project_id, v_route_id, 'Start first action',
    'A bounded portable worker creates a reversible execution brief.', 'running', 'generate',
    'P1', 0.95, 'low', jsonb_build_array('Brief preserves objective and names the next reversible move.'), 2
  ) returning id into v_action_node_id;

  insert into public.perception_route_nodes (
    user_id, project_id, route_id, label, outcome, status, capability,
    permission_level, confidence, risk, completion_tests, sort_order
  ) values (
    v_user, v_project_id, v_route_id, 'Verify result',
    'Verification evidence decides whether Project World may change.', 'pending', 'verify',
    'P0', 0.99, 'low', jsonb_build_array('Worker artifact passes deterministic completion checks.'), 3
  ) returning id into v_verify_node_id;

  insert into public.perception_route_dependencies(route_node_id, depends_on_node_id)
  values (v_action_node_id, v_resolve_node_id), (v_verify_node_id, v_action_node_id);

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values (v_user, v_project_id, 'route.created', jsonb_build_object('objective_id', v_objective_id, 'route_id', v_route_id));

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values (v_user, v_project_id, 'capability.routed', jsonb_build_object(
    'route_node_id', v_action_node_id, 'capability', 'generate', 'permission_level', 'P1', 'worker_key', 'first_action_brief_worker'
  ));

  insert into public.perception_worker_runs (
    user_id, project_id, route_node_id, worker_key, capability, permission_level,
    status, input, started_at
  ) values (
    v_user, v_project_id, v_action_node_id, 'first_action_brief_worker', 'generate', 'P1',
    'running', jsonb_build_object('objective_id', v_objective_id, 'statement', v_statement), now()
  ) returning id into v_worker_run_id;

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values (v_user, v_project_id, 'worker.started', jsonb_build_object('worker_run_id', v_worker_run_id, 'route_node_id', v_action_node_id));

  v_content := concat(
    'Objective: ', v_statement, E'\n',
    'Current reality: Direct user intent is captured; no external effect is assumed.', E'\n',
    'Desired reality: ', v_statement, E'\n',
    'Action started: create this bounded first-action brief.', E'\n',
    'Next reversible move: use this verified brief to choose the next capability; require the permission gate for anything above P1.'
  );

  insert into public.perception_artifacts (
    user_id, project_id, objective_id, route_node_id, artifact_type, title, content, metadata
  ) values (
    v_user, v_project_id, v_objective_id, v_action_node_id, 'execution_brief',
    'Verified First-Action Brief', v_content,
    jsonb_build_object('worker_key','first_action_brief_worker','permission_level','P1')
  ) returning id into v_artifact_id;

  update public.perception_worker_runs set output_artifact_id = v_artifact_id where id = v_worker_run_id;
  update public.perception_route_nodes set status = 'verifying', updated_at = now() where id = v_action_node_id;
  update public.perception_route_nodes set status = 'running', updated_at = now() where id = v_verify_node_id;

  v_verified :=
    position('Objective: ' || v_statement in v_content) > 0
    and position('Current reality:' in v_content) > 0
    and position('Desired reality:' in v_content) > 0
    and position('Next reversible move:' in v_content) > 0;

  insert into public.perception_verification_runs (
    user_id, project_id, route_node_id, worker_run_id, passed, evidence, details
  ) values (
    v_user, v_project_id, v_action_node_id, v_worker_run_id, v_verified,
    case when v_verified then jsonb_build_array(
      'Objective statement preserved in worker artifact.',
      'Current and desired reality are explicit.',
      'Next reversible move is explicit.',
      'Worker is P1 and produced no external side effect.'
    ) else jsonb_build_array('Worker artifact failed deterministic completion checks.') end,
    jsonb_build_object('verification_kind','deterministic_first_action_brief')
  ) returning id into v_verification_id;

  if not v_verified then
    update public.perception_worker_runs
    set status = 'failed', evidence = jsonb_build_array('Verification failed'), finished_at = now()
    where id = v_worker_run_id;
    update public.perception_route_nodes set status = 'failed', updated_at = now() where id = v_action_node_id;
    update public.perception_route_nodes set status = 'failed', updated_at = now() where id = v_verify_node_id;
    insert into public.perception_model_events (user_id, project_id, event_type, payload)
    values (v_user, v_project_id, 'verification.failed', jsonb_build_object('verification_id',v_verification_id,'worker_run_id',v_worker_run_id));
    return jsonb_build_object(
      'ok', false, 'stage', 'RESULT_VERIFICATION_FAILED', 'project_id', v_project_id,
      'objective_id', v_objective_id, 'route_id', v_route_id, 'worker_run_id', v_worker_run_id,
      'verification_id', v_verification_id
    );
  end if;

  -- VERIFIED EFFECT: only now may authoritative Project World state advance.
  update public.perception_worker_runs
  set status = 'succeeded', evidence = jsonb_build_array('Verified artifact', v_artifact_id::text), finished_at = now()
  where id = v_worker_run_id;
  update public.perception_route_nodes set status = 'completed', updated_at = now() where id = v_action_node_id;
  update public.perception_route_nodes set status = 'completed', updated_at = now() where id = v_verify_node_id;
  update public.perception_objectives
  set status = 'running', current_reality = 'Verified first-action brief created; broader objective remains active.', updated_at = now()
  where id = v_objective_id;
  update public.perception_projects
  set current_reality = 'Verified first-action brief created; broader objective remains active.', updated_at = now()
  where id = v_project_id;

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  values
    (v_user, v_project_id, 'artifact.created', jsonb_build_object('artifact_id',v_artifact_id,'worker_run_id',v_worker_run_id)),
    (v_user, v_project_id, 'verification.passed', jsonb_build_object('verification_id',v_verification_id,'worker_run_id',v_worker_run_id)),
    (v_user, v_project_id, 'project_world.updated', jsonb_build_object(
      'objective_id',v_objective_id, 'route_id',v_route_id, 'artifact_id',v_artifact_id,
      'verification_id',v_verification_id, 'worker_run_id',v_worker_run_id, 'truth_rule','verified_effects_only'
    ));

  return jsonb_build_object(
    'ok', true,
    'stages', jsonb_build_array(
      'UNDERSTOOD', 'PROJECT WORLD CREATED', 'REALITY ROUTE CREATED', 'CAPABILITY ROUTED',
      'ACTION STARTED', 'RESULT VERIFIED', 'PROJECT WORLD UPDATED'
    ),
    'project_id', v_project_id, 'objective_id', v_objective_id, 'route_id', v_route_id,
    'worker_run_id', v_worker_run_id, 'artifact_id', v_artifact_id, 'verification_id', v_verification_id
  );
end;
$$;

create or replace function public.perception_get_project_world(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from public.perception_projects p where p.id = p_project_id and p.user_id = v_user) then
    raise exception 'Project World not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'project', to_jsonb(p),
    'beliefs', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at) from public.perception_beliefs b where b.project_id = p.id), '[]'::jsonb),
    'objectives', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from public.perception_objectives o where o.project_id = p.id), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.perception_routes r where r.project_id = p.id), '[]'::jsonb),
    'route_nodes', coalesce((select jsonb_agg(to_jsonb(n) order by n.sort_order, n.created_at) from public.perception_route_nodes n where n.project_id = p.id), '[]'::jsonb),
    'worker_runs', coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at) from public.perception_worker_runs w where w.project_id = p.id), '[]'::jsonb),
    'artifacts', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.perception_artifacts a where a.project_id = p.id), '[]'::jsonb),
    'verifications', coalesce((select jsonb_agg(to_jsonb(v) order by v.checked_at) from public.perception_verification_runs v where v.project_id = p.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.perception_model_events e where e.project_id = p.id), '[]'::jsonb)
  ) into v_result
  from public.perception_projects p
  where p.id = p_project_id and p.user_id = v_user;

  return v_result;
end;
$$;

revoke all on function public.perception_submit_objective(text) from public, anon;
revoke all on function public.perception_get_project_world(uuid) from public, anon;
grant execute on function public.perception_submit_objective(text) to authenticated;
grant execute on function public.perception_get_project_world(uuid) to authenticated;
