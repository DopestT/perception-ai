-- Runtime v0.8: Anticipatory Retrieval / Intent Shadow.
-- Read-only, owner-scoped retrieval for provisional text while the user types.
-- No keystrokes or shadow results are persisted.

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
  ranked as (
    select
      ps.*,
      coalesce(sr.best_scenario_match, 0) as scenario_match_count,
      (
        ps.project_match_count * 2
        + coalesce(sr.best_scenario_match, 0) * 3
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
      ) as scenarios
    from project_scores ps
    left join scenario_rollup sr on sr.project_id = ps.id
  ),
  top_projects as (
    select *
    from ranked
    where project_match_count > 0
       or scenario_match_count > 0
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
        'relevance_score', relevance_score,
        'scenarios', scenarios
      )
      order by relevance_score desc, updated_at desc
    ),
    '[]'::jsonb
  )
  into v_candidates
  from top_projects;

  return jsonb_build_object(
    'source', 'intent_shadow_v0_8',
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
