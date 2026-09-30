create or replace function public.perception_preview_intent_shadow(
  p_text text,
  p_mode text default 'perceive',
  p_limit integer default 3
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_text text := left(btrim(coalesce(p_text, '')), 1000);
  v_mode text := case
    when p_mode in ('discover', 'perceive', 'search', 'forecast') then p_mode
    else 'perceive'
  end;
  v_limit integer := greatest(1, least(coalesce(p_limit, 3), 5));
  v_candidates jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(v_text) < 3 then
    return jsonb_build_object(
      'source', 'intent_shadow_v0_8',
      'retrieval_version', 'anticipatory_learning_v0_12',
      'mode', v_mode,
      'query_length', char_length(v_text),
      'candidate_count', 0,
      'candidates', '[]'::jsonb,
      'ephemeral', true
    );
  end if;

  with token_source as (
    select distinct token
    from (
      select lower(token) as token
      from regexp_split_to_table(v_text, '[^a-zA-Z0-9_-]+') as token
    ) raw
    where char_length(token) >= 3
      and token not in (
        'the','and','for','with','that','this','from','into','have','want','need',
        'make','create','build','about','what','when','where','which','while',
        'your','you','our','are','was','were','will','would','could','should'
      )
    limit 24
  ),
  project_scores as (
    select
      p.id,
      p.name,
      p.current_reality,
      p.desired_reality,
      p.updated_at,
      (
        select count(*)::integer
        from token_source t
        where lower(
          coalesce(p.name, '') || ' ' ||
          coalesce(p.current_reality, '') || ' ' ||
          coalesce(p.desired_reality, '')
        ) like ('%' || t.token || '%')
      ) as project_match_count
    from public.perception_projects p
    where p.user_id = v_user_id
      and p.active is true
  ),
  scenario_rows as (
    select
      s.project_id,
      s.id,
      s.scenario_key,
      s.title,
      s.summary,
      s.confidence,
      s.expires_at,
      (
        select count(*)::integer
        from token_source t
        where t.token = any(s.intent_keys)
          or lower(coalesce(s.title, '') || ' ' || coalesce(s.summary, ''))
             like ('%' || t.token || '%')
      ) as match_count
    from public.perception_scenarios s
    where s.user_id = v_user_id
      and s.status = 'active'
      and s.expires_at > now()
  ),
  scenario_rollup as (
    select
      sr.project_id,
      max(sr.match_count)::integer as best_scenario_match,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', sr.id,
            'scenario_key', sr.scenario_key,
            'title', sr.title,
            'confidence', sr.confidence,
            'match_count', sr.match_count,
            'expires_at', sr.expires_at,
            'must_revalidate', true
          )
          order by sr.match_count desc, sr.confidence desc, sr.expires_at desc
        ) filter (where sr.match_count > 0),
        '[]'::jsonb
      ) as matched_scenarios
    from scenario_rows sr
    group by sr.project_id
  ),
  learning_rows as (
    select
      c.project_id,
      c.id as candidate_id,
      s.id as scenario_id,
      s.scenario_key,
      c.title,
      c.summary,
      c.why_it_matters,
      c.confidence,
      c.materiality_score,
      c.verification_kind,
      c.last_seen_at,
      s.expires_at,
      (
        select count(*)::integer
        from token_source t
        where lower(
          coalesce(c.title, '') || ' ' ||
          coalesce(c.summary, '') || ' ' ||
          coalesce(c.why_it_matters, '')
        ) like ('%' || t.token || '%')
      ) as match_count
    from public.perception_learning_candidates c
    join public.perception_scenarios s
      on s.user_id = c.user_id
     and s.project_id = c.project_id
     and s.scenario_key = 'learning-impact:' || c.id::text
     and s.status = 'active'
     and s.expires_at > now()
    where c.user_id = v_user_id
      and c.status = 'accepted'
      and c.materiality_score >= 0.65
      and c.confidence >= 0.50
      and c.last_seen_at >= now() - interval '45 days'
  ),
  learning_rollup as (
    select
      lr.project_id,
      max(lr.match_count)::integer as best_learning_match,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'candidate_id', lr.candidate_id,
            'scenario_id', lr.scenario_id,
            'scenario_key', lr.scenario_key,
            'title', lr.title,
            'confidence', lr.confidence,
            'materiality_score', lr.materiality_score,
            'verification_kind', lr.verification_kind,
            'match_count', lr.match_count,
            'last_seen_at', lr.last_seen_at,
            'expires_at', lr.expires_at,
            'must_revalidate', true
          )
          order by
            lr.match_count desc,
            lr.materiality_score desc,
            lr.confidence desc,
            lr.last_seen_at desc
        ) filter (where lr.match_count > 0),
        '[]'::jsonb
      ) as matched_learning
    from learning_rows lr
    group by lr.project_id
  ),
  ranked as (
    select
      ps.*,
      coalesce(sr.best_scenario_match, 0) as scenario_match_count,
      coalesce(lr.best_learning_match, 0) as learning_match_count,
      (
        ps.project_match_count * 2
        + coalesce(sr.best_scenario_match, 0) * 3
        + coalesce(lr.best_learning_match, 0) * 4
        + case
            when ps.updated_at > now() - interval '7 days' then 2
            when ps.updated_at > now() - interval '30 days' then 1
            else 0
          end
      )::integer as relevance_score,
      coalesce(
        (
          select jsonb_agg(item)
          from (
            select item
            from jsonb_array_elements(coalesce(sr.matched_scenarios, '[]'::jsonb)) item
            order by (item->>'match_count')::integer desc,
                     (item->>'confidence')::double precision desc
            limit 2
          ) top_items
        ),
        '[]'::jsonb
      ) as scenarios,
      coalesce(
        (
          select jsonb_agg(item)
          from (
            select item
            from jsonb_array_elements(coalesce(lr.matched_learning, '[]'::jsonb)) item
            order by
              (item->>'match_count')::integer desc,
              (item->>'materiality_score')::double precision desc,
              (item->>'confidence')::double precision desc
            limit 2
          ) top_items
        ),
        '[]'::jsonb
      ) as learning_candidates
    from project_scores ps
    left join scenario_rollup sr on sr.project_id = ps.id
    left join learning_rollup lr on lr.project_id = ps.id
  ),
  top_projects as (
    select *
    from ranked
    where project_match_count > 0
       or scenario_match_count > 0
       or learning_match_count > 0
    order by relevance_score desc, updated_at desc, id
    limit v_limit
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'project_id', id,
        'name', name,
        'current_reality', left(coalesce(current_reality, ''), 1200),
        'desired_reality', left(coalesce(desired_reality, ''), 1200),
        'updated_at', updated_at,
        'project_match_count', project_match_count,
        'scenario_match_count', scenario_match_count,
        'learning_match_count', learning_match_count,
        'relevance_score', relevance_score,
        'scenarios', scenarios,
        'learning_candidates', learning_candidates
      )
      order by relevance_score desc, updated_at desc
    ),
    '[]'::jsonb
  )
  into v_candidates
  from top_projects;

  return jsonb_build_object(
    'source', 'intent_shadow_v0_8',
    'retrieval_version', 'anticipatory_learning_v0_12',
    'mode', v_mode,
    'query_length', char_length(v_text),
    'candidate_count', jsonb_array_length(v_candidates),
    'candidates', v_candidates,
    'ephemeral', true,
    'prepared_at', now(),
    'valid_for_ms', 60000
  );
end;
$$;

revoke all on function public.perception_preview_intent_shadow(text,text,integer)
  from public, anon;
grant execute on function public.perception_preview_intent_shadow(text,text,integer)
  to authenticated;
