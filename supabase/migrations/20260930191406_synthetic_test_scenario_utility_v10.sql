create or replace function private.perception_scenario_utility_self_test()
returns boolean
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_user uuid;
  v_project uuid;
  v_objective uuid;
  v_route uuid;
  v_base_scenario uuid;
  v_scenario uuid;
  v_key text;
  v_first jsonb;
  v_second jsonb;
  v_use_count integer := 0;
  v_success_before integer := 0;
  v_success_first integer := 0;
  v_success_second integer := 0;
  v_use_rows integer := 0;
  v_ok boolean := false;
begin
  select
    s.user_id,
    s.project_id,
    o.id,
    r.id,
    s.id
  into
    v_user,
    v_project,
    v_objective,
    v_route,
    v_base_scenario
  from public.perception_scenarios s
  join lateral (
    select o.id, o.created_at
    from public.perception_objectives o
    where o.user_id=s.user_id
      and o.project_id=s.project_id
    order by o.created_at desc
    limit 1
  ) o on true
  join lateral (
    select r.id, r.active, r.version, r.created_at
    from public.perception_routes r
    where r.user_id=s.user_id
      and r.project_id=s.project_id
      and r.objective_id=o.id
    order by r.active desc, r.version desc, r.created_at desc
    limit 1
  ) r on true
  where s.status='active'
    and s.expires_at > now()
  order by s.last_validated_at desc
  limit 1;

  if v_user is null
     or v_project is null
     or v_objective is null
     or v_route is null
     or v_base_scenario is null then
    return false;
  end if;

  begin
    v_key := 'synthetic-utility:' || gen_random_uuid()::text;

    insert into public.perception_scenarios(
      user_id,
      project_id,
      scenario_key,
      title,
      summary,
      intent_keys,
      route_seed,
      evidence_refs,
      confidence,
      status,
      storage_class,
      content_hash,
      source_fingerprint,
      last_validated_at,
      expires_at,
      retention_until
    )
    select
      s.user_id,
      s.project_id,
      v_key,
      'Synthetic utility loop',
      'Rollback-only scenario utility test.',
      array['syntheticutility']::text[],
      jsonb_build_object(
        'source','synthetic_utility_test',
        'must_revalidate',true
      ),
      jsonb_build_array(
        jsonb_build_object('kind','synthetic_test')
      ),
      0.90,
      'active',
      'hot',
      md5(v_key),
      md5('source:' || v_key),
      now(),
      now()+interval '5 minutes',
      now()+interval '1 day'
    from public.perception_scenarios s
    where s.id=v_base_scenario
    returning id into v_scenario;

    v_first := public.perception_record_scenario_selection_internal(
      v_user,
      v_project,
      v_objective,
      v_route,
      v_key
    );

    v_second := public.perception_record_scenario_selection_internal(
      v_user,
      v_project,
      v_objective,
      v_route,
      v_key
    );

    select use_count, successful_use_count
    into v_use_count, v_success_before
    from public.perception_scenarios
    where id=v_scenario;

    select count(*)
    into v_use_rows
    from private.perception_scenario_uses
    where user_id=v_user
      and project_id=v_project
      and objective_id=v_objective
      and route_id=v_route
      and scenario_id=v_scenario;

    insert into public.perception_execution_ledger(
      user_id,
      project_id,
      objective_id,
      route_id,
      action_key,
      phase,
      permission_level,
      capability,
      target,
      details,
      evidence
    ) values (
      v_user,
      v_project,
      v_objective,
      v_route,
      'synthetic:v10:first:' || gen_random_uuid()::text,
      'verified',
      'P1',
      'verify',
      'synthetic:v10',
      jsonb_build_object('kind','rollback_synthetic_utility'),
      jsonb_build_array(jsonb_build_object('kind','synthetic_verification'))
    );

    select successful_use_count
    into v_success_first
    from public.perception_scenarios
    where id=v_scenario;

    insert into public.perception_execution_ledger(
      user_id,
      project_id,
      objective_id,
      route_id,
      action_key,
      phase,
      permission_level,
      capability,
      target,
      details,
      evidence
    ) values (
      v_user,
      v_project,
      v_objective,
      v_route,
      'synthetic:v10:duplicate:' || gen_random_uuid()::text,
      'verified',
      'P1',
      'verify',
      'synthetic:v10',
      jsonb_build_object('kind','rollback_synthetic_utility_duplicate'),
      jsonb_build_array(jsonb_build_object('kind','synthetic_verification'))
    );

    select successful_use_count
    into v_success_second
    from public.perception_scenarios
    where id=v_scenario;

    v_ok :=
      coalesce((v_first->>'recorded')::boolean,false)
      and not coalesce((v_second->>'recorded')::boolean,true)
      and v_use_count=1
      and v_success_before=0
      and v_success_first=1
      and v_success_second=1
      and v_use_rows=1;

    raise exception 'V10_SYNTHETIC_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'V10_SYNTHETIC_ROLLBACK' then
        raise;
      end if;
  end;

  return v_ok;
end;
$$;

revoke all on function private.perception_scenario_utility_self_test()
  from public, anon, authenticated;

create or replace function private.perception_run_synthetic_tests_v3(
  p_iterations integer default 25
)
returns bigint
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  v_run_id bigint;
  v_utility_ok boolean := false;
begin
  v_run_id := private.perception_run_synthetic_tests_v2(p_iterations);

  begin
    v_utility_ok := private.perception_scenario_utility_self_test();
  exception when others then
    v_utility_ok := false;
  end;

  update private.perception_synthetic_test_runs
  set total_checks = total_checks + 1,
      passed_checks = passed_checks + case when v_utility_ok then 1 else 0 end,
      failed_checks = failed_checks + case when v_utility_ok then 0 else 1 end,
      status = case
        when v_utility_ok and failed_checks=0 then 'pass'
        else 'fail'
      end,
      checks = checks || jsonb_build_object(
        'scenario_utility_loop',
        jsonb_build_object(
          'passed',case when v_utility_ok then 1 else 0 end,
          'expected',1,
          'rollback_only',true
        )
      )
  where id=v_run_id;

  return v_run_id;
end;
$$;

revoke all on function private.perception_run_synthetic_tests_v3(integer)
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
    $cron$select private.perception_run_synthetic_tests_v3(25);$cron$
  );
end;
$$;
