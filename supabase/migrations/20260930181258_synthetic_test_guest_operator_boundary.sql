create or replace function private.perception_run_synthetic_tests_v2(
  p_iterations integer default 25
)
returns bigint
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_run_id bigint;
  v_user uuid;
  v_project uuid;
  v_guest_denied boolean := false;
  v_role_changed boolean := false;
begin
  v_run_id := private.perception_run_synthetic_tests(p_iterations);

  select target_user_id, target_project_id
  into v_user, v_project
  from private.perception_synthetic_test_runs
  where id=v_run_id;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub',v_user::text,
      'role','authenticated',
      'is_anonymous',true
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub',v_user::text,true);

  begin
    execute 'set local role authenticated';
    v_role_changed := true;

    begin
      perform public.perception_request_operator_proof_grant(v_project);
    exception
      when insufficient_privilege then
        v_guest_denied := true;
    end;

    execute 'reset role';
    v_role_changed := false;
  exception when others then
    if v_role_changed then
      execute 'reset role';
      v_role_changed := false;
    end if;
    v_guest_denied := false;
  end;

  update private.perception_synthetic_test_runs
  set total_checks = total_checks + 1,
      passed_checks = passed_checks + case when v_guest_denied then 1 else 0 end,
      failed_checks = failed_checks + case when v_guest_denied then 0 else 1 end,
      status = case
        when v_guest_denied and failed_checks=0 then 'pass'
        else 'fail'
      end,
      checks = checks || jsonb_build_object(
        'guest_operator_boundary',
        jsonb_build_object(
          'passed',case when v_guest_denied then 1 else 0 end,
          'expected',1
        )
      )
  where id=v_run_id;

  return v_run_id;
end;
$$;

revoke all on function private.perception_run_synthetic_tests_v2(integer)
  from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname='perception-synthetic-tests';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'perception-synthetic-tests',
    '7,37 * * * *',
    $cron$select private.perception_run_synthetic_tests_v2(25);$cron$
  );
end;
$$;
