\set ON_ERROR_STOP on

-- Runtime v0.7 idle Scenario Forge gate.
select user_id::text as idle_user_id, id::text as idle_project_id
from public.perception_projects
where active is true
order by created_at
limit 1
\gset

select public.perception_refresh_scenario_forge_internal(
  :'idle_user_id'::uuid,
  :'idle_project_id'::uuid
);

select (
  public.perception_project_needs_scenario_refresh_internal(
    :'idle_user_id'::uuid,
    :'idle_project_id'::uuid
  ) is false
) as idle_fresh_project_skipped_ok
\gset
\if :idle_fresh_project_skipped_ok
\else
  \echo 'FAIL: freshly forged Project World was still marked due'
  \quit 1
\endif

update public.perception_scenarios
set expires_at = now() + interval '10 minutes'
where user_id = :'idle_user_id'::uuid
  and project_id = :'idle_project_id'::uuid
  and status = 'active';

select public.perception_project_needs_scenario_refresh_internal(
  :'idle_user_id'::uuid,
  :'idle_project_id'::uuid
) as idle_expiring_project_due_ok
\gset
\if :idle_expiring_project_due_ok
\else
  \echo 'FAIL: near-expiry warm memory was not marked due'
  \quit 1
\endif

select public.perception_refresh_scenario_forge_internal(
  :'idle_user_id'::uuid,
  :'idle_project_id'::uuid
);

select (
  public.perception_project_needs_scenario_refresh_internal(
    :'idle_user_id'::uuid,
    :'idle_project_id'::uuid
  ) is false
) as idle_refresh_clears_due_ok
\gset
\if :idle_refresh_clears_due_ok
\else
  \echo 'FAIL: refreshed Project World remained due'
  \quit 1
\endif

with run as (
  select public.perception_refresh_idle_scenarios_internal(5) as result
)
select (
  result->>'source' = 'scenario_forge_idle_v0_7'
  and (result->>'limit')::integer = 5
  and jsonb_typeof(result->'projects') = 'array'
) as idle_batch_contract_ok
from run
\gset
\if :idle_batch_contract_ok
\else
  \echo 'FAIL: idle Scenario Forge batch contract is invalid'
  \quit 1
\endif

select (
  has_function_privilege(
    'service_role',
    'public.perception_project_activity_at_internal(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.perception_project_activity_at_internal(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.perception_project_activity_at_internal(uuid,uuid)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.perception_project_needs_scenario_refresh_internal(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.perception_project_needs_scenario_refresh_internal(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.perception_project_needs_scenario_refresh_internal(uuid,uuid)',
    'execute'
  )
  and has_function_privilege(
    'service_role',
    'public.perception_refresh_idle_scenarios_internal(integer)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.perception_refresh_idle_scenarios_internal(integer)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.perception_refresh_idle_scenarios_internal(integer)',
    'execute'
  )
) as idle_privileges_ok
\gset
\if :idle_privileges_ok
\else
  \echo 'FAIL: idle Scenario Forge privilege boundary is incorrect'
  \quit 1
\endif

\echo 'PASS: Runtime v0.7 idle Scenario Forge gate'
