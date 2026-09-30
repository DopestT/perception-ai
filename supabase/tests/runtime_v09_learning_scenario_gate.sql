\set ON_ERROR_STOP on

-- Runtime v0.9: accepted learning -> evidence-backed scenario hypotheses.
begin;

select p.user_id::text as v09_user_id,
       p.id::text as v09_project_id
from public.perception_projects p
where p.active is true
  and exists (
    select 1
    from public.perception_objectives o
    join public.perception_routes r
      on r.objective_id=o.id
     and r.project_id=o.project_id
     and r.user_id=o.user_id
    where o.user_id=p.user_id
      and o.project_id=p.id
  )
order by p.created_at
limit 1
\gset

insert into public.perception_learning_candidates(
  user_id, project_id, origin_type, content_hash, title, summary,
  why_it_matters, relevance, impact, novelty, confidence, urgency, noise,
  materiality_score, status, verification_kind, verification_evidence,
  source_refs, affected_belief_ids, affected_route_node_ids,
  first_seen_at, last_seen_at, evaluated_at
)
select
  :'v09_user_id'::uuid,
  :'v09_project_id'::uuid,
  'internal_event',
  md5('v09-accepted-' || g::text) || md5('v09-accepted-b-' || g::text),
  'V09 accepted learning ' || g,
  'V09 accepted learning summary ' || g,
  'Runtime v0.9 selection proof.',
  1,1,1,1,1,0,1,
  'accepted',
  'synthetic_verified',
  jsonb_build_array(jsonb_build_object('kind','synthetic_proof','n',g)),
  jsonb_build_array(jsonb_build_object('kind','synthetic_source','n',g)),
  '[]'::jsonb,
  '[]'::jsonb,
  now() + make_interval(secs => g),
  now() + make_interval(secs => g),
  now()
from generate_series(1,4) g;

insert into public.perception_learning_candidates(
  user_id, project_id, origin_type, content_hash, title, summary,
  why_it_matters, relevance, impact, novelty, confidence, urgency, noise,
  materiality_score, status, verification_kind, verification_evidence,
  source_refs, affected_belief_ids, affected_route_node_ids,
  first_seen_at, last_seen_at, evaluated_at
) values (
  :'v09_user_id'::uuid,
  :'v09_project_id'::uuid,
  'external_item',
  md5('v09-proposed') || md5('v09-proposed-b'),
  'V09 proposed learning',
  'V09 proposed learning must not become an active scenario.',
  'Runtime v0.9 exclusion proof.',
  1,1,1,1,1,0,1,
  'proposed',
  'synthetic_unaccepted',
  '[{"kind":"synthetic_proof"}]'::jsonb,
  '[{"kind":"synthetic_source"}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  now() + interval '1 minute',
  now() + interval '1 minute',
  now()
);

select public.perception_refresh_learning_scenarios_internal(
  :'v09_user_id'::uuid,
  :'v09_project_id'::uuid
);

select (
  count(*) filter (where s.status='active') = 3
  and count(*) filter (where s.status='active') <= 3
  and bool_and(
    case when s.status='active'
      then coalesce((s.route_seed->>'must_revalidate')::boolean,false)
      else true
    end
  )
  and bool_and(
    case when s.status='active'
      then s.route_seed->>'source'='scenario_forge_learning_v0_9'
      else true
    end
  )
  and bool_and(
    case when s.status='active'
      then jsonb_array_length(s.evidence_refs) > 0
      else true
    end
  )
  and bool_and(
    case when s.status='active'
      then exists (
        select 1
        from public.perception_learning_candidates c
        where c.id=(s.route_seed->>'learning_candidate_id')::uuid
          and c.status='accepted'
      )
      else true
    end
  )
) as v09_active_contract_ok
from public.perception_scenarios s
where s.user_id=:'v09_user_id'::uuid
  and s.project_id=:'v09_project_id'::uuid
  and s.scenario_key like 'learning-impact:%'
\gset
\if :v09_active_contract_ok
\else
  \echo 'FAIL: learning Scenario Forge active scenario contract is invalid'
  \quit 1
\endif

select not exists (
  select 1
  from public.perception_scenarios s
  join public.perception_learning_candidates c
    on c.id=(s.route_seed->>'learning_candidate_id')::uuid
  where s.user_id=:'v09_user_id'::uuid
    and s.project_id=:'v09_project_id'::uuid
    and s.scenario_key like 'learning-impact:%'
    and s.status='active'
    and c.status <> 'accepted'
) as v09_unaccepted_excluded_ok
\gset
\if :v09_unaccepted_excluded_ok
\else
  \echo 'FAIL: unaccepted learning became an active scenario'
  \quit 1
\endif

select id::text as v09_candidate_id
from public.perception_learning_candidates
where user_id=:'v09_user_id'::uuid
  and project_id=:'v09_project_id'::uuid
  and title='V09 accepted learning 4'
order by last_seen_at desc
limit 1
\gset

insert into public.perception_learning_ledger(
  user_id, project_id, candidate_id, learning_kind, statement,
  why_it_matters, confidence, source_refs, evidence,
  affected_belief_ids, affected_route_node_ids,
  integration_status, learned_at
) values (
  :'v09_user_id'::uuid,
  :'v09_project_id'::uuid,
  :'v09_candidate_id'::uuid,
  'verification_result',
  'V09 accepted learning activity marker',
  'A newly accepted learning should make Scenario Forge due.',
  1,
  '[{"kind":"synthetic"}]'::jsonb,
  '[{"kind":"synthetic"}]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  'accepted',
  now() + interval '2 minutes'
);

select (
  public.perception_project_activity_at_internal(
    :'v09_user_id'::uuid,
    :'v09_project_id'::uuid
  ) >= (
    select learned_at
    from public.perception_learning_ledger
    where candidate_id=:'v09_candidate_id'::uuid
  )
  and public.perception_project_needs_scenario_refresh_internal(
    :'v09_user_id'::uuid,
    :'v09_project_id'::uuid
  )
) as v09_learning_activity_ok
\gset
\if :v09_learning_activity_ok
\else
  \echo 'FAIL: accepted learning did not make the Project World due for scenario refresh'
  \quit 1
\endif

select (
  has_function_privilege(
    'service_role',
    'public.perception_refresh_learning_scenarios_internal(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.perception_refresh_learning_scenarios_internal(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.perception_refresh_learning_scenarios_internal(uuid,uuid)',
    'execute'
  )
) as v09_privileges_ok
\gset
\if :v09_privileges_ok
\else
  \echo 'FAIL: learning Scenario Forge is exposed outside service_role'
  \quit 1
\endif

rollback;

\echo 'PASS: Runtime v0.9 learning-impact Scenario Forge gate'
