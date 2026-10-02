\set ON_ERROR_STOP on

-- Runtime v0.10: scenario selection -> verified progress -> learned utility.
begin;

select s.user_id::text as v10_user_id,
       s.project_id::text as v10_project_id,
       s.id::text as v10_scenario_id,
       s.scenario_key as v10_scenario_key,
       o.id::text as v10_objective_id,
       r.id::text as v10_route_id
from public.perception_scenarios s
join lateral (
  select o.*
  from public.perception_objectives o
  where o.user_id=s.user_id
    and o.project_id=s.project_id
  order by o.created_at desc
  limit 1
) o on true
join lateral (
  select r.*
  from public.perception_routes r
  where r.user_id=s.user_id
    and r.project_id=s.project_id
    and r.objective_id=o.id
  order by r.active desc, r.version desc, r.created_at desc
  limit 1
) r on true
where s.status='active'
  and s.expires_at > now()
order by s.created_at
limit 1
\gset

select use_count::text as v10_use_before,
       successful_use_count::text as v10_success_before
from public.perception_scenarios
where id=:'v10_scenario_id'::uuid
\gset

select public.perception_record_scenario_selection_internal(
  :'v10_user_id'::uuid,
  :'v10_project_id'::uuid,
  :'v10_objective_id'::uuid,
  :'v10_route_id'::uuid,
  :'v10_scenario_key'
) as v10_first_selection
\gset

select public.perception_record_scenario_selection_internal(
  :'v10_user_id'::uuid,
  :'v10_project_id'::uuid,
  :'v10_objective_id'::uuid,
  :'v10_route_id'::uuid,
  :'v10_scenario_key'
) as v10_duplicate_selection
\gset

select (
  (:'v10_first_selection'::jsonb->>'recorded')::boolean
  and not (:'v10_duplicate_selection'::jsonb->>'recorded')::boolean
  and use_count = :'v10_use_before'::integer + 1
  and successful_use_count = :'v10_success_before'::integer
  and (
    select count(*)
    from private.perception_scenario_uses u
    where u.user_id=:'v10_user_id'::uuid
      and u.project_id=:'v10_project_id'::uuid
      and u.objective_id=:'v10_objective_id'::uuid
      and u.route_id=:'v10_route_id'::uuid
      and u.scenario_id=:'v10_scenario_id'::uuid
  ) = 1
) as v10_selection_idempotent_ok
from public.perception_scenarios
where id=:'v10_scenario_id'::uuid
\gset
\if :v10_selection_idempotent_ok
\else
  \echo 'FAIL: scenario selection accounting is not idempotent'
  \quit 1
\endif

insert into public.perception_execution_ledger(
  user_id,project_id,objective_id,route_id,action_key,phase,
  permission_level,capability,target,details,evidence
) values (
  :'v10_user_id'::uuid,
  :'v10_project_id'::uuid,
  :'v10_objective_id'::uuid,
  :'v10_route_id'::uuid,
  'synthetic:v10:verified:first',
  'verified',
  'P1',
  'verify',
  'synthetic:v10',
  '{"kind":"ci_v10"}'::jsonb,
  '[{"kind":"synthetic_verification"}]'::jsonb
);

insert into public.perception_execution_ledger(
  user_id,project_id,objective_id,route_id,action_key,phase,
  permission_level,capability,target,details,evidence
) values (
  :'v10_user_id'::uuid,
  :'v10_project_id'::uuid,
  :'v10_objective_id'::uuid,
  :'v10_route_id'::uuid,
  'synthetic:v10:verified:duplicate',
  'verified',
  'P1',
  'verify',
  'synthetic:v10',
  '{"kind":"ci_v10_duplicate"}'::jsonb,
  '[{"kind":"synthetic_verification"}]'::jsonb
);

select (
  successful_use_count = :'v10_success_before'::integer + 1
  and (
    select count(*)
    from private.perception_scenario_uses u
    where u.user_id=:'v10_user_id'::uuid
      and u.project_id=:'v10_project_id'::uuid
      and u.objective_id=:'v10_objective_id'::uuid
      and u.route_id=:'v10_route_id'::uuid
      and u.scenario_id=:'v10_scenario_id'::uuid
      and u.succeeded_at is not null
  ) = 1
) as v10_verified_success_once_ok
from public.perception_scenarios
where id=:'v10_scenario_id'::uuid
\gset
\if :v10_verified_success_once_ok
\else
  \echo 'FAIL: duplicate verified effects inflated scenario success'
  \quit 1
\endif

insert into public.perception_scenarios(
  user_id,project_id,scenario_key,title,summary,intent_keys,
  route_seed,evidence_refs,confidence,status,storage_class,
  content_hash,source_fingerprint,last_validated_at,expires_at,
  retention_until,use_count,successful_use_count,last_used_at
)
select
  user_id,project_id,'v10-utility-low','Utility low','Utility tie proof',
  array['utilitytie']::text[],
  jsonb_build_object('must_revalidate',true),
  '[]'::jsonb,0.99,'active','hot',
  md5('v10-utility-low'),md5('v10-utility-low'),
  now(),now()+interval '1 hour',now()+interval '1 day',
  3,0,now()
from public.perception_scenarios
where id=:'v10_scenario_id'::uuid;

insert into public.perception_scenarios(
  user_id,project_id,scenario_key,title,summary,intent_keys,
  route_seed,evidence_refs,confidence,status,storage_class,
  content_hash,source_fingerprint,last_validated_at,expires_at,
  retention_until,use_count,successful_use_count,last_used_at
)
select
  user_id,project_id,'v10-utility-high','Utility high','Utility tie proof',
  array['utilitytie']::text[],
  jsonb_build_object('must_revalidate',true),
  '[]'::jsonb,0.80,'active','hot',
  md5('v10-utility-high'),md5('v10-utility-high'),
  now(),now()+interval '1 hour',now()+interval '1 day',
  3,2,now()
from public.perception_scenarios
where id=:'v10_scenario_id'::uuid;

select set_config('request.jwt.claim.sub', :'v10_user_id', false);
set role authenticated;

with warm as (
  select public.perception_get_warm_start(
    :'v10_project_id'::uuid,
    'utilitytie',
    8
  ) as result
)
select (
  result->>'ranking'='utility_learning_v0_10'
  and result->'scenarios'->0->>'scenario_key'='v10-utility-high'
  and (result->'scenarios'->0->>'match_count')::integer=1
  and (result->'scenarios'->1->>'match_count')::integer=1
  and (result->'scenarios'->0->>'utility_score')::numeric
      > (result->'scenarios'->1->>'utility_score')::numeric
) as v10_utility_tie_break_ok
from warm
\gset

reset role;

\if :v10_utility_tie_break_ok
\else
  \echo 'FAIL: learned utility did not break equal-relevance scenario ties'
  \quit 1
\endif

select (
  has_function_privilege(
    'service_role',
    'public.perception_record_scenario_selection_internal(uuid,uuid,uuid,uuid,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.perception_record_scenario_selection_internal(uuid,uuid,uuid,uuid,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.perception_record_scenario_selection_internal(uuid,uuid,uuid,uuid,text)',
    'execute'
  )
  and not has_table_privilege(
    'authenticated',
    'private.perception_scenario_uses',
    'select'
  )
  and not has_table_privilege(
    'anon',
    'private.perception_scenario_uses',
    'select'
  )
) as v10_privilege_boundary_ok
\gset
\if :v10_privilege_boundary_ok
\else
  \echo 'FAIL: scenario utility telemetry is exposed outside service_role'
  \quit 1
\endif

rollback;

\echo 'PASS: Runtime v0.10 scenario utility learning gate'
