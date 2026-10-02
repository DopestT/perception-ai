\set ON_ERROR_STOP on

-- Runtime v0.11: owner-scoped external pre-search preference boundary.
insert into auth.users(id, email)
values
  ('44444444-4444-4444-8444-444444444444'::uuid, 'v11-owner@example.test'),
  ('55555555-5555-4555-8555-555555555555'::uuid, 'v11-other@example.test')
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);
set role authenticated;

insert into public.perception_runtime_preferences(
  user_id,
  external_anticipatory_search_enabled,
  external_search_consent_version,
  external_search_consented_at
) values (
  '44444444-4444-4444-8444-444444444444'::uuid,
  false,
  1,
  null
);

select (
  count(*) = 1
  and bool_and(external_anticipatory_search_enabled is false)
  and bool_and(external_search_consented_at is null)
) as v11_owner_default_ok
from public.perception_runtime_preferences
where user_id='44444444-4444-4444-8444-444444444444'::uuid
\gset
\if :v11_owner_default_ok
\else
  \echo 'FAIL: v0.11 preference default/owner read is invalid'
  \quit 1
\endif

update public.perception_runtime_preferences
set external_anticipatory_search_enabled=true,
    external_search_consented_at=now(),
    updated_at=now()
where user_id='44444444-4444-4444-8444-444444444444'::uuid;

select (
  external_anticipatory_search_enabled
  and external_search_consented_at is not null
) as v11_owner_update_ok
from public.perception_runtime_preferences
where user_id='44444444-4444-4444-8444-444444444444'::uuid
\gset
\if :v11_owner_update_ok
\else
  \echo 'FAIL: v0.11 owner could not update own preference'
  \quit 1
\endif

reset role;

select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);
set role authenticated;

select (
  count(*) = 0
) as v11_cross_user_hidden_ok
from public.perception_runtime_preferences
where user_id='44444444-4444-4444-8444-444444444444'::uuid
\gset
\if :v11_cross_user_hidden_ok
\else
  \echo 'FAIL: v0.11 preference leaked across users'
  \quit 1
\endif

create or replace function pg_temp.v11_cross_user_update_blocked()
returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  update public.perception_runtime_preferences
  set external_anticipatory_search_enabled=false
  where user_id='44444444-4444-4444-8444-444444444444'::uuid;

  get diagnostics v_count = row_count;
  return v_count = 0;
end;
$$;

select pg_temp.v11_cross_user_update_blocked() as v11_cross_user_update_blocked
\gset
\if :v11_cross_user_update_blocked
\else
  \echo 'FAIL: v0.11 cross-user update was not blocked'
  \quit 1
\endif

reset role;

select (
  has_table_privilege('authenticated','public.perception_runtime_preferences','select')
  and has_table_privilege('authenticated','public.perception_runtime_preferences','insert')
  and has_table_privilege('authenticated','public.perception_runtime_preferences','update')
  and not has_table_privilege('authenticated','public.perception_runtime_preferences','delete')
  and not has_table_privilege('anon','public.perception_runtime_preferences','select')
  and not has_table_privilege('anon','public.perception_runtime_preferences','insert')
  and not has_table_privilege('anon','public.perception_runtime_preferences','update')
  and (
    select relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname='perception_runtime_preferences'
  )
) as v11_privilege_boundary_ok
\gset
\if :v11_privilege_boundary_ok
\else
  \echo 'FAIL: v0.11 preference privilege/RLS boundary is incorrect'
  \quit 1
\endif

\echo 'PASS: Runtime v0.11 external pre-search preference gate'
