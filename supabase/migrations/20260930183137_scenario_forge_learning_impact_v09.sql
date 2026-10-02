
create or replace function public.perception_refresh_learning_scenarios_internal(
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
  v_candidate public.perception_learning_candidates%rowtype;
  v_intent_keys text[] := array[]::text[];
  v_selected_keys text[] := array[]::text[];
  v_candidate_ids jsonb := '[]'::jsonb;
  v_seed jsonb;
  v_evidence jsonb;
  v_hash text;
  v_key text;
  v_confidence double precision;
  v_expires_at timestamptz;
  v_scenario_id uuid;
  v_count integer := 0;
begin
  if p_user_id is null or p_project_id is null then
    raise exception 'Learning Scenario Forge identifiers are required'
      using errcode = '22023';
  end if;

  select *
  into v_project
  from public.perception_projects
  where id = p_project_id
    and user_id = p_user_id
    and active is true;

  if not found then
    raise exception 'Active Project World not found for user'
      using errcode = '42501';
  end if;

  select *
  into v_objective
  from public.perception_objectives
  where project_id = p_project_id
    and user_id = p_user_id
  order by created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'source', 'scenario_forge_learning_v0_9',
      'scenario_count', 0,
      'reason', 'no_objective'
    );
  end if;

  select *
  into v_route
  from public.perception_routes
  where project_id = p_project_id
    and user_id = p_user_id
    and objective_id = v_objective.id
  order by active desc, version desc, created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'source', 'scenario_forge_learning_v0_9',
      'scenario_count', 0,
      'reason', 'no_route'
    );
  end if;

  for v_candidate in
    select c.*
    from public.perception_learning_candidates c
    where c.user_id = p_user_id
      and c.project_id = p_project_id
      and c.status = 'accepted'
      and c.materiality_score >= 0.65
      and c.confidence >= 0.50
      and c.last_seen_at >= now() - interval '45 days'
    order by
      c.materiality_score desc,
      c.confidence desc,
      c.urgency desc,
      c.last_seen_at desc,
      c.id
    limit 3
  loop
    v_key := 'learning-impact:' || v_candidate.id::text;
    v_selected_keys := array_append(v_selected_keys, v_key);
    v_candidate_ids := v_candidate_ids || jsonb_build_array(v_candidate.id);

    select coalesce(array_agg(word order by first_ord), array[]::text[])
    into v_intent_keys
    from (
      select word, min(ord) as first_ord
      from (
        select
          lower(regexp_replace(token, '[^a-zA-Z0-9_-]+', '', 'g')) as word,
          ord
        from unnest(regexp_split_to_array(
          coalesce(v_objective.statement, '') || ' ' ||
          coalesce(v_candidate.title, '') || ' ' ||
          coalesce(v_candidate.summary, '') || ' ' ||
          coalesce(v_candidate.why_it_matters, ''),
          E'\\s+'
        )) with ordinality as t(token, ord)
      ) tokens
      where char_length(word) >= 4
        and word not in (
          'that','this','with','from','have','will','into','your','what',
          'when','where','which','their','there','about','result','verified'
        )
      group by word
      order by min(ord)
      limit 16
    ) ranked;

    v_confidence := least(
      0.95,
      greatest(
        0.50,
        (v_candidate.confidence * 0.70)
        + (v_candidate.materiality_score * 0.30)
      )
    );

    v_expires_at := now() + case
      when v_candidate.urgency >= 0.75 then interval '6 hours'
      when v_candidate.urgency >= 0.50 then interval '12 hours'
      else interval '24 hours'
    end;

    v_seed := jsonb_build_object(
      'source', 'scenario_forge_learning_v0_9',
      'kind', 'evidence_backed_learning_impact',
      'objective_id', v_objective.id,
      'route_id', v_route.id,
      'route_version', v_route.version,
      'learning_candidate_id', v_candidate.id,
      'learning_origin_type', v_candidate.origin_type,
      'verification_kind', v_candidate.verification_kind,
      'materiality_score', v_candidate.materiality_score,
      'candidate_confidence', v_candidate.confidence,
      'candidate_last_seen_at', v_candidate.last_seen_at,
      'affected_route_node_ids', v_candidate.affected_route_node_ids,
      'desired_reality', v_project.desired_reality,
      'current_reality', v_project.current_reality,
      'revalidation_requirements', jsonb_build_array(
        'Confirm the learning candidate is still accepted.',
        'Confirm the cited evidence is still valid and not contradicted.',
        'Confirm the learning materially changes or improves the current route before using it.'
      ),
      'must_revalidate', true
    );

    v_evidence :=
      case
        when jsonb_typeof(coalesce(v_candidate.source_refs, '[]'::jsonb)) = 'array'
          then coalesce(v_candidate.source_refs, '[]'::jsonb)
        else '[]'::jsonb
      end
      || jsonb_build_array(
        jsonb_build_object(
          'kind', 'learning_candidate',
          'id', v_candidate.id,
          'status', v_candidate.status,
          'verification_kind', v_candidate.verification_kind,
          'verification_evidence', v_candidate.verification_evidence,
          'last_seen_at', v_candidate.last_seen_at
        )
      );

    v_hash := md5(
      v_candidate.content_hash || '|' ||
      v_route.id::text || ':' || v_route.version::text || '|' ||
      coalesce(v_project.current_reality, '')
    );

    insert into public.perception_scenarios(
      user_id, project_id, scenario_key, title, summary, intent_keys,
      route_seed, evidence_refs, confidence, status, storage_class,
      content_hash, source_fingerprint, last_validated_at, expires_at,
      retention_until, updated_at
    ) values (
      p_user_id,
      p_project_id,
      v_key,
      left('Re-evaluate with verified learning: ' || coalesce(nullif(v_candidate.title, ''), 'Material learning'), 500),
      left(
        coalesce(v_candidate.summary, '')
        || case
             when nullif(btrim(coalesce(v_candidate.why_it_matters, '')), '') is null
               then ''
             else ' Why it matters: ' || v_candidate.why_it_matters
           end
        || ' This is a route hypothesis and must be revalidated before use.',
        4000
      ),
      v_intent_keys,
      v_seed,
      v_evidence,
      v_confidence,
      'active',
      'hot',
      v_hash,
      v_candidate.content_hash,
      now(),
      v_expires_at,
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
      retention_until = greatest(
        public.perception_scenarios.retention_until,
        excluded.retention_until
      ),
      updated_at = now()
    returning id into v_scenario_id;

    v_count := v_count + 1;
  end loop;

  update public.perception_scenarios
  set status = 'retired',
      storage_class = 'warm',
      updated_at = now()
  where user_id = p_user_id
    and project_id = p_project_id
    and scenario_key like 'learning-impact:%'
    and status <> 'retired'
    and (
      cardinality(v_selected_keys) = 0
      or not (scenario_key = any(v_selected_keys))
    );

  if v_count > 0 then
    insert into public.perception_model_events(
      user_id, project_id, event_type, payload
    ) values (
      p_user_id,
      p_project_id,
      'scenario.learning_forged',
      jsonb_build_object(
        'source', 'scenario_forge_learning_v0_9',
        'objective_id', v_objective.id,
        'route_id', v_route.id,
        'scenario_count', v_count,
        'learning_candidate_ids', v_candidate_ids,
        'must_revalidate', true
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'source', 'scenario_forge_learning_v0_9',
    'scenario_count', v_count,
    'learning_candidate_ids', v_candidate_ids
  );
end;
$$;

revoke all on function public.perception_refresh_learning_scenarios_internal(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.perception_refresh_learning_scenarios_internal(uuid,uuid)
  to service_role;

create or replace function public.perception_project_activity_at_internal(
  p_user_id uuid,
  p_project_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(
    p.updated_at,
    coalesce((
      select max(r.created_at)
      from public.perception_routes r
      where r.user_id = p_user_id
        and r.project_id = p_project_id
    ), '-infinity'::timestamptz),
    coalesce((
      select max(n.updated_at)
      from public.perception_route_nodes n
      where n.user_id = p_user_id
        and n.project_id = p_project_id
    ), '-infinity'::timestamptz),
    coalesce((
      select max(e.created_at)
      from public.perception_execution_ledger e
      where e.user_id = p_user_id
        and e.project_id = p_project_id
    ), '-infinity'::timestamptz),
    coalesce((
      select max(ep.created_at)
      from public.perception_epistemic_ledger ep
      where ep.user_id = p_user_id
        and ep.project_id = p_project_id
    ), '-infinity'::timestamptz),
    coalesce((
      select max(a.updated_at)
      from public.perception_artifacts a
      where a.user_id = p_user_id
        and a.project_id = p_project_id
    ), '-infinity'::timestamptz),
    coalesce((
      select max(l.learned_at)
      from public.perception_learning_ledger l
      where l.user_id = p_user_id
        and l.project_id = p_project_id
        and l.integration_status = 'accepted'
    ), '-infinity'::timestamptz)
  )
  from public.perception_projects p
  where p.id = p_project_id
    and p.user_id = p_user_id;
$$;

revoke all on function public.perception_project_activity_at_internal(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.perception_project_activity_at_internal(uuid,uuid)
  to service_role;

create or replace function public.perception_refresh_idle_scenarios_internal(
  p_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 20));
  v_project record;
  v_result jsonb;
  v_learning_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_refreshed integer := 0;
  v_skipped_recent integer := 0;
begin
  for v_project in
    select
      p.user_id,
      p.id as project_id,
      public.perception_project_activity_at_internal(
        p.user_id,
        p.id
      ) as activity_at
    from public.perception_projects p
    where p.active is true
      and public.perception_project_needs_scenario_refresh_internal(
        p.user_id,
        p.id
      )
    order by
      coalesce((
        select min(s.expires_at)
        from public.perception_scenarios s
        where s.user_id = p.user_id
          and s.project_id = p.id
          and s.status = 'active'
      ), '-infinity'::timestamptz) asc,
      p.updated_at desc
    limit v_limit
  loop
    if v_project.activity_at is not null
       and v_project.activity_at > now() - interval '5 minutes' then
      v_skipped_recent := v_skipped_recent + 1;
      continue;
    end if;

    begin
      v_result := public.perception_refresh_scenario_forge_internal(
        v_project.user_id,
        v_project.project_id
      );

      begin
        v_learning_result :=
          public.perception_refresh_learning_scenarios_internal(
            v_project.user_id,
            v_project.project_id
          );
      exception
        when others then
          v_learning_result := jsonb_build_object(
            'ok', false,
            'source', 'scenario_forge_learning_v0_9',
            'error', sqlstate
          );
      end;

      v_results := v_results || jsonb_build_array(
        jsonb_build_object(
          'project_id', v_project.project_id,
          'activity_at', v_project.activity_at,
          'route_result', v_result,
          'learning_result', v_learning_result
        )
      );
      v_refreshed := v_refreshed + 1;
    exception
      when others then
        v_results := v_results || jsonb_build_array(
          jsonb_build_object(
            'project_id', v_project.project_id,
            'activity_at', v_project.activity_at,
            'error', sqlstate
          )
        );
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'source', 'scenario_forge_idle_v0_7',
    'runtime_version', 'scenario_forge_learning_v0_9',
    'limit', v_limit,
    'refreshed', v_refreshed,
    'skipped_recent', v_skipped_recent,
    'projects', v_results
  );
end;
$$;

revoke all on function public.perception_refresh_idle_scenarios_internal(integer)
  from public, anon, authenticated;
grant execute on function public.perception_refresh_idle_scenarios_internal(integer)
  to service_role;
