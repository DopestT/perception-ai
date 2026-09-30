\set ON_ERROR_STOP on

-- Runtime v0.6 Scenario Forge safety + warm-start gate.
select user_id::text as sf_user_id, id::text as sf_project_id
from public.perception_projects
order by created_at
limit 1
\gset

select statement as sf_objective_text
from public.perception_objectives
where project_id = :'sf_project_id'::uuid
  and user_id = :'sf_user_id'::uuid
order by created_at desc
limit 1
\gset

select public.perception_refresh_scenario_forge_internal(
  :'sf_user_id'::uuid,
  :'sf_project_id'::uuid
);

select public.perception_refresh_scenario_forge_internal(
  :'sf_user_id'::uuid,
  :'sf_project_id'::uuid
);

select (count(*) = 1) as sf_dedupe_ok
from public.perception_scenarios
where user_id = :'sf_user_id'::uuid
  and project_id = :'sf_project_id'::uuid
  and scenario_key = 'continue-active-route'
\gset
\if :sf_dedupe_ok
\else
  \echo 'FAIL: Scenario Forge did not deduplicate the active-route scenario'
  \quit 1
\endif

select (
  route_seed->>'must_revalidate' = 'true'
  and confidence >= 0
  and confidence <= 1
  and expires_at > now()
  and storage_class = 'hot'
  and status = 'active'
) as sf_contract_ok
from public.perception_scenarios
where user_id = :'sf_user_id'::uuid
  and project_id = :'sf_project_id'::uuid
  and scenario_key = 'continue-active-route'
\gset
\if :sf_contract_ok
\else
  \echo 'FAIL: Scenario Forge warm-start contract is invalid'
  \quit 1
\endif

select set_config('request.jwt.claim.sub', :'sf_user_id', false);

with warm as (
  select public.perception_get_warm_start(
    :'sf_project_id'::uuid,
    :'sf_objective_text',
    3
  ) as result
)
select (
  (result->>'scenario_count')::integer >= 1
  and result->>'source' = 'scenario_forge_v0_6'
  and (result->'scenarios'->0->'route_seed'->>'must_revalidate')::boolean
) as sf_warm_start_ok
from warm
\gset
\if :sf_warm_start_ok
\else
  \echo 'FAIL: owner-scoped warm start did not return a revalidation-required scenario'
  \quit 1
\endif

update public.perception_scenarios
set expires_at = now() - interval '1 second'
where user_id = :'sf_user_id'::uuid
  and project_id = :'sf_project_id'::uuid
  and scenario_key = 'continue-active-route';

with warm as (
  select public.perception_get_warm_start(
    :'sf_project_id'::uuid,
    :'sf_objective_text',
    3
  ) as result
)
select (
  not exists (
    select 1
    from jsonb_array_elements(result->'scenarios') item
    where item->>'scenario_key' = 'continue-active-route'
  )
) as sf_stale_excluded_ok
from warm
\gset
\if :sf_stale_excluded_ok
\else
  \echo 'FAIL: expired scenario was returned as a warm start'
  \quit 1
\endif

select public.perception_refresh_scenario_forge_internal(
  :'sf_user_id'::uuid,
  :'sf_project_id'::uuid
);

select (expires_at > now() and status = 'active') as sf_refresh_reactivates_ok
from public.perception_scenarios
where user_id = :'sf_user_id'::uuid
  and project_id = :'sf_project_id'::uuid
  and scenario_key = 'continue-active-route'
\gset
\if :sf_refresh_reactivates_ok
\else
  \echo 'FAIL: Scenario Forge did not refresh an expired warm-start scenario'
  \quit 1
\endif

insert into auth.users(id, email)
values ('22222222-2222-4222-8222-222222222222'::uuid, 'scenario-other@example.test')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

create or replace function pg_temp.scenario_forge_owner_gate(p_project_id uuid)
returns boolean
language plpgsql
as $
begin
  perform public.perception_get_warm_start(
    p_project_id,
    'unowned project',
    3
  );
  return false;
exception
  when insufficient_privilege then
    return true;
end;
$;

select pg_temp.scenario_forge_owner_gate(:'sf_project_id'::uuid) as sf_owner_gate_ok
\gset
\if :sf_owner_gate_ok
\else
  \echo 'FAIL: Scenario Forge owner gate allowed cross-user warm-start access'
  \quit 1
\endif

select (
  has_function_privilege('service_role', 'public.perception_refresh_scenario_forge_internal(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.perception_refresh_scenario_forge_internal(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.perception_refresh_scenario_forge_internal(uuid,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.perception_get_warm_start(uuid,text,integer)', 'execute')
  and not has_function_privilege('anon', 'public.perception_get_warm_start(uuid,text,integer)', 'execute')
  and has_table_privilege('authenticated', 'public.perception_scenarios', 'select')
  and not has_table_privilege('authenticated', 'public.perception_scenarios', 'insert')
  and not has_table_privilege('authenticated', 'public.perception_scenarios', 'update')
  and not has_table_privilege('authenticated', 'public.perception_scenarios', 'delete')
) as sf_privileges_ok
\gset
\if :sf_privileges_ok
\else
  \echo 'FAIL: Scenario Forge privilege boundary is incorrect'
  \quit 1
\endif

\echo 'PASS: Runtime v0.6 Scenario Forge warm-start gate'
