create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.perception_scenario_uses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  objective_id uuid not null references public.perception_objectives(id) on delete cascade,
  route_id uuid not null references public.perception_routes(id) on delete cascade,
  scenario_id uuid not null references public.perception_scenarios(id) on delete cascade,
  selected_scenario_key text not null,
  selected_at timestamptz not null default now(),
  succeeded_at timestamptz,
  success_execution_entry_id uuid references public.perception_execution_ledger(id) on delete set null,
  unique (user_id, project_id, objective_id, route_id, scenario_id)
);

create index if not exists perception_scenario_uses_route_idx
  on private.perception_scenario_uses(user_id, project_id, objective_id, route_id);

create index if not exists perception_scenario_uses_scenario_idx
  on private.perception_scenario_uses(scenario_id, selected_at desc);

revoke all on table private.perception_scenario_uses from public, anon, authenticated;
grant select, insert, update, delete on table private.perception_scenario_uses to service_role;

create or replace function public.perception_record_scenario_selection_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_objective_id uuid,
  p_route_id uuid,
  p_selected_scenario_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_key text := btrim(coalesce(p_selected_scenario_key, ''));
  v_scenario public.perception_scenarios%rowtype;
  v_shadow_id uuid;
  v_use_id uuid;
  v_recorded boolean := false;
begin
  if p_user_id is null
     or p_project_id is null
     or p_objective_id is null
     or p_route_id is null
     or char_length(v_key) < 3 then
    raise exception 'Scenario utility identifiers are required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.perception_routes r
    where r.id = p_route_id
      and r.user_id = p_user_id
      and r.project_id = p_project_id
      and r.objective_id = p_objective_id
  ) then
    raise exception 'Scenario utility route is outside the Project World'
      using errcode = '42501';
  end if;

  if v_key ~* '^intent-shadow:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_shadow_id := substring(v_key from length('intent-shadow:') + 1)::uuid;

    select *
    into v_scenario
    from public.perception_scenarios s
    where s.id = v_shadow_id
      and s.user_id = p_user_id
      and s.project_id = p_project_id
      and s.status = 'active'
      and s.expires_at > now()
    limit 1;
  else
    select *
    into v_scenario
    from public.perception_scenarios s
    where s.user_id = p_user_id
      and s.project_id = p_project_id
      and s.scenario_key = v_key
      and s.status = 'active'
      and s.expires_at > now()
    limit 1;
  end if;

  if v_scenario.id is null then
    return jsonb_build_object(
      'ok', false,
      'recorded', false,
      'reason', 'scenario_not_found_or_stale',
      'selected_scenario_key', v_key
    );
  end if;

  insert into private.perception_scenario_uses(
    user_id,
    project_id,
    objective_id,
    route_id,
    scenario_id,
    selected_scenario_key
  ) values (
    p_user_id,
    p_project_id,
    p_objective_id,
    p_route_id,
    v_scenario.id,
    v_key
  )
  on conflict (user_id, project_id, objective_id, route_id, scenario_id)
  do nothing
  returning id into v_use_id;

  if v_use_id is not null then
    v_recorded := true;

    update public.perception_scenarios
    set use_count = use_count + 1,
        last_used_at = now(),
        updated_at = now()
    where id = v_scenario.id;
  else
    select u.id
    into v_use_id
    from private.perception_scenario_uses u
    where u.user_id = p_user_id
      and u.project_id = p_project_id
      and u.objective_id = p_objective_id
      and u.route_id = p_route_id
      and u.scenario_id = v_scenario.id
    limit 1;
  end if;

  select *
  into v_scenario
  from public.perception_scenarios
  where id = v_scenario.id;

  return jsonb_build_object(
    'ok', true,
    'recorded', v_recorded,
    'use_id', v_use_id,
    'scenario_id', v_scenario.id,
    'scenario_key', v_scenario.scenario_key,
    'selected_scenario_key', v_key,
    'use_count', v_scenario.use_count,
    'successful_use_count', v_scenario.successful_use_count,
    'utility_score', round(
      ((v_scenario.successful_use_count + 1)::numeric
        / (v_scenario.use_count + 2)::numeric),
      4
    )
  );
end;
$$;

revoke all on function public.perception_record_scenario_selection_internal(
  uuid,uuid,uuid,uuid,text
) from public, anon, authenticated;
grant execute on function public.perception_record_scenario_selection_internal(
  uuid,uuid,uuid,uuid,text
) to service_role;

create or replace function private.perception_capture_scenario_success()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_scenario_id uuid;
begin
  if new.phase <> 'verified'
     or new.objective_id is null
     or new.route_id is null then
    return new;
  end if;

  for v_scenario_id in
    update private.perception_scenario_uses u
    set succeeded_at = coalesce(u.succeeded_at, now()),
        success_execution_entry_id = coalesce(
          u.success_execution_entry_id,
          new.id
        )
    where u.user_id = new.user_id
      and u.project_id = new.project_id
      and u.objective_id = new.objective_id
      and u.route_id = new.route_id
      and u.succeeded_at is null
    returning u.scenario_id
  loop
    update public.perception_scenarios s
    set successful_use_count = successful_use_count + 1,
        updated_at = now()
    where s.id = v_scenario_id;
  end loop;

  return new;
end;
$$;

revoke all on function private.perception_capture_scenario_success()
  from public, anon, authenticated;

drop trigger if exists perception_capture_scenario_success_trigger
  on public.perception_execution_ledger;

create trigger perception_capture_scenario_success_trigger
after insert on public.perception_execution_ledger
for each row
when (new.phase = 'verified')
execute function private.perception_capture_scenario_success();

create or replace function public.perception_get_warm_start(
  p_project_id uuid,
  p_objective_text text,
  p_limit integer default 3
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 3), 8));
  v_scenarios jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.perception_projects
    where id = p_project_id
      and user_id = v_user_id
  ) then
    raise exception 'Project World not found for user' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(r)
      order by
        r.match_count desc,
        r.utility_score desc,
        r.confidence desc,
        r.last_validated_at desc
    ),
    '[]'::jsonb
  )
  into v_scenarios
  from (
    select
      s.id,
      s.scenario_key,
      s.title,
      s.summary,
      s.intent_keys,
      s.route_seed,
      s.evidence_refs,
      s.confidence,
      s.last_validated_at,
      s.expires_at,
      s.use_count,
      s.successful_use_count,
      true as is_fresh,
      (
        select count(*)::integer
        from unnest(s.intent_keys) as k
        where lower(coalesce(p_objective_text, ''))
          like ('%' || lower(k) || '%')
      ) as match_count,
      round(
        ((s.successful_use_count + 1)::numeric
          / (s.use_count + 2)::numeric),
        4
      ) as utility_score,
      case
        when s.use_count = 0 then null
        else round(
          (s.successful_use_count::numeric / s.use_count::numeric),
          4
        )
      end as historical_success_rate
    from public.perception_scenarios s
    where s.user_id = v_user_id
      and s.project_id = p_project_id
      and s.status = 'active'
      and s.expires_at > now()
    order by
      (
        select count(*)
        from unnest(s.intent_keys) as k
        where lower(coalesce(p_objective_text, ''))
          like ('%' || lower(k) || '%')
      ) desc,
      ((s.successful_use_count + 1)::numeric
        / (s.use_count + 2)::numeric) desc,
      s.confidence desc,
      s.last_validated_at desc
    limit v_limit
  ) r;

  return jsonb_build_object(
    'project_id', p_project_id,
    'scenario_count', jsonb_array_length(v_scenarios),
    'scenarios', v_scenarios,
    'source', 'scenario_forge_v0_6',
    'ranking', 'utility_learning_v0_10'
  );
end;
$$;

revoke all on function public.perception_get_warm_start(uuid,text,integer)
  from public, anon;
grant execute on function public.perception_get_warm_start(uuid,text,integer)
  to authenticated;
