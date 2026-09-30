-- Perception Continuous Mind v0.1
-- Durable study cycles, approved-source ingestion, evidence-backed learning,
-- and an auditable Study / Evolution Ledger.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.perception_continuous_mind_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  enabled boolean not null default true,
  study_interval_minutes integer not null default 60
    check (study_interval_minutes between 15 and 10080),
  materiality_threshold double precision not null default 0.18
    check (materiality_threshold between 0 and 1),
  auto_integrate_threshold double precision not null default 0.35
    check (auto_integrate_threshold between 0 and 1),
  max_sources_per_cycle integer not null default 5
    check (max_sources_per_cycle between 1 and 20),
  max_items_per_source integer not null default 10
    check (max_items_per_source between 1 and 25),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id),
  check (auto_integrate_threshold >= materiality_threshold)
);

create table if not exists public.perception_learning_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  source_type text not null
    check (source_type in ('internal', 'rss', 'atom', 'json_feed', 'webpage', 'api')),
  url text not null,
  enabled boolean not null default true,
  trust_weight double precision not null default 0.75
    check (trust_weight between 0 and 1),
  cadence_minutes integer not null default 60
    check (cadence_minutes between 15 and 10080),
  approved_at timestamptz not null default now(),
  next_scan_at timestamptz not null default now(),
  last_scanned_at timestamptz,
  last_succeeded_at timestamptz,
  etag text,
  last_modified text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, url),
  check (
    (source_type = 'internal' and url = 'internal://project-events')
    or
    (
      source_type <> 'internal'
      and url ~* '^https://'
      and char_length(url) <= 2048
    )
  )
);

create table if not exists public.perception_study_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  source_id uuid references public.perception_learning_sources(id) on delete set null,
  trigger_kind text not null
    check (trigger_kind in ('internal_event', 'scheduled', 'manual', 'backfill')),
  stage text not null default 'observe'
    check (stage in ('observe', 'question', 'research', 'build', 'test', 'evaluate', 'integrate')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'partial', 'failed')),
  run_key text not null unique,
  items_seen integer not null default 0 check (items_seen >= 0),
  items_new integer not null default 0 check (items_new >= 0),
  items_material integer not null default 0 check (items_material >= 0),
  learnings_integrated integer not null default 0 check (learnings_integrated >= 0),
  error text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.perception_learning_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  source_id uuid references public.perception_learning_sources(id) on delete set null,
  study_run_id uuid references public.perception_study_runs(id) on delete set null,
  origin_event_id uuid references public.perception_model_events(id) on delete set null,
  world_signal_id uuid references public.perception_world_signals(id) on delete set null,
  origin_type text not null
    check (origin_type in ('internal_event', 'world_signal', 'external_item')),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  title text not null default '',
  summary text not null check (char_length(btrim(summary)) >= 3),
  why_it_matters text not null default '',
  excerpt text,
  source_url text,
  source_published_at timestamptz,
  relevance double precision not null default 0 check (relevance between 0 and 1),
  impact double precision not null default 0 check (impact between 0 and 1),
  novelty double precision not null default 0 check (novelty between 0 and 1),
  confidence double precision not null default 0 check (confidence between 0 and 1),
  urgency double precision not null default 0 check (urgency between 0 and 1),
  noise double precision not null default 0 check (noise between 0 and 1),
  materiality_score double precision not null default 0 check (materiality_score between 0 and 1),
  status text not null default 'observed'
    check (status in ('observed', 'proposed', 'accepted', 'rejected', 'superseded')),
  verification_kind text not null default 'source_fetch',
  verification_evidence jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  affected_belief_ids jsonb not null default '[]'::jsonb,
  affected_route_node_ids jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  evaluated_at timestamptz,
  reviewed_at timestamptz,
  review_reason text,
  unique (project_id, content_hash),
  unique (origin_event_id)
);

create table if not exists public.perception_learning_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  candidate_id uuid not null unique
    references public.perception_learning_candidates(id) on delete restrict,
  learning_kind text not null
    check (learning_kind in (
      'correction',
      'confirmed_preference',
      'verification_result',
      'route_pattern',
      'world_signal',
      'source_finding',
      'realization'
    )),
  statement text not null check (char_length(btrim(statement)) >= 3),
  why_it_matters text not null default '',
  scope text not null default 'project' check (scope = 'project'),
  confidence double precision not null check (confidence between 0 and 1),
  source_refs jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  contradictions jsonb not null default '[]'::jsonb,
  affected_belief_ids jsonb not null default '[]'::jsonb,
  affected_route_node_ids jsonb not null default '[]'::jsonb,
  integration_status text not null default 'accepted'
    check (integration_status in ('accepted', 'rejected', 'superseded')),
  rollback_instructions text not null default
    'Mark this learning as superseded; preserve its evidence and audit events.',
  learned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Only the service role can read this table. It stores a digest, never the
-- scheduler token itself. The plaintext token remains in Supabase Vault.
create table if not exists public.perception_runtime_secret_hashes (
  secret_name text primary key,
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  rotated_at timestamptz not null default now()
);

create index if not exists perception_mind_policy_project_idx
  on public.perception_continuous_mind_policies(project_id);
create index if not exists perception_learning_sources_due_idx
  on public.perception_learning_sources(next_scan_at)
  where enabled = true and source_type <> 'internal';
create index if not exists perception_learning_sources_project_idx
  on public.perception_learning_sources(project_id, enabled, next_scan_at);
create index if not exists perception_study_runs_project_created_idx
  on public.perception_study_runs(project_id, created_at desc);
create index if not exists perception_study_runs_source_created_idx
  on public.perception_study_runs(source_id, created_at desc);
create index if not exists perception_learning_candidates_project_status_idx
  on public.perception_learning_candidates(project_id, status, materiality_score desc, first_seen_at desc);
create index if not exists perception_learning_ledger_project_learned_idx
  on public.perception_learning_ledger(project_id, learned_at desc);

alter table public.perception_continuous_mind_policies enable row level security;
alter table public.perception_learning_sources enable row level security;
alter table public.perception_study_runs enable row level security;
alter table public.perception_learning_candidates enable row level security;
alter table public.perception_learning_ledger enable row level security;
alter table public.perception_runtime_secret_hashes enable row level security;

create policy perception_mind_policies_select_own
  on public.perception_continuous_mind_policies for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy perception_mind_policies_insert_own
  on public.perception_continuous_mind_policies for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.perception_projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );
create policy perception_mind_policies_update_own
  on public.perception_continuous_mind_policies for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.perception_projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );

create policy perception_learning_sources_select_own
  on public.perception_learning_sources for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy perception_learning_sources_insert_own
  on public.perception_learning_sources for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and source_type <> 'internal'
    and exists (
      select 1
      from public.perception_projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );
create policy perception_learning_sources_update_own
  on public.perception_learning_sources for update
  to authenticated
  using ((select auth.uid()) = user_id and source_type <> 'internal')
  with check (
    (select auth.uid()) = user_id
    and source_type <> 'internal'
    and exists (
      select 1
      from public.perception_projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    )
  );
create policy perception_learning_sources_delete_own
  on public.perception_learning_sources for delete
  to authenticated
  using ((select auth.uid()) = user_id and source_type <> 'internal');

create policy perception_study_runs_select_own
  on public.perception_study_runs for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy perception_learning_candidates_select_own
  on public.perception_learning_candidates for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy perception_learning_ledger_select_own
  on public.perception_learning_ledger for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.perception_continuous_mind_policies from public, anon, authenticated;
revoke all on public.perception_learning_sources from public, anon, authenticated;
revoke all on public.perception_study_runs from public, anon, authenticated;
revoke all on public.perception_learning_candidates from public, anon, authenticated;
revoke all on public.perception_learning_ledger from public, anon, authenticated;
revoke all on public.perception_runtime_secret_hashes from public, anon, authenticated;

grant select, insert, update on public.perception_continuous_mind_policies to authenticated;
grant select, insert, update, delete on public.perception_learning_sources to authenticated;
grant select on public.perception_study_runs to authenticated;
grant select on public.perception_learning_candidates to authenticated;
grant select on public.perception_learning_ledger to authenticated;
grant all on public.perception_continuous_mind_policies to service_role;
grant all on public.perception_learning_sources to service_role;
grant all on public.perception_study_runs to service_role;
grant all on public.perception_learning_candidates to service_role;
grant all on public.perception_learning_ledger to service_role;
grant select on public.perception_runtime_secret_hashes to service_role;

create or replace function public.perception_touch_continuous_mind_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.perception_touch_continuous_mind_updated_at()
  from public, anon, authenticated;

create trigger perception_mind_policy_touch_updated_at
before update on public.perception_continuous_mind_policies
for each row execute function public.perception_touch_continuous_mind_updated_at();

create trigger perception_learning_source_touch_updated_at
before update on public.perception_learning_sources
for each row execute function public.perception_touch_continuous_mind_updated_at();

create or replace function public.perception_learning_score(
  p_relevance double precision,
  p_impact double precision,
  p_novelty double precision,
  p_confidence double precision,
  p_urgency double precision,
  p_noise double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select greatest(
    0::double precision,
    least(
      1::double precision,
      (
        greatest(0::double precision, least(1::double precision, p_relevance))
        * greatest(0::double precision, least(1::double precision, p_impact))
        * greatest(0::double precision, least(1::double precision, p_novelty))
        * greatest(0::double precision, least(1::double precision, p_confidence))
        * greatest(0::double precision, least(1::double precision, p_urgency))
      ) - greatest(0::double precision, least(1::double precision, p_noise))
    )
  );
$$;

revoke all on function public.perception_learning_score(
  double precision, double precision, double precision,
  double precision, double precision, double precision
) from public, anon;
grant execute on function public.perception_learning_score(
  double precision, double precision, double precision,
  double precision, double precision, double precision
) to authenticated, service_role;

create or replace function public.perception_initialize_continuous_mind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perception_continuous_mind_policies(user_id, project_id)
  values (new.user_id, new.id)
  on conflict (user_id, project_id) do nothing;

  insert into public.perception_learning_sources(
    user_id, project_id, label, source_type, url, trust_weight, cadence_minutes
  )
  values (
    new.user_id, new.id, 'Verified Project World events',
    'internal', 'internal://project-events', 1, 15
  )
  on conflict (project_id, url) do nothing;

  return new;
end;
$$;

revoke all on function public.perception_initialize_continuous_mind() from public, anon, authenticated;

drop trigger if exists perception_initialize_continuous_mind_trigger
  on public.perception_projects;
create trigger perception_initialize_continuous_mind_trigger
after insert on public.perception_projects
for each row execute function public.perception_initialize_continuous_mind();

insert into public.perception_continuous_mind_policies(user_id, project_id)
select p.user_id, p.id
from public.perception_projects p
on conflict (user_id, project_id) do nothing;

insert into public.perception_learning_sources(
  user_id, project_id, label, source_type, url, trust_weight, cadence_minutes
)
select p.user_id, p.id, 'Verified Project World events',
       'internal', 'internal://project-events', 1, 15
from public.perception_projects p
on conflict (project_id, url) do nothing;

create or replace function public.perception_capture_learning_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_run_id uuid;
  v_candidate_id uuid;
  v_statement text;
  v_why text;
  v_kind text;
  v_evidence jsonb := '[]'::jsonb;
  v_source_refs jsonb := '[]'::jsonb;
  v_affected_beliefs jsonb := '[]'::jsonb;
  v_affected_nodes jsonb := '[]'::jsonb;
  v_confidence double precision := 1;
  v_hash text;
  v_ref text;
  v_verification_id uuid;
  v_signal_id uuid;
  v_belief_id uuid;
  v_objective_id uuid;
begin
  if new.event_type like 'learning.%'
     or new.event_type like 'study.%'
     or new.event_type like 'continuous_mind.%' then
    return new;
  end if;

  if new.event_type in ('verification.passed', 'verification.failed') then
    v_ref := new.payload ->> 'verification_id';
    if v_ref is null or v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return new;
    end if;
    v_verification_id := v_ref::uuid;

    select
      case
        when v.passed then 'Verified result: ' || coalesce(n.outcome, n.label, 'route step completed')
        else 'Failed verification: ' || coalesce(n.label, n.outcome, 'route step')
      end,
      case
        when v.passed then 'This outcome passed its completion contract and may inform future routing.'
        else 'The failed completion contract should change retries, routing, or the next test.'
      end,
      coalesce(v.evidence, '[]'::jsonb),
      jsonb_build_array(jsonb_build_object(
        'kind', 'verification_run',
        'id', v.id,
        'checked_at', v.checked_at
      )),
      jsonb_build_array(v.route_node_id),
      case when v.passed then 'verification_result' else 'route_pattern' end
    into v_statement, v_why, v_evidence, v_source_refs, v_affected_nodes, v_kind
    from public.perception_verification_runs v
    left join public.perception_route_nodes n on n.id = v.route_node_id
    where v.id = v_verification_id
      and v.user_id = new.user_id
      and v.project_id = new.project_id;
  elsif new.event_type = 'world_signal.verified' then
    v_ref := new.payload ->> 'signal_id';
    if v_ref is null or v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return new;
    end if;
    v_signal_id := v_ref::uuid;

    -- External study candidates already own their learning-ledger entry. Their
    -- verified world-signal event still drives route adaptation, but must not
    -- create a second candidate for the same finding.
    if exists (
      select 1
      from public.perception_world_signals signal
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(signal.source_refs) = 'array'
          then signal.source_refs else '[]'::jsonb end
      ) source_ref
      where signal.id = v_signal_id
        and source_ref ->> 'kind' = 'continuous_mind_candidate'
    ) then
      return new;
    end if;

    select
      s.summary,
      'This verified change can affect the active Reality Route.',
      s.source_refs,
      s.affected_belief_ids,
      s.affected_route_node_ids,
      s.confidence
    into v_statement, v_why, v_source_refs, v_affected_beliefs, v_affected_nodes, v_confidence
    from public.perception_world_signals s
    where s.id = v_signal_id
      and s.user_id = new.user_id
      and s.project_id = new.project_id;
    v_evidence := v_source_refs;
    v_kind := 'world_signal';
  elsif new.event_type in ('belief.confirmed', 'belief.rejected', 'belief.contradicted') then
    v_ref := new.payload ->> 'belief_id';
    if v_ref is null or v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return new;
    end if;
    v_belief_id := v_ref::uuid;

    select
      case
        when new.event_type = 'belief.confirmed' then 'Confirmed: ' || b.statement
        else 'Correction recorded: ' || b.statement
      end,
      'Explicit belief changes must alter future interpretation and routing.',
      coalesce(b.evidence, '[]'::jsonb),
      jsonb_build_array(jsonb_build_object(
        'kind', 'belief',
        'id', b.id,
        'state', b.state
      )),
      jsonb_build_array(b.id),
      case when new.event_type = 'belief.confirmed' then 'confirmed_preference' else 'correction' end
    into v_statement, v_why, v_evidence, v_source_refs, v_affected_beliefs, v_kind
    from public.perception_beliefs b
    where b.id = v_belief_id
      and b.user_id = new.user_id
      and b.project_id = new.project_id;
  elsif new.event_type = 'objective.realized' then
    v_ref := new.payload ->> 'objective_id';
    if v_ref is null or v_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return new;
    end if;
    v_objective_id := v_ref::uuid;

    select
      'Realized objective: ' || o.statement,
      'The verified route pattern that realized this objective can improve similar future routes.',
      o.source_refs,
      jsonb_build_array(jsonb_build_object('kind', 'objective', 'id', o.id))
    into v_statement, v_why, v_evidence, v_source_refs
    from public.perception_objectives o
    where o.id = v_objective_id
      and o.user_id = new.user_id
      and o.project_id = new.project_id;
    v_kind := 'realization';
  else
    return new;
  end if;

  if v_statement is null or char_length(btrim(v_statement)) < 3 then
    return new;
  end if;

  select s.id into v_source_id
  from public.perception_learning_sources s
  where s.project_id = new.project_id
    and s.user_id = new.user_id
    and s.url = 'internal://project-events';

  insert into public.perception_study_runs(
    user_id, project_id, source_id, trigger_kind, stage, status, run_key,
    items_seen, items_new, items_material, learnings_integrated,
    metadata, started_at, finished_at
  ) values (
    new.user_id, new.project_id, v_source_id, 'internal_event', 'integrate',
    'succeeded', 'event:' || new.id::text,
    1, 1, 1, 1,
    jsonb_build_object('event_id', new.id, 'event_type', new.event_type),
    new.created_at, now()
  )
  on conflict (run_key) do update
    set finished_at = excluded.finished_at
  returning id into v_run_id;

  v_hash := encode(
    extensions.digest(
      convert_to(new.project_id::text || ':' || new.id::text || ':' || v_statement, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.perception_learning_candidates(
    user_id, project_id, source_id, study_run_id, origin_event_id,
    world_signal_id, origin_type, content_hash, title, summary, why_it_matters,
    relevance, impact, novelty, confidence, urgency, noise, materiality_score,
    status, verification_kind, verification_evidence, source_refs,
    affected_belief_ids, affected_route_node_ids, evaluated_at
  ) values (
    new.user_id, new.project_id, v_source_id, v_run_id, new.id,
    v_signal_id, case when v_signal_id is null then 'internal_event' else 'world_signal' end,
    v_hash, replace(initcap(replace(v_kind, '_', ' ')), ' ', ' '),
    v_statement, v_why,
    1, 1, 1, v_confidence, 1, 0, v_confidence,
    'accepted', 'verified_project_event', v_evidence, v_source_refs,
    v_affected_beliefs, v_affected_nodes, now()
  )
  on conflict (origin_event_id) do nothing
  returning id into v_candidate_id;

  if v_candidate_id is null then
    return new;
  end if;

  insert into public.perception_learning_ledger(
    user_id, project_id, candidate_id, learning_kind, statement,
    why_it_matters, confidence, source_refs, evidence,
    affected_belief_ids, affected_route_node_ids, learned_at
  ) values (
    new.user_id, new.project_id, v_candidate_id, v_kind, v_statement,
    v_why, v_confidence, v_source_refs, v_evidence,
    v_affected_beliefs, v_affected_nodes, new.created_at
  );

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (
    new.user_id,
    new.project_id,
    'learning.accepted',
    jsonb_build_object(
      'candidate_id', v_candidate_id,
      'source_event_id', new.id,
      'learning_kind', v_kind,
      'truth_rule', 'verified_evidence_only'
    )
  );

  return new;
end;
$$;

revoke all on function public.perception_capture_learning_event()
  from public, anon, authenticated;

drop trigger if exists perception_capture_learning_event_trigger
  on public.perception_model_events;
create trigger perception_capture_learning_event_trigger
after insert on public.perception_model_events
for each row execute function public.perception_capture_learning_event();

-- Preserve the already verified production signal as the first historical
-- learning entry. This is evidence-backed backfill, not fabricated seed data.
with inserted_candidates as (
  insert into public.perception_learning_candidates(
    user_id, project_id, world_signal_id, origin_type, content_hash,
    title, summary, why_it_matters,
    relevance, impact, novelty, confidence, urgency, noise, materiality_score,
    status, verification_kind, verification_evidence, source_refs,
    affected_belief_ids, affected_route_node_ids,
    first_seen_at, last_seen_at, evaluated_at
  )
  select
    s.user_id,
    s.project_id,
    s.id,
    'world_signal',
    encode(extensions.digest(convert_to('world_signal:' || s.id::text, 'UTF8'), 'sha256'), 'hex'),
    'Verified world signal',
    s.summary,
    'This verified change can affect the active Reality Route.',
    s.relevance,
    s.impact,
    s.novelty,
    s.confidence,
    s.urgency,
    s.noise,
    public.perception_learning_score(
      s.relevance, s.impact, s.novelty, s.confidence, s.urgency, s.noise
    ),
    'accepted',
    'verified_world_signal_backfill',
    s.source_refs,
    s.source_refs,
    s.affected_belief_ids,
    s.affected_route_node_ids,
    s.detected_at,
    s.detected_at,
    s.detected_at
  from public.perception_world_signals s
  where jsonb_typeof(s.source_refs) = 'array'
    and jsonb_array_length(s.source_refs) > 0
  on conflict (project_id, content_hash) do nothing
  returning *
)
insert into public.perception_learning_ledger(
  user_id, project_id, candidate_id, learning_kind, statement,
  why_it_matters, confidence, source_refs, evidence,
  affected_belief_ids, affected_route_node_ids, learned_at, created_at
)
select
  c.user_id,
  c.project_id,
  c.id,
  'world_signal',
  c.summary,
  c.why_it_matters,
  c.confidence,
  c.source_refs,
  c.verification_evidence,
  c.affected_belief_ids,
  c.affected_route_node_ids,
  c.first_seen_at,
  c.first_seen_at
from inserted_candidates c
on conflict (candidate_id) do nothing;

create or replace function public.perception_claim_study_sources_internal(
  p_user_id uuid default null,
  p_project_id uuid default null,
  p_limit integer default 10,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_limit < 1 or p_limit > 20 then
    raise exception 'Study claim limit must be between 1 and 20'
      using errcode = '22023';
  end if;

  if p_user_id is not null and not exists (
    select 1 from auth.users u where u.id = p_user_id
  ) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  with due as (
    select s.id
    from public.perception_learning_sources s
    join public.perception_continuous_mind_policies p
      on p.project_id = s.project_id and p.user_id = s.user_id
    where p.enabled = true
      and s.enabled = true
      and s.source_type <> 'internal'
      and (p_force or s.next_scan_at <= now())
      and (p_user_id is null or s.user_id = p_user_id)
      and (p_project_id is null or s.project_id = p_project_id)
    order by s.next_scan_at, s.created_at
    for update of s skip locked
    limit p_limit
  ),
  claimed as (
    update public.perception_learning_sources s
    set
      next_scan_at = now() + make_interval(mins => s.cadence_minutes),
      last_scanned_at = now(),
      updated_at = now()
    from due
    where s.id = due.id
    returning s.*
  ),
  created_runs as (
    insert into public.perception_study_runs(
      user_id, project_id, source_id, trigger_kind, stage, status,
      run_key, metadata, started_at
    )
    select
      s.user_id,
      s.project_id,
      s.id,
      case when p_force then 'manual' else 'scheduled' end,
      'research',
      'running',
      'source:' || s.id::text || ':' || gen_random_uuid()::text,
      jsonb_build_object('source_url', s.url, 'claimed_at', now()),
      now()
    from claimed s
    returning id, source_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'run_id', r.id,
        'source_id', s.id,
        'user_id', s.user_id,
        'project_id', s.project_id,
        'label', s.label,
        'source_type', s.source_type,
        'url', s.url,
        'trust_weight', s.trust_weight,
        'etag', s.etag,
        'last_modified', s.last_modified,
        'max_items', p.max_items_per_source,
        'materiality_threshold', p.materiality_threshold,
        'auto_integrate_threshold', p.auto_integrate_threshold,
        'project_name', project.name,
        'desired_reality', project.desired_reality,
        'current_reality', project.current_reality
      )
      order by s.next_scan_at
    ),
    '[]'::jsonb
  )
  into v_result
  from claimed s
  join created_runs r on r.source_id = s.id
  join public.perception_continuous_mind_policies p
    on p.project_id = s.project_id and p.user_id = s.user_id
  join public.perception_projects project on project.id = s.project_id;

  return v_result;
end;
$$;

revoke all on function public.perception_claim_study_sources_internal(
  uuid, uuid, integer, boolean
) from public, anon, authenticated;
grant execute on function public.perception_claim_study_sources_internal(
  uuid, uuid, integer, boolean
) to service_role;

create or replace function public.perception_record_study_observation_internal(
  p_run_id uuid,
  p_source_id uuid,
  p_content_hash text,
  p_title text,
  p_summary text,
  p_why_it_matters text,
  p_excerpt text,
  p_source_url text,
  p_source_published_at timestamptz,
  p_relevance double precision,
  p_impact double precision,
  p_novelty double precision,
  p_confidence double precision,
  p_urgency double precision,
  p_noise double precision,
  p_source_refs jsonb,
  p_verification_evidence jsonb,
  p_affected_belief_ids jsonb default '[]'::jsonb,
  p_affected_route_node_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.perception_learning_sources%rowtype;
  v_run public.perception_study_runs%rowtype;
  v_policy public.perception_continuous_mind_policies%rowtype;
  v_candidate_id uuid;
  v_ledger_id uuid;
  v_signal_id uuid;
  v_signal_result jsonb;
  v_signal_source_refs jsonb;
  v_score double precision;
  v_status text;
begin
  if p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid observation content hash' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_summary, ''))) < 3 then
    raise exception 'Observation summary is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_source_refs, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_source_refs, '[]'::jsonb)) = 0 then
    raise exception 'Observation requires evidence source references'
      using errcode = '22023';
  end if;
  if p_relevance not between 0 and 1
     or p_impact not between 0 and 1
     or p_novelty not between 0 and 1
     or p_confidence not between 0 and 1
     or p_urgency not between 0 and 1
     or p_noise not between 0 and 1 then
    raise exception 'Observation metrics must be between 0 and 1'
      using errcode = '22023';
  end if;

  select * into v_source
  from public.perception_learning_sources s
  where s.id = p_source_id and s.enabled = true and s.source_type <> 'internal';
  if v_source.id is null then
    raise exception 'Approved learning source not found' using errcode = 'P0002';
  end if;

  select * into v_run
  from public.perception_study_runs r
  where r.id = p_run_id
    and r.source_id = v_source.id
    and r.user_id = v_source.user_id
    and r.project_id = v_source.project_id
    and r.status = 'running';
  if v_run.id is null then
    raise exception 'Active study run not found' using errcode = 'P0002';
  end if;

  select * into v_policy
  from public.perception_continuous_mind_policies p
  where p.user_id = v_source.user_id
    and p.project_id = v_source.project_id
    and p.enabled = true;
  if v_policy.id is null then
    raise exception 'Continuous Mind is disabled' using errcode = '55000';
  end if;

  v_score := public.perception_learning_score(
    p_relevance, p_impact, p_novelty, p_confidence, p_urgency, p_noise
  );

  v_status := case
    when v_score >= v_policy.auto_integrate_threshold
      and p_confidence >= 0.75
      and v_source.trust_weight >= 0.75
      then 'accepted'
    when v_score >= v_policy.materiality_threshold then 'proposed'
    else 'observed'
  end;

  insert into public.perception_learning_candidates(
    user_id, project_id, source_id, study_run_id, origin_type,
    content_hash, title, summary, why_it_matters, excerpt,
    source_url, source_published_at,
    relevance, impact, novelty, confidence, urgency, noise, materiality_score,
    status, verification_kind, verification_evidence, source_refs,
    affected_belief_ids, affected_route_node_ids, evaluated_at
  ) values (
    v_source.user_id, v_source.project_id, v_source.id, v_run.id, 'external_item',
    p_content_hash, left(coalesce(p_title, ''), 500), btrim(p_summary),
    coalesce(p_why_it_matters, ''), left(p_excerpt, 8000),
    p_source_url, p_source_published_at,
    p_relevance, p_impact, p_novelty, p_confidence, p_urgency, p_noise, v_score,
    v_status, 'approved_source_fetch',
    coalesce(p_verification_evidence, '[]'::jsonb), p_source_refs,
    coalesce(p_affected_belief_ids, '[]'::jsonb),
    coalesce(p_affected_route_node_ids, '[]'::jsonb),
    now()
  )
  on conflict (project_id, content_hash) do nothing
  returning id into v_candidate_id;

  update public.perception_study_runs
  set
    items_seen = items_seen + 1,
    items_new = items_new + case when v_candidate_id is null then 0 else 1 end,
    items_material = items_material + case
      when v_candidate_id is not null and v_status in ('proposed', 'accepted') then 1
      else 0
    end,
    learnings_integrated = learnings_integrated + case
      when v_candidate_id is not null and v_status = 'accepted' then 1
      else 0
    end
  where id = v_run.id;

  if v_candidate_id is null then
    return jsonb_build_object('ok', true, 'duplicate', true, 'status', 'unchanged');
  end if;

  if v_status = 'accepted' then
    v_signal_source_refs := coalesce(p_source_refs, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'kind', 'continuous_mind_candidate',
        'id', v_candidate_id,
        'observed_at', now()
      )
    );

    v_signal_result := public.perception_ingest_verified_signal_internal(
      v_source.user_id,
      v_source.project_id,
      btrim(p_summary),
      p_relevance,
      p_impact,
      p_novelty,
      p_confidence,
      p_urgency,
      p_noise,
      v_signal_source_refs
    );
    v_signal_id := nullif(v_signal_result ->> 'signal_id', '')::uuid;

    update public.perception_world_signals
    set affected_belief_ids = coalesce(p_affected_belief_ids, '[]'::jsonb),
        affected_route_node_ids = coalesce(p_affected_route_node_ids, '[]'::jsonb)
    where id = v_signal_id;

    update public.perception_learning_candidates
    set world_signal_id = v_signal_id
    where id = v_candidate_id;

    insert into public.perception_learning_ledger(
      user_id, project_id, candidate_id, learning_kind, statement,
      why_it_matters, confidence, source_refs, evidence,
      affected_belief_ids, affected_route_node_ids
    ) values (
      v_source.user_id, v_source.project_id, v_candidate_id, 'source_finding',
      btrim(p_summary), coalesce(p_why_it_matters, ''), p_confidence,
      p_source_refs, coalesce(p_verification_evidence, '[]'::jsonb),
      coalesce(p_affected_belief_ids, '[]'::jsonb),
      coalesce(p_affected_route_node_ids, '[]'::jsonb)
    )
    returning id into v_ledger_id;

    insert into public.perception_model_events(user_id, project_id, event_type, payload)
    values (
      v_source.user_id,
      v_source.project_id,
      'learning.accepted',
      jsonb_build_object(
        'candidate_id', v_candidate_id,
        'ledger_id', v_ledger_id,
        'world_signal_id', v_signal_id,
        'source_id', v_source.id,
        'materiality_score', v_score,
        'truth_rule', 'approved_sourced_knowledge_only'
      )
    );
  elsif v_status = 'proposed' then
    insert into public.perception_model_events(user_id, project_id, event_type, payload)
    values (
      v_source.user_id,
      v_source.project_id,
      'learning.proposed',
      jsonb_build_object(
        'candidate_id', v_candidate_id,
        'source_id', v_source.id,
        'materiality_score', v_score
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'candidate_id', v_candidate_id,
    'ledger_id', v_ledger_id,
    'world_signal_id', v_signal_id,
    'status', v_status,
    'materiality_score', v_score
  );
end;
$$;

revoke all on function public.perception_record_study_observation_internal(
  uuid, uuid, text, text, text, text, text, text, timestamptz,
  double precision, double precision, double precision, double precision,
  double precision, double precision, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.perception_record_study_observation_internal(
  uuid, uuid, text, text, text, text, text, text, timestamptz,
  double precision, double precision, double precision, double precision,
  double precision, double precision, jsonb, jsonb, jsonb, jsonb
) to service_role;

create or replace function public.perception_complete_study_run_internal(
  p_run_id uuid,
  p_status text,
  p_etag text default null,
  p_last_modified text default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.perception_study_runs%rowtype;
begin
  if p_status not in ('succeeded', 'partial', 'failed') then
    raise exception 'Invalid study run completion status' using errcode = '22023';
  end if;

  select * into v_run
  from public.perception_study_runs r
  where r.id = p_run_id
  for update;
  if v_run.id is null then
    raise exception 'Study run not found' using errcode = 'P0002';
  end if;

  if v_run.status <> 'running' then
    return jsonb_build_object(
      'ok', true,
      'run_id', v_run.id,
      'status', v_run.status,
      'idempotent', true
    );
  end if;

  update public.perception_study_runs
  set status = p_status,
      stage = case when p_status = 'failed' then stage else 'integrate' end,
      error = nullif(left(btrim(coalesce(p_error, '')), 2000), ''),
      finished_at = now()
  where id = v_run.id;

  if p_status in ('succeeded', 'partial') then
    update public.perception_learning_sources
    set last_succeeded_at = now(),
        etag = coalesce(nullif(p_etag, ''), etag),
        last_modified = coalesce(nullif(p_last_modified, ''), last_modified),
        consecutive_failures = 0,
        last_error = case when p_status = 'partial'
          then nullif(left(btrim(coalesce(p_error, '')), 2000), '')
          else null
        end
    where id = v_run.source_id;
  else
    update public.perception_learning_sources
    set consecutive_failures = consecutive_failures + 1,
        last_error = coalesce(
          nullif(left(btrim(coalesce(p_error, '')), 2000), ''),
          'Study run failed'
        ),
        next_scan_at = now() + make_interval(
          mins => least(1440, cadence_minutes * (2 ^ least(consecutive_failures + 1, 5))::integer)
        )
    where id = v_run.source_id;
  end if;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (
    v_run.user_id,
    v_run.project_id,
    'study.' || p_status,
    jsonb_build_object(
      'run_id', v_run.id,
      'source_id', v_run.source_id,
      'status', p_status,
      'error', nullif(left(btrim(coalesce(p_error, '')), 2000), '')
    )
  );

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run.id,
    'status', p_status,
    'idempotent', false
  );
end;
$$;

revoke all on function public.perception_complete_study_run_internal(
  uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.perception_complete_study_run_internal(
  uuid, text, text, text, text
) to service_role;

create or replace function public.perception_review_learning(
  p_candidate_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_candidate public.perception_learning_candidates%rowtype;
  v_ledger_id uuid;
  v_signal_id uuid;
  v_signal_result jsonb;
  v_signal_source_refs jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Decision must be accepted or rejected' using errcode = '22023';
  end if;

  select * into v_candidate
  from public.perception_learning_candidates c
  where c.id = p_candidate_id and c.user_id = v_user
  for update;
  if v_candidate.id is null then
    raise exception 'Learning candidate not found' using errcode = 'P0002';
  end if;

  if v_candidate.status in ('accepted', 'rejected') then
    return jsonb_build_object(
      'ok', true,
      'candidate_id', v_candidate.id,
      'status', v_candidate.status,
      'idempotent', true
    );
  end if;

  update public.perception_learning_candidates
  set status = p_decision, reviewed_at = now(), review_reason = nullif(btrim(p_reason), '')
  where id = v_candidate.id;

  if p_decision = 'accepted' then
    v_signal_source_refs := v_candidate.source_refs || jsonb_build_array(
      jsonb_build_object(
        'kind', 'continuous_mind_candidate',
        'id', v_candidate.id,
        'observed_at', now()
      )
    );

    v_signal_result := public.perception_ingest_verified_signal_internal(
      v_candidate.user_id,
      v_candidate.project_id,
      v_candidate.summary,
      v_candidate.relevance,
      v_candidate.impact,
      v_candidate.novelty,
      v_candidate.confidence,
      v_candidate.urgency,
      v_candidate.noise,
      v_signal_source_refs
    );
    v_signal_id := nullif(v_signal_result ->> 'signal_id', '')::uuid;

    update public.perception_world_signals
    set affected_belief_ids = v_candidate.affected_belief_ids,
        affected_route_node_ids = v_candidate.affected_route_node_ids
    where id = v_signal_id;

    update public.perception_learning_candidates
    set world_signal_id = v_signal_id
    where id = v_candidate.id;

    insert into public.perception_learning_ledger(
      user_id, project_id, candidate_id, learning_kind, statement,
      why_it_matters, confidence, source_refs, evidence,
      affected_belief_ids, affected_route_node_ids
    ) values (
      v_candidate.user_id, v_candidate.project_id, v_candidate.id,
      case when v_candidate.origin_type = 'external_item'
        then 'source_finding' else 'world_signal' end,
      v_candidate.summary, v_candidate.why_it_matters, v_candidate.confidence,
      v_candidate.source_refs, v_candidate.verification_evidence,
      v_candidate.affected_belief_ids, v_candidate.affected_route_node_ids
    )
    on conflict (candidate_id) do update
      set integration_status = 'accepted'
    returning id into v_ledger_id;
  end if;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (
    v_candidate.user_id,
    v_candidate.project_id,
    'learning.' || p_decision,
    jsonb_build_object(
      'candidate_id', v_candidate.id,
      'ledger_id', v_ledger_id,
      'world_signal_id', v_signal_id,
      'review_reason', nullif(btrim(p_reason), ''),
      'reviewed_by', v_user
    )
  );

  return jsonb_build_object(
    'ok', true,
    'candidate_id', v_candidate.id,
    'ledger_id', v_ledger_id,
    'world_signal_id', v_signal_id,
    'status', p_decision,
    'idempotent', false
  );
end;
$$;

revoke all on function public.perception_review_learning(uuid, text, text)
  from public, anon;
grant execute on function public.perception_review_learning(uuid, text, text)
  to authenticated;

create or replace function public.perception_get_continuous_mind(p_project_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1
    from public.perception_projects p
    where p.id = p_project_id and p.user_id = v_user
  ) then
    raise exception 'Project World not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'policy', (
      select to_jsonb(policy_row)
      from (
        select enabled, study_interval_minutes, materiality_threshold,
               auto_integrate_threshold, max_sources_per_cycle,
               max_items_per_source, updated_at
        from public.perception_continuous_mind_policies
        where project_id = p_project_id and user_id = v_user
      ) policy_row
    ),
    'sources', coalesce((
      select jsonb_agg(to_jsonb(source_row) order by source_row.created_at)
      from (
        select id, label, source_type, url, enabled, trust_weight,
               cadence_minutes, approved_at, next_scan_at, last_scanned_at,
               last_succeeded_at, consecutive_failures, last_error, created_at
        from public.perception_learning_sources
        where project_id = p_project_id and user_id = v_user
      ) source_row
    ), '[]'::jsonb),
    'latest_learning', (
      select to_jsonb(learning_row)
      from (
        select id, learning_kind, statement, why_it_matters, confidence,
               source_refs, evidence, integration_status, learned_at
        from public.perception_learning_ledger
        where project_id = p_project_id
          and user_id = v_user
          and integration_status = 'accepted'
        order by learned_at desc, created_at desc
        limit 1
      ) learning_row
    ),
    'recent_learning', coalesce((
      select jsonb_agg(to_jsonb(learning_row) order by learning_row.learned_at desc)
      from (
        select id, learning_kind, statement, why_it_matters, confidence,
               source_refs, integration_status, learned_at
        from public.perception_learning_ledger
        where project_id = p_project_id and user_id = v_user
        order by learned_at desc, created_at desc
        limit 10
      ) learning_row
    ), '[]'::jsonb),
    'proposals', coalesce((
      select jsonb_agg(to_jsonb(candidate_row) order by candidate_row.materiality_score desc)
      from (
        select id, title, summary, why_it_matters, source_url, confidence,
               materiality_score, source_refs, first_seen_at
        from public.perception_learning_candidates
        where project_id = p_project_id
          and user_id = v_user
          and status = 'proposed'
        order by materiality_score desc, first_seen_at desc
        limit 20
      ) candidate_row
    ), '[]'::jsonb),
    'latest_run', (
      select to_jsonb(run_row)
      from (
        select id, trigger_kind, stage, status, items_seen, items_new,
               items_material, learnings_integrated, error,
               started_at, finished_at, created_at
        from public.perception_study_runs
        where project_id = p_project_id and user_id = v_user
        order by created_at desc
        limit 1
      ) run_row
    ),
    'counts', jsonb_build_object(
      'sources', (
        select count(*) from public.perception_learning_sources
        where project_id = p_project_id and user_id = v_user and enabled = true
      ),
      'accepted', (
        select count(*) from public.perception_learning_ledger
        where project_id = p_project_id and user_id = v_user
          and integration_status = 'accepted'
      ),
      'proposed', (
        select count(*) from public.perception_learning_candidates
        where project_id = p_project_id and user_id = v_user and status = 'proposed'
      ),
      'study_runs', (
        select count(*) from public.perception_study_runs
        where project_id = p_project_id and user_id = v_user
      )
    ),
    'generated_at', now()
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.perception_get_continuous_mind(uuid)
  from public, anon;
grant execute on function public.perception_get_continuous_mind(uuid)
  to authenticated;

-- Create or recover the scheduler token entirely inside Postgres. The token is
-- never committed and never returned through the Data API.
do $$
declare
  v_token text;
begin
  if not exists (
    select 1 from vault.secrets where name = 'perception_continuous_mind_cron_token'
  ) then
    v_token := encode(gen_random_bytes(32), 'hex');
    perform vault.create_secret(
      v_token,
      'perception_continuous_mind_cron_token',
      'Authenticates the Perception Continuous Mind Cron invocation.'
    );
  else
    select decrypted_secret into v_token
    from vault.decrypted_secrets
    where name = 'perception_continuous_mind_cron_token';
  end if;

  insert into public.perception_runtime_secret_hashes(
    secret_name, secret_hash, rotated_at
  ) values (
    'continuous_mind_cron',
    encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    now()
  )
  on conflict (secret_name) do update
    set secret_hash = excluded.secret_hash,
        rotated_at = excluded.rotated_at;

  if not exists (
    select 1 from vault.secrets where name = 'perception_project_url'
  ) then
    perform vault.create_secret(
      'https://zxmdfmiueapjhktqchts.supabase.co',
      'perception_project_url',
      'Canonical Perception Supabase project URL.'
    );
  end if;
end;
$$;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job where jobname = 'perception-continuous-mind'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'perception-continuous-mind',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'perception_project_url'
        ) || '/functions/v1/continuous-mind',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-perception-cron-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'perception_continuous_mind_cron_token'
          )
        ),
        body := jsonb_build_object(
          'trigger', 'scheduled',
          'scheduled_at', now()
        ),
        timeout_milliseconds := 30000
      );
    $job$
  );
end;
$$;
