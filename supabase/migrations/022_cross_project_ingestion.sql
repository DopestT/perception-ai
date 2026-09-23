-- Cross-project source ingestion for Perception Project World.
-- External systems are discovered globally, then explicitly bound to canonical projects.
-- Raw observations are append-only evidence; they do not silently become project truth.

create table if not exists public.perception_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (
    source_type in (
      'github_repo',
      'vercel_project',
      'supabase_project',
      'railway_service',
      'notion_page',
      'drive_file',
      'gmail_thread',
      'website',
      'api',
      'manual',
      'other'
    )
  ),
  provider text not null,
  external_id text not null,
  label text not null default '',
  locator text,
  enabled boolean not null default true,
  sync_mode text not null default 'manual' check (sync_mode in ('manual', 'poll', 'webhook', 'push')),
  trust_weight double precision not null default 1 check (trust_weight >= 0 and trust_weight <= 1),
  freshness_sla_minutes integer not null default 1440 check (freshness_sla_minutes > 0),
  last_cursor text,
  last_observed_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, external_id)
);

create table if not exists public.perception_project_source_bindings (
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  source_id uuid not null references public.perception_sources(id) on delete cascade,
  relationship text not null default 'supporting' check (
    relationship in ('primary', 'supporting', 'shared', 'legacy', 'unknown')
  ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, source_id)
);

create table if not exists public.perception_source_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.perception_sources(id) on delete cascade,
  observation_kind text not null,
  external_version text,
  content_hash text not null,
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  source_ref text,
  observed_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, content_hash)
);

create index if not exists perception_sources_sync_idx
  on public.perception_sources(user_id, enabled, last_synced_at nulls first);

create index if not exists perception_project_source_bindings_project_idx
  on public.perception_project_source_bindings(project_id, active, updated_at desc);

create index if not exists perception_source_observations_source_idx
  on public.perception_source_observations(source_id, observed_at desc);

create index if not exists perception_source_observations_user_idx
  on public.perception_source_observations(user_id, observed_at desc);

alter table public.perception_sources enable row level security;
alter table public.perception_project_source_bindings enable row level security;
alter table public.perception_source_observations enable row level security;

drop policy if exists "users read perception sources" on public.perception_sources;
create policy "users read perception sources"
on public.perception_sources for select
using (auth.uid() = user_id);

drop policy if exists "users read perception project source bindings" on public.perception_project_source_bindings;
create policy "users read perception project source bindings"
on public.perception_project_source_bindings for select
using (auth.uid() = user_id);

drop policy if exists "users read perception source observations" on public.perception_source_observations;
create policy "users read perception source observations"
on public.perception_source_observations for select
using (auth.uid() = user_id);

revoke all on public.perception_sources from anon;
revoke all on public.perception_project_source_bindings from anon;
revoke all on public.perception_source_observations from anon;

grant select on public.perception_sources to authenticated;
grant select on public.perception_project_source_bindings to authenticated;
grant select on public.perception_source_observations to authenticated;

create or replace function public.perception_ingest_project_observation_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_provider text,
  p_source_type text,
  p_external_id text,
  p_label text,
  p_locator text,
  p_sync_mode text,
  p_source_metadata jsonb,
  p_observation_kind text,
  p_external_version text,
  p_content_hash text,
  p_summary text,
  p_payload jsonb,
  p_source_ref text,
  p_observed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_id uuid;
  v_observation_id uuid;
  v_inserted boolean := false;
begin
  if p_user_id is null then
    raise exception 'User id is required' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if p_project_id is not null and not exists (
    select 1
    from public.perception_projects p
    where p.id = p_project_id and p.user_id = p_user_id
  ) then
    raise exception 'Project World not found' using errcode = 'P0002';
  end if;

  if coalesce(trim(p_provider), '') = '' or coalesce(trim(p_external_id), '') = '' then
    raise exception 'Provider and external id are required' using errcode = '22023';
  end if;

  if coalesce(trim(p_content_hash), '') = '' then
    raise exception 'Content hash is required' using errcode = '22023';
  end if;

  insert into public.perception_sources (
    user_id,
    source_type,
    provider,
    external_id,
    label,
    locator,
    sync_mode,
    metadata,
    last_observed_at,
    last_synced_at
  )
  values (
    p_user_id,
    p_source_type,
    trim(p_provider),
    trim(p_external_id),
    coalesce(p_label, ''),
    p_locator,
    p_sync_mode,
    coalesce(p_source_metadata, '{}'::jsonb),
    p_observed_at,
    now()
  )
  on conflict (user_id, provider, external_id)
  do update set
    source_type = excluded.source_type,
    label = case when excluded.label <> '' then excluded.label else public.perception_sources.label end,
    locator = coalesce(excluded.locator, public.perception_sources.locator),
    sync_mode = excluded.sync_mode,
    metadata = public.perception_sources.metadata || excluded.metadata,
    last_observed_at = greatest(
      coalesce(public.perception_sources.last_observed_at, excluded.last_observed_at),
      excluded.last_observed_at
    ),
    last_synced_at = now(),
    last_error = null,
    updated_at = now()
  returning id into v_source_id;

  if p_project_id is not null then
    insert into public.perception_project_source_bindings (
      user_id,
      project_id,
      source_id,
      relationship,
      active
    )
    values (
      p_user_id,
      p_project_id,
      v_source_id,
      'supporting',
      true
    )
    on conflict (project_id, source_id)
    do update set
      active = true,
      updated_at = now();
  end if;

  insert into public.perception_source_observations (
    user_id,
    source_id,
    observation_kind,
    external_version,
    content_hash,
    summary,
    payload,
    source_ref,
    observed_at
  )
  values (
    p_user_id,
    v_source_id,
    p_observation_kind,
    p_external_version,
    p_content_hash,
    coalesce(p_summary, ''),
    coalesce(p_payload, '{}'::jsonb),
    p_source_ref,
    p_observed_at
  )
  on conflict (source_id, content_hash) do nothing
  returning id into v_observation_id;

  if v_observation_id is null then
    select o.id
      into v_observation_id
    from public.perception_source_observations o
    where o.source_id = v_source_id and o.content_hash = p_content_hash;

    v_inserted := false;
  else
    v_inserted := true;
  end if;

  if p_project_id is not null and v_inserted then
    insert into public.perception_model_events (
      user_id,
      project_id,
      event_type,
      payload
    )
    values (
      p_user_id,
      p_project_id,
      'project_source_observation',
      jsonb_build_object(
        'source_id', v_source_id,
        'observation_id', v_observation_id,
        'provider', p_provider,
        'source_type', p_source_type,
        'external_id', p_external_id,
        'observation_kind', p_observation_kind,
        'external_version', p_external_version,
        'summary', coalesce(p_summary, ''),
        'source_ref', p_source_ref,
        'observed_at', p_observed_at
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'source_id', v_source_id,
    'observation_id', v_observation_id,
    'inserted', v_inserted,
    'project_id', p_project_id
  );
end;
$$;

revoke all on function public.perception_ingest_project_observation_internal(
  uuid, uuid, text, text, text, text, text, text, jsonb, text, text, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.perception_ingest_project_observation_internal(
  uuid, uuid, text, text, text, text, text, text, jsonb, text, text, text, text, jsonb, text, timestamptz
) to service_role;

create or replace function public.perception_get_project_world(p_project_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.perception_projects p
    where p.id = p_project_id and p.user_id = v_user
  ) then
    raise exception 'Project World not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'project', to_jsonb(p),
    'beliefs', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at) from public.perception_beliefs b where b.project_id = p.id), '[]'::jsonb),
    'objectives', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from public.perception_objectives o where o.project_id = p.id), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.perception_routes r where r.project_id = p.id), '[]'::jsonb),
    'route_nodes', coalesce((select jsonb_agg(to_jsonb(n) order by n.sort_order, n.created_at) from public.perception_route_nodes n where n.project_id = p.id), '[]'::jsonb),
    'worker_runs', coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at) from public.perception_worker_runs w where w.project_id = p.id), '[]'::jsonb),
    'artifacts', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.perception_artifacts a where a.project_id = p.id), '[]'::jsonb),
    'verifications', coalesce((select jsonb_agg(to_jsonb(v) order by v.checked_at) from public.perception_verification_runs v where v.project_id = p.id), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'binding', to_jsonb(b),
          'source', to_jsonb(s)
        )
        order by b.updated_at desc
      )
      from public.perception_project_source_bindings b
      join public.perception_sources s on s.id = b.source_id
      where b.project_id = p.id and b.active = true
    ), '[]'::jsonb),
    'source_observations', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.observed_at desc)
      from (
        select o.*
        from public.perception_source_observations o
        join public.perception_project_source_bindings b on b.source_id = o.source_id
        where b.project_id = p.id and b.active = true
        order by o.observed_at desc
        limit 100
      ) x
    ), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.perception_model_events e where e.project_id = p.id), '[]'::jsonb)
  ) into v_result
  from public.perception_projects p
  where p.id = p_project_id and p.user_id = v_user;

  return v_result;
end;
$$;

revoke all on function public.perception_get_project_world(uuid) from public, anon;
grant execute on function public.perception_get_project_world(uuid) to authenticated;
