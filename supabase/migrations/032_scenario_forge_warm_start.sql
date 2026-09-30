-- Runtime v0.6 Scenario Forge + Warm Start.
-- Keeps compact, deduplicated route hypotheses in Project World so a future
-- objective can begin from a fresh scenario instead of recomputing from zero.

create table if not exists public.perception_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  scenario_key text not null check (char_length(btrim(scenario_key)) between 1 and 160),
  title text not null check (char_length(btrim(title)) between 1 and 500),
  summary text not null default '',
  intent_keys text[] not null default array[]::text[],
  route_seed jsonb not null default '{}'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  confidence double precision not null default 0.5 check (confidence >= 0 and confidence <= 1),
  status text not null default 'active' check (status in ('active','stale','retired')),
  storage_class text not null default 'hot' check (storage_class in ('hot','warm','cold')),
  content_hash text not null,
  source_fingerprint text,
  last_validated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  retention_until timestamptz not null default (now() + interval '30 days'),
  use_count integer not null default 0 check (use_count >= 0),
  successful_use_count integer not null default 0 check (successful_use_count >= 0),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id, scenario_key)
);

create index if not exists perception_scenarios_warm_idx
  on public.perception_scenarios(user_id, project_id, status, expires_at desc, confidence desc);

create index if not exists perception_scenarios_hash_idx
  on public.perception_scenarios(project_id, content_hash);

alter table public.perception_scenarios enable row level security;

drop policy if exists "Users can read their own Perception scenarios" on public.perception_scenarios;
create policy "Users can read their own Perception scenarios"
  on public.perception_scenarios
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.perception_scenarios from anon;
revoke insert, update, delete on table public.perception_scenarios from authenticated;
grant select on table public.perception_scenarios to authenticated;

create or replace function public.perception_refresh_scenario_forge_internal(
  p_user_id uuid,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.perception_projects%rowtype;
  v_objective public.perception_objectives%rowtype;
  v_route public.perception_routes%rowtype;
  v_next_nodes jsonb := '[]'::jsonb;
  v_blocked_nodes jsonb := '[]'::jsonb;
  v_intent_keys text[] := array[]::text[];
  v_seed jsonb;
  v_hash text;
  v_primary_id uuid;
  v_blocker_id uuid;
  v_scenario_count integer := 0;
begin
  if p_user_id is null or p_project_id is null then
    raise exception 'Scenario Forge identifiers are required' using errcode = '22023';
  end if;

  select *
  into v_project
  from public.perception_projects
  where id = p_project_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Project World not found for user' using errcode = '42501';
  end if;

  select *
  into v_objective
  from public.perception_objectives
  where project_id = p_project_id
    and user_id = p_user_id
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'scenario_count', 0, 'reason', 'no_objective');
  end if;

  select *
  into v_route
  from public.perception_routes
  where project_id = p_project_id
    and objective_id = v_objective.id
    and user_id = p_user_id
  order by active desc, version desc, created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'scenario_count', 0, 'reason', 'no_route');
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'route_node_id', n.id,
      'label', n.label,
      'outcome', n.outcome,
      'status', n.status,
      'capability', n.capability,
      'permission_level', n.permission_level,
      'blocker', n.blocker,
      'sort_order', n.sort_order
    )
    order by n.sort_order, n.created_at
  ), '[]'::jsonb)
  into v_next_nodes
  from (
    select *
    from public.perception_route_nodes
    where route_id = v_route.id
      and user_id = p_user_id
      and status not in ('completed','skipped','superseded')
    order by sort_order, created_at
    limit 8
  ) n;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'route_node_id', n.id,
      'label', n.label,
      'outcome', n.outcome,
      'capability', n.capability,
      'permission_level', n.permission_level,
      'blocker', n.blocker,
      'sort_order', n.sort_order
    )
    order by n.sort_order, n.created_at
  ), '[]'::jsonb)
  into v_blocked_nodes
  from (
    select *
    from public.perception_route_nodes
    where route_id = v_route.id
      and user_id = p_user_id
      and status in ('blocked','failed','awaiting_approval')
    order by sort_order, created_at
    limit 8
  ) n;

  select coalesce(array_agg(word order by first_ord), array[]::text[])
  into v_intent_keys
  from (
    select word, min(ord) as first_ord
    from (
      select
        lower(regexp_replace(token, '[^a-zA-Z0-9_-]+', '', 'g')) as word,
        ord
      from unnest(regexp_split_to_array(coalesce(v_objective.statement, ''), E'\\s+'))
        with ordinality as t(token, ord)
    ) tokens
    where char_length(word) >= 4
    group by word
    order by min(ord)
    limit 12
  ) ranked;

  v_seed := jsonb_build_object(
    'source', 'scenario_forge_v0_6',
    'objective_id', v_objective.id,
    'route_id', v_route.id,
    'route_version', v_route.version,
    'desired_reality', v_project.desired_reality,
    'current_reality', v_project.current_reality,
    'next_nodes', v_next_nodes,
    'must_revalidate', true
  );

  v_hash := md5(
    coalesce(v_objective.statement, '') || '|' ||
    coalesce(v_project.current_reality, '') || '|' ||
    coalesce(v_project.desired_reality, '') || '|' ||
    v_seed::text
  );

  insert into public.perception_scenarios(
    user_id, project_id, scenario_key, title, summary, intent_keys,
    route_seed, evidence_refs, confidence, status, storage_class,
    content_hash, source_fingerprint, last_validated_at, expires_at,
    retention_until, updated_at
  ) values (
    p_user_id,
    p_project_id,
    'continue-active-route',
    'Continue current verified route',
    left(
      'Warm-start route hypothesis derived from the latest verified Project World and active route. '
      || coalesce(v_route.reason, ''),
      4000
    ),
    v_intent_keys,
    v_seed,
    jsonb_build_array(
      jsonb_build_object('kind','project_world','project_id',p_project_id),
      jsonb_build_object('kind','route','route_id',v_route.id,'version',v_route.version)
    ),
    0.90,
    'active',
    'hot',
    v_hash,
    md5(v_route.id::text || ':' || v_route.version::text),
    now(),
    now() + interval '12 hours',
    now() + interval '30 days',
    now()
  )
  on conflict (user_id, project_id, scenario_key)
  do update set
    title = excluded.title,
    summary = excluded.summary,
    intent_keys = excluded.intent_keys,
    route_seed = excluded.route_seed,
    evidence_refs = excluded.evidence_refs,
    confidence = excluded.confidence,
    status = 'active',
    storage_class = 'hot',
    content_hash = excluded.content_hash,
    source_fingerprint = excluded.source_fingerprint,
    last_validated_at = now(),
    expires_at = excluded.expires_at,
    retention_until = greatest(public.perception_scenarios.retention_until, excluded.retention_until),
    updated_at = now()
  returning id into v_primary_id;

  v_scenario_count := v_scenario_count + 1;

  if jsonb_array_length(v_blocked_nodes) > 0 then
    v_seed := jsonb_build_object(
      'source', 'scenario_forge_v0_6',
      'objective_id', v_objective.id,
      'route_id', v_route.id,
      'route_version', v_route.version,
      'desired_reality', v_project.desired_reality,
      'current_reality', v_project.current_reality,
      'blocked_nodes', v_blocked_nodes,
      'must_revalidate', true
    );

    v_hash := md5(v_blocked_nodes::text || '|' || coalesce(v_project.current_reality, ''));

    insert into public.perception_scenarios(
      user_id, project_id, scenario_key, title, summary, intent_keys,
      route_seed, evidence_refs, confidence, status, storage_class,
      content_hash, source_fingerprint, last_validated_at, expires_at,
      retention_until, updated_at
    ) values (
      p_user_id,
      p_project_id,
      'resolve-active-blockers',
      'Resolve active blockers',
      'Warm-start blocker scenario derived from current blocked, failed, or approval-gated route nodes.',
      v_intent_keys,
      v_seed,
      jsonb_build_array(
        jsonb_build_object('kind','route_blockers','route_id',v_route.id)
      ),
      0.82,
      'active',
      'hot',
      v_hash,
      md5(v_route.id::text || ':blockers:' || v_route.version::text),
      now(),
      now() + interval '4 hours',
      now() + interval '14 days',
      now()
    )
    on conflict (user_id, project_id, scenario_key)
    do update set
      summary = excluded.summary,
      intent_keys = excluded.intent_keys,
      route_seed = excluded.route_seed,
      evidence_refs = excluded.evidence_refs,
      confidence = excluded.confidence,
      status = 'active',
      storage_class = 'hot',
      content_hash = excluded.content_hash,
      source_fingerprint = excluded.source_fingerprint,
      last_validated_at = now(),
      expires_at = excluded.expires_at,
      retention_until = greatest(public.perception_scenarios.retention_until, excluded.retention_until),
      updated_at = now()
    returning id into v_blocker_id;

    v_scenario_count := v_scenario_count + 1;
  else
    update public.perception_scenarios
    set status = 'retired',
        storage_class = 'warm',
        updated_at = now()
    where user_id = p_user_id
      and project_id = p_project_id
      and scenario_key = 'resolve-active-blockers'
      and status <> 'retired';
  end if;

  update public.perception_scenarios
  set status = 'stale',
      storage_class = case when storage_class = 'hot' then 'warm' else storage_class end,
      updated_at = now()
  where user_id = p_user_id
    and project_id = p_project_id
    and status = 'active'
    and expires_at <= now();

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (
    p_user_id,
    p_project_id,
    'scenario.forged',
    jsonb_build_object(
      'source','scenario_forge_v0_6',
      'objective_id',v_objective.id,
      'route_id',v_route.id,
      'scenario_count',v_scenario_count,
      'scenario_ids',jsonb_strip_nulls(jsonb_build_object(
        'continue_active_route',v_primary_id,
        'resolve_active_blockers',v_blocker_id
      ))
    )
  );

  return jsonb_build_object(
    'ok', true,
    'scenario_count', v_scenario_count,
    'continue_active_route_id', v_primary_id,
    'resolve_active_blockers_id', v_blocker_id
  );
end;
$$;

revoke all on function public.perception_refresh_scenario_forge_internal(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.perception_refresh_scenario_forge_internal(uuid,uuid)
  to service_role;

create or replace function public.perception_get_warm_start(
  p_project_id uuid,
  p_objective_text text,
  p_limit integer default 3
)
returns jsonb
language plpgsql
security definer
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

  select coalesce(jsonb_agg(to_jsonb(r) order by r.match_count desc, r.confidence desc, r.last_validated_at desc), '[]'::jsonb)
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
      true as is_fresh,
      (
        select count(*)::integer
        from unnest(s.intent_keys) as k
        where lower(coalesce(p_objective_text, '')) like ('%' || lower(k) || '%')
      ) as match_count,
      case
        when s.use_count = 0 then null
        else round((s.successful_use_count::numeric / s.use_count::numeric), 4)
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
        where lower(coalesce(p_objective_text, '')) like ('%' || lower(k) || '%')
      ) desc,
      s.confidence desc,
      s.last_validated_at desc
    limit v_limit
  ) r;

  return jsonb_build_object(
    'project_id', p_project_id,
    'scenario_count', jsonb_array_length(v_scenarios),
    'scenarios', v_scenarios,
    'source', 'scenario_forge_v0_6'
  );
end;
$$;

revoke all on function public.perception_get_warm_start(uuid,text,integer)
  from public, anon;
grant execute on function public.perception_get_warm_start(uuid,text,integer)
  to authenticated;
