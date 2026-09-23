\set ON_ERROR_STOP on
\set user1 '11111111-1111-4111-8111-111111111111'
\set user2 '22222222-2222-4222-8222-222222222222'

create or replace function public.runtime_v02_expect_worker_denied(
  p_user_id uuid,
  p_project_id uuid,
  p_route_node_id uuid,
  p_worker_key text,
  p_capability text,
  p_permission_level text
)
returns void
language plpgsql
as $fn$
begin
  begin
    insert into public.perception_worker_runs(
      user_id, project_id, route_node_id, worker_key, capability, permission_level, status
    ) values (
      p_user_id, p_project_id, p_route_node_id, p_worker_key, p_capability, p_permission_level, 'queued'
    );
    raise exception 'Worker % was inserted without a sufficient active grant', p_worker_key;
  exception
    when insufficient_privilege then return;
  end;
end
$fn$;

insert into auth.users(id, email)
values
  (:'user1'::uuid, 'runtime-v02-user1@example.test'),
  (:'user2'::uuid, 'runtime-v02-user2@example.test')
on conflict (id) do nothing;

select public.perception_submit_resolved_objective_internal(
  :'user1'::uuid,
  'Runtime v0.2 staging verification objective',
  jsonb_build_object(
    'source', 'deterministic_fallback',
    'desired_reality', 'Runtime v0.2 security and truth boundaries are verified.',
    'current_reality', 'INFERRED_RUNTIME_STATE_MUST_NOT_BECOME_PROJECT_TRUTH',
    'constraints', '[]'::jsonb,
    'success_criteria', jsonb_build_array('Database safety gate passes'),
    'deliverables', jsonb_build_array('Verified database gate'),
    'known_unknowns', '[]'::jsonb,
    'inferred_claims', '[]'::jsonb,
    'confidence', 0.55,
    'urgency', 'normal'
  )
);

select o.project_id as project_id, o.id as objective_id
from public.perception_objectives o
where o.user_id = :'user1'::uuid
  and o.statement = 'Runtime v0.2 staging verification objective'
order by o.created_at desc
limit 1
\gset

select r.id as route_id
from public.perception_routes r
where r.project_id = :'project_id'::uuid
  and r.objective_id = :'objective_id'::uuid
  and r.active
order by r.version desc
limit 1
\gset

select (p.current_reality <> 'INFERRED_RUNTIME_STATE_MUST_NOT_BECOME_PROJECT_TRUTH') as inferred_not_authoritative
from public.perception_projects p
where p.id = :'project_id'::uuid
\gset
\if :inferred_not_authoritative
\else
  \echo 'FAIL: inferred semantic current reality became authoritative Project World truth'
  \quit 1
\endif

set role authenticated;
select set_config('request.jwt.claim.sub', :'user2', false);

select (count(*) = 0) as project_isolated
from public.perception_projects
where id = :'project_id'::uuid
\gset
\if :project_isolated
\else
  \echo 'FAIL: second account can read first account project'
  \quit 1
\endif

select (count(*) = 0) as epistemic_isolated
from public.perception_epistemic_ledger
where project_id = :'project_id'::uuid
\gset
\if :epistemic_isolated
\else
  \echo 'FAIL: second account can read first account epistemic ledger'
  \quit 1
\endif

select (count(*) = 0) as execution_isolated
from public.perception_execution_ledger
where project_id = :'project_id'::uuid
\gset
\if :execution_isolated
\else
  \echo 'FAIL: second account can read first account execution ledger'
  \quit 1
\endif

select set_config('request.jwt.claim.sub', :'user1', false);
select (count(*) = 1) as owner_project_visible
from public.perception_projects
where id = :'project_id'::uuid
\gset
\if :owner_project_visible
\else
  \echo 'FAIL: owner cannot read own project through RLS'
  \quit 1
\endif

select (count(*) > 0) as owner_ledgers_visible
from public.perception_epistemic_ledger
where project_id = :'project_id'::uuid
\gset
\if :owner_ledgers_visible
\else
  \echo 'FAIL: owner cannot read own epistemic ledger through RLS'
  \quit 1
\endif
reset role;
select set_config('request.jwt.claim.sub', '', false);

insert into public.perception_route_nodes(
  user_id, project_id, route_id, label, outcome, status, capability,
  permission_level, confidence, risk, completion_tests, sort_order
) values (
  :'user1'::uuid, :'project_id'::uuid, :'route_id'::uuid,
  'P2 controlled action', 'P2 permission gate is enforced.', 'ready', 'code',
  'P2', 1, 'medium', '[]'::jsonb, 90
)
returning id as p2_node_id
\gset

select public.runtime_v02_expect_worker_denied(
  :'user1'::uuid, :'project_id'::uuid, :'p2_node_id'::uuid,
  'p2_denied_no_grant', 'code', 'P2'
);

select (count(*) = 0) as no_unauthorized_p2_worker
from public.perception_worker_runs
where worker_key = 'p2_denied_no_grant'
\gset
\if :no_unauthorized_p2_worker
\else
  \echo 'FAIL: unauthorized P2 worker persisted'
  \quit 1
\endif

insert into public.perception_permission_grants(
  user_id, project_id, permission_level, capability, scope_note, expires_at
) values (
  :'user1'::uuid, :'project_id'::uuid, 'P2', 'code',
  'runtime v0.2 isolated CI gate', now() + interval '1 hour'
)
returning id as p2_grant_id
\gset

insert into public.perception_worker_runs(
  user_id, project_id, route_node_id, worker_key, capability, permission_level, status
) values (
  :'user1'::uuid, :'project_id'::uuid, :'p2_node_id'::uuid,
  'p2_allowed_with_grant', 'code', 'P2', 'running'
)
returning id as p2_worker_id
\gset

select (
  array_agg(phase order by created_at, id)
  = array['intended','authorized','attempted']::text[]
) as initial_execution_chain_ok
from public.perception_execution_ledger
where worker_run_id = :'p2_worker_id'::uuid
\gset
\if :initial_execution_chain_ok
\else
  \echo 'FAIL: P2 worker did not produce intended -> authorized -> attempted'
  \quit 1
\endif

insert into public.perception_artifacts(
  user_id, project_id, objective_id, route_node_id,
  artifact_type, title, content, metadata
) values (
  :'user1'::uuid, :'project_id'::uuid, :'objective_id'::uuid, :'p2_node_id'::uuid,
  'runtime_gate', 'Observed staging effect', 'staging-only evidence',
  jsonb_build_object('environment', 'isolated_ci')
);

insert into public.perception_verification_runs(
  user_id, project_id, route_node_id, worker_run_id,
  passed, evidence, details
) values (
  :'user1'::uuid, :'project_id'::uuid, :'p2_node_id'::uuid, :'p2_worker_id'::uuid,
  true,
  jsonb_build_array(jsonb_build_object('kind','runtime_v02_db_gate','result','pass')),
  jsonb_build_object('environment','isolated_ci')
);

select (
  array_agg(phase order by created_at, id)
  = array['intended','authorized','attempted','observed','verified']::text[]
) as full_execution_chain_ok
from public.perception_execution_ledger
where worker_run_id = :'p2_worker_id'::uuid
\gset
\if :full_execution_chain_ok
\else
  \echo 'FAIL: execution ledger chronology is not intended -> authorized -> attempted -> observed -> verified'
  \quit 1
\endif

update public.perception_permission_grants
set revoked_at = now()
where id = :'p2_grant_id'::uuid;

select public.runtime_v02_expect_worker_denied(
  :'user1'::uuid, :'project_id'::uuid, :'p2_node_id'::uuid,
  'p2_denied_after_revoke', 'code', 'P2'
);

insert into public.perception_route_nodes(
  user_id, project_id, route_id, label, outcome, status, capability,
  permission_level, confidence, risk, completion_tests, sort_order
) values (
  :'user1'::uuid, :'project_id'::uuid, :'route_id'::uuid,
  'P3 controlled action', 'P3 rank and expiration are enforced.', 'awaiting_approval', 'code',
  'P3', 1, 'high', '[]'::jsonb, 91
)
returning id as p3_node_id
\gset

insert into public.perception_permission_grants(
  user_id, project_id, permission_level, capability, scope_note, expires_at
) values (
  :'user1'::uuid, :'project_id'::uuid, 'P2', 'code',
  'insufficient rank test', now() + interval '1 hour'
)
returning id as insufficient_grant_id
\gset

select public.runtime_v02_expect_worker_denied(
  :'user1'::uuid, :'project_id'::uuid, :'p3_node_id'::uuid,
  'p3_denied_by_p2_grant', 'code', 'P3'
);

insert into public.perception_permission_grants(
  user_id, project_id, permission_level, capability, scope_note, expires_at
) values (
  :'user1'::uuid, :'project_id'::uuid, 'P3', 'code',
  'runtime v0.2 isolated P3 test', now() + interval '1 hour'
)
returning id as p3_grant_id
\gset

insert into public.perception_worker_runs(
  user_id, project_id, route_node_id, worker_key, capability, permission_level, status
) values (
  :'user1'::uuid, :'project_id'::uuid, :'p3_node_id'::uuid,
  'p3_allowed_with_grant', 'code', 'P3', 'queued'
)
returning id as p3_worker_id
\gset

select (count(*) = 1) as p3_worker_created
from public.perception_worker_runs
where id = :'p3_worker_id'::uuid
\gset
\if :p3_worker_created
\else
  \echo 'FAIL: valid P3 grant did not authorize worker'
  \quit 1
\endif

update public.perception_permission_grants
set expires_at = now() - interval '1 second'
where id = :'p3_grant_id'::uuid;

select public.runtime_v02_expect_worker_denied(
  :'user1'::uuid, :'project_id'::uuid, :'p3_node_id'::uuid,
  'p3_denied_after_expiry', 'code', 'P3'
);

select public.perception_submit_planned_objective_internal(
  :'user1'::uuid,
  'Create a safe dynamic continuation route',
  jsonb_build_object(
    'source', 'deterministic_fallback',
    'desired_reality', 'A verified continuation route exists.',
    'current_reality', 'Only the direct objective statement is currently known.',
    'constraints', '[]'::jsonb,
    'success_criteria', jsonb_build_array('Route v2 persists while v1 remains historical evidence'),
    'deliverables', jsonb_build_array('Continuation route'),
    'known_unknowns', '[]'::jsonb,
    'inferred_claims', '[]'::jsonb,
    'confidence', 0.55,
    'urgency', 'normal'
  ),
  jsonb_build_object(
    'reason', 'CI verification continuation route',
    'blockedCapabilities', jsonb_build_array('research'),
    'nodes', jsonb_build_array(
      jsonb_build_object(
        'key','resolve-meaning','label','Resolve meaning','outcome','Meaning resolved',
        'capability','reason','permissionLevel','P0','confidence',1,'risk','low',
        'dependencies','[]'::jsonb,'completionTests','[]'::jsonb
      ),
      jsonb_build_object(
        'key','first-reversible-action','label','First action','outcome','First action complete',
        'capability','generate','permissionLevel','P1','confidence',1,'risk','low',
        'dependencies','[]'::jsonb,'completionTests','[]'::jsonb
      ),
      jsonb_build_object(
        'key','verify-first-action','label','Verify first action','outcome','First action verified',
        'capability','verify','permissionLevel','P0','confidence',1,'risk','low',
        'dependencies','[]'::jsonb,'completionTests','[]'::jsonb
      ),
      jsonb_build_object(
        'key','continuation-build','label','Build continuation','outcome','Continuation prepared',
        'capability','code','permissionLevel','P2','confidence',0.8,'risk','medium',
        'dependencies','[]'::jsonb,'completionTests',jsonb_build_array('Continuation is reviewable')
      ),
      jsonb_build_object(
        'key','inspect-external-reality','label','Inspect external reality','outcome','External reality inspected',
        'capability','research','permissionLevel','P1','confidence',0.6,'risk','low',
        'blocker','Research adapter unavailable',
        'dependencies',jsonb_build_array('continuation-build'),
        'completionTests',jsonb_build_array('Evidence is attached')
      )
    )
  )
);

select o.id as continuation_objective_id, o.project_id as continuation_project_id
from public.perception_objectives o
where o.user_id = :'user1'::uuid
  and o.statement = 'Create a safe dynamic continuation route'
order by o.created_at desc
limit 1
\gset

select (count(*) = 2) as two_routes
from public.perception_routes
where objective_id = :'continuation_objective_id'::uuid
\gset
\if :two_routes
\else
  \echo 'FAIL: continuation objective does not retain exactly route v1 and route v2'
  \quit 1
\endif

select (not active) as v1_inactive, id as v1_id
from public.perception_routes
where objective_id = :'continuation_objective_id'::uuid and version = 1
\gset
\if :v1_inactive
\else
  \echo 'FAIL: route v1 was not preserved as inactive history'
  \quit 1
\endif

select active as v2_active, id as continuation_route_id, supersedes_route_id
from public.perception_routes
where objective_id = :'continuation_objective_id'::uuid and version = 2
\gset
\if :v2_active
\else
  \echo 'FAIL: route v2 is not active'
  \quit 1
\endif

select (:'supersedes_route_id'::uuid = :'v1_id'::uuid) as supersession_link_ok
\gset
\if :supersession_link_ok
\else
  \echo 'FAIL: route v2 does not supersede route v1'
  \quit 1
\endif

select (count(*) = 1) as p2_awaiting_approval
from public.perception_route_nodes
where route_id = :'continuation_route_id'::uuid
  and label = 'Build continuation'
  and permission_level = 'P2'
  and status = 'awaiting_approval'
\gset
\if :p2_awaiting_approval
\else
  \echo 'FAIL: continuation P2 node is not awaiting approval'
  \quit 1
\endif

select (count(*) = 1) as research_blocked
from public.perception_route_nodes
where route_id = :'continuation_route_id'::uuid
  and label = 'Inspect external reality'
  and status = 'blocked'
  and blocker = 'Research adapter unavailable'
\gset
\if :research_blocked
\else
  \echo 'FAIL: blocked capability did not remain blocked in route v2'
  \quit 1
\endif

\echo 'PASS: Runtime v0.2 database safety gate'
