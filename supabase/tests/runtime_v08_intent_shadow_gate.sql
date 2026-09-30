\set ON_ERROR_STOP on

-- Runtime v0.8 Anticipatory Retrieval / Intent Shadow gate.
select user_id::text as shadow_user_id,
       id::text as shadow_project_id,
       coalesce(nullif(name, ''), desired_reality) as shadow_probe_text
from public.perception_projects
where active is true
order by updated_at desc
limit 1
\gset

select set_config('request.jwt.claim.sub', :'shadow_user_id', false);

select count(*)::integer as shadow_scenarios_before
from public.perception_scenarios
where user_id = :'shadow_user_id'::uuid
\gset

with preview as (
  select public.perception_preview_intent_shadow(
    :'shadow_probe_text',
    'perceive',
    3
  ) as result
)
select (
  result->>'source' = 'intent_shadow_v0_8'
  and (result->>'ephemeral')::boolean
  and (result->>'valid_for_ms')::integer = 60000
  and jsonb_typeof(result->'candidates') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(result->'candidates') item
    where item->>'project_id' = :'shadow_project_id'
  )
) as shadow_owner_match_ok
from preview
\gset
\if :shadow_owner_match_ok
\else
  \echo 'FAIL: intent shadow did not return the owner-scoped matching Project World'
  \quit 1
\endif

select count(*)::integer as shadow_scenarios_after
from public.perception_scenarios
where user_id = :'shadow_user_id'::uuid
\gset

select (:'shadow_scenarios_before'::integer = :'shadow_scenarios_after'::integer) as shadow_no_persistence_ok
\gset
\if :shadow_no_persistence_ok
\else
  \echo 'FAIL: intent shadow persisted provisional typing state'
  \quit 1
\endif

insert into auth.users(id, email)
values ('33333333-3333-4333-8333-333333333333'::uuid, 'intent-shadow-other@example.test')
on conflict (id) do nothing;

select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  false
);

with preview as (
  select public.perception_preview_intent_shadow(
    :'shadow_probe_text',
    'perceive',
    5
  ) as result
)
select (
  not exists (
    select 1
    from jsonb_array_elements(result->'candidates') item
    where item->>'project_id' = :'shadow_project_id'
  )
) as shadow_cross_user_denied_ok
from preview
\gset
\if :shadow_cross_user_denied_ok
\else
  \echo 'FAIL: intent shadow exposed another user Project World'
  \quit 1
\endif

select (
  has_function_privilege(
    'authenticated',
    'public.perception_preview_intent_shadow(text,text,integer)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.perception_preview_intent_shadow(text,text,integer)',
    'execute'
  )
) as shadow_privileges_ok
\gset
\if :shadow_privileges_ok
\else
  \echo 'FAIL: intent shadow privilege boundary is incorrect'
  \quit 1
\endif

\echo 'PASS: Runtime v0.8 Anticipatory Retrieval gate'
