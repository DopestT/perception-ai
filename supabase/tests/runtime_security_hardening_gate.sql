\set ON_ERROR_STOP on

-- Runtime security hardening gate.

select (
  not (select prosecdef from pg_proc where oid='public.perception_get_warm_start(uuid,text,integer)'::regprocedure)
  and not (select prosecdef from pg_proc where oid='public.perception_forecast_calibration()'::regprocedure)
  and not (select prosecdef from pg_proc where oid='public.perception_forecast_calibration_dashboard()'::regprocedure)
  and not (select prosecdef from pg_proc where oid='public.perception_get_forecast_scenario_analysis(uuid)'::regprocedure)
) as readonly_rpc_invoker_ok
\gset
\if :readonly_rpc_invoker_ok
\else
  \echo 'FAIL: a read-only Perception RPC still runs as SECURITY DEFINER'
  \quit 1
\endif

select (
  not has_function_privilege('anon','public.perception_score_forecast_resolution_trigger()','execute')
  and not has_function_privilege('authenticated','public.perception_score_forecast_resolution_trigger()','execute')
  and not has_function_privilege('anon','public.perception_sync_resolution_proposals()','execute')
  and not has_function_privilege('authenticated','public.perception_sync_resolution_proposals()','execute')
) as trigger_privileges_ok
\gset
\if :trigger_privileges_ok
\else
  \echo 'FAIL: trigger-only functions are exposed through the Data API'
  \quit 1
\endif

select (
  has_function_privilege('authenticated','public.perception_request_operator_proof_grant(uuid)','execute')
  and has_function_privilege('authenticated','public.perception_revoke_operator_grant(uuid)','execute')
  and has_function_privilege('authenticated','public.perception_deny_operator_action(uuid,text,text)','execute')
  and not has_function_privilege('anon','public.perception_request_operator_proof_grant(uuid)','execute')
  and not has_function_privilege('anon','public.perception_revoke_operator_grant(uuid)','execute')
  and not has_function_privilege('anon','public.perception_deny_operator_action(uuid,text,text)','execute')
) as operator_rpc_privileges_ok
\gset
\if :operator_rpc_privileges_ok
\else
  \echo 'FAIL: Operator RPC execute privileges are incorrect'
  \quit 1
\endif

select user_id::text as hardening_user_id,
       id::text as hardening_project_id
from public.perception_projects
where active is true
order by updated_at desc
limit 1
\gset

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', :'hardening_user_id',
    'role', 'authenticated',
    'is_anonymous', true
  )::text,
  false
);
select set_config('request.jwt.claim.sub', :'hardening_user_id', false);
set role authenticated;

create or replace function pg_temp.operator_guest_gate_ok(p_project_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_request boolean := false;
  v_revoke boolean := false;
  v_deny boolean := false;
begin
  begin
    perform public.perception_request_operator_proof_grant(p_project_id);
  exception when insufficient_privilege then
    v_request := sqlerrm = 'Permanent account required for Operator authority';
  end;

  begin
    perform public.perception_revoke_operator_grant(
      '00000000-0000-4000-8000-000000000001'::uuid
    );
  exception when insufficient_privilege then
    v_revoke := sqlerrm = 'Permanent account required for Operator authority';
  end;

  begin
    perform public.perception_deny_operator_action(
      p_project_id,
      'synthetic.operator.action',
      'guest_boundary_test'
    );
  exception when insufficient_privilege then
    v_deny := sqlerrm = 'Permanent account required for Operator authority';
  end;

  return v_request and v_revoke and v_deny;
end;
$$;

select pg_temp.operator_guest_gate_ok(:'hardening_project_id'::uuid) as operator_guest_gate_ok
\gset
\if :operator_guest_gate_ok
\else
  \echo 'FAIL: an anonymous authenticated user reached Operator authority'
  \quit 1
\endif

reset role;

select (
  to_regclass('private.perception_synthetic_test_runs') is not null
  and to_regprocedure('private.perception_run_synthetic_tests(integer)') is not null
  and to_regprocedure('private.perception_run_synthetic_tests_v2(integer)') is not null
  and not has_function_privilege('anon','private.perception_run_synthetic_tests(integer)','execute')
  and not has_function_privilege('authenticated','private.perception_run_synthetic_tests(integer)','execute')
  and not has_function_privilege('anon','private.perception_run_synthetic_tests_v2(integer)','execute')
  and not has_function_privilege('authenticated','private.perception_run_synthetic_tests_v2(integer)','execute')
) as synthetic_runner_private_ok
\gset
\if :synthetic_runner_private_ok
\else
  \echo 'FAIL: synthetic runner is missing or exposed to API roles'
  \quit 1
\endif

select exists (
  select 1
  from cron.job
  where jobname='perception-synthetic-tests'
    and schedule='7,37 * * * *'
    and active=true
    and command='select private.perception_run_synthetic_tests_v2(25);'
) as synthetic_cron_ok
\gset
\if :synthetic_cron_ok
\else
  \echo 'FAIL: recurring synthetic test cron is not wired to v2'
  \quit 1
\endif

\echo 'PASS: Perception runtime security hardening gate'
