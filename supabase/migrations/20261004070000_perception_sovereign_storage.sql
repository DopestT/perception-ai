-- Perception sovereign storage foundation.
-- Legacy Works Ventures owns canonical Perception state. AI-provider state is never authoritative.

create table if not exists public.perception_storage_authority (
  authority_key text primary key check (authority_key = 'canonical'),
  owner_organization text not null,
  canonical_store_class text not null,
  rule_version integer not null check (rule_version > 0),
  provider_state_authoritative boolean not null default false
    check (provider_state_authoritative = false),
  conversation_history_authoritative boolean not null default false
    check (conversation_history_authoritative = false),
  provider_vector_store_authoritative boolean not null default false
    check (provider_vector_store_authoritative = false),
  provider_thread_authoritative boolean not null default false
    check (provider_thread_authoritative = false),
  rule_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.perception_storage_authority (
  authority_key,
  owner_organization,
  canonical_store_class,
  rule_version,
  provider_state_authoritative,
  conversation_history_authoritative,
  provider_vector_store_authoritative,
  provider_thread_authoritative,
  rule_text
) values (
  'canonical',
  'Legacy Works Ventures',
  'lw_controlled_perception_database',
  1,
  false,
  false,
  false,
  false,
  'The authoritative state of Perception must exist on infrastructure controlled by Legacy Works Ventures. AI providers may process bounded copies but provider memory, conversation history, vector stores, assistants, threads, conversations, or proprietary model storage cannot serve as Perception''s system of record.'
)
on conflict (authority_key) do update
set owner_organization = excluded.owner_organization,
    canonical_store_class = excluded.canonical_store_class,
    rule_version = greatest(public.perception_storage_authority.rule_version, excluded.rule_version),
    provider_state_authoritative = false,
    conversation_history_authoritative = false,
    provider_vector_store_authoritative = false,
    provider_thread_authoritative = false,
    rule_text = excluded.rule_text,
    updated_at = now();

alter table public.perception_storage_authority enable row level security;

drop policy if exists "authenticated users read sovereign authority" on public.perception_storage_authority;
create policy "authenticated users read sovereign authority"
  on public.perception_storage_authority
  for select
  to authenticated
  using (true);

revoke all on table public.perception_storage_authority from anon;
revoke insert, update, delete on table public.perception_storage_authority from authenticated;
grant select on table public.perception_storage_authority to authenticated;
grant all on table public.perception_storage_authority to service_role;

create table if not exists public.perception_sovereign_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  export_kind text not null default 'project_world'
    check (export_kind in ('project_world','full_database','restore_drill')),
  destination_class text not null
    check (destination_class in ('lw_object_storage','lw_filesystem','lw_backup_system','isolated_restore')),
  destination_ref_hash text,
  manifest jsonb not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  archive_sha256 text check (archive_sha256 is null or archive_sha256 ~ '^[0-9a-f]{64}$'),
  archive_bytes bigint check (archive_bytes is null or archive_bytes >= 0),
  status text not null default 'prepared'
    check (status in ('prepared','written','verified','failed')),
  error_text text,
  prepared_at timestamptz not null default now(),
  written_at timestamptz,
  verified_at timestamptz
);

create index if not exists perception_sovereign_exports_project_idx
  on public.perception_sovereign_exports(project_id, prepared_at desc);
create index if not exists perception_sovereign_exports_user_idx
  on public.perception_sovereign_exports(user_id, prepared_at desc);

alter table public.perception_sovereign_exports enable row level security;

drop policy if exists "users read own sovereign exports" on public.perception_sovereign_exports;
create policy "users read own sovereign exports"
  on public.perception_sovereign_exports
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.perception_sovereign_exports from anon;
revoke insert, update, delete on table public.perception_sovereign_exports from authenticated;
grant select on table public.perception_sovereign_exports to authenticated;
grant all on table public.perception_sovereign_exports to service_role;

create or replace function public.perception_build_sovereign_manifest_internal(
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
  v_manifest jsonb;
begin
  if p_user_id is null or p_project_id is null then
    raise exception 'User and project are required' using errcode = '22023';
  end if;

  select *
  into v_project
  from public.perception_projects
  where id = p_project_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Project World not found for user' using errcode = '42501';
  end if;

  v_manifest := jsonb_build_object(
    'schema', 'perception-sovereign-manifest/v1',
    'authority', jsonb_build_object(
      'owner', 'Legacy Works Ventures',
      'canonical_store', 'lw_controlled_perception_database',
      'provider_state_authoritative', false,
      'conversation_history_authoritative', false,
      'provider_vector_store_authoritative', false,
      'provider_thread_authoritative', false
    ),
    'project_id', p_project_id,
    'user_id', p_user_id,
    'generated_at', now(),
    'row_counts', jsonb_build_object(
      'projects', 1,
      'beliefs', (select count(*) from public.perception_beliefs where project_id = p_project_id and user_id = p_user_id),
      'model_events', (select count(*) from public.perception_model_events where project_id = p_project_id and user_id = p_user_id),
      'objectives', (select count(*) from public.perception_objectives where project_id = p_project_id and user_id = p_user_id),
      'routes', (select count(*) from public.perception_routes where project_id = p_project_id and user_id = p_user_id),
      'route_nodes', (select count(*) from public.perception_route_nodes where project_id = p_project_id and user_id = p_user_id),
      'permission_grants', (select count(*) from public.perception_permission_grants where project_id = p_project_id and user_id = p_user_id),
      'artifacts', (select count(*) from public.perception_artifacts where project_id = p_project_id and user_id = p_user_id),
      'verification_runs', (select count(*) from public.perception_verification_runs where project_id = p_project_id and user_id = p_user_id),
      'world_signals', (select count(*) from public.perception_world_signals where project_id = p_project_id and user_id = p_user_id),
      'worker_runs', (select count(*) from public.perception_worker_runs where project_id = p_project_id and user_id = p_user_id),
      'epistemic_ledger', (select count(*) from public.perception_epistemic_ledger where project_id = p_project_id and user_id = p_user_id),
      'execution_ledger', (select count(*) from public.perception_execution_ledger where project_id = p_project_id and user_id = p_user_id),
      'scenarios', (select count(*) from public.perception_scenarios where project_id = p_project_id and user_id = p_user_id)
    ),
    'checkpoints', jsonb_build_object(
      'project_updated_at', v_project.updated_at,
      'latest_model_event_at', (select max(created_at) from public.perception_model_events where project_id = p_project_id and user_id = p_user_id),
      'latest_epistemic_at', (select max(created_at) from public.perception_epistemic_ledger where project_id = p_project_id and user_id = p_user_id),
      'latest_execution_at', (select max(created_at) from public.perception_execution_ledger where project_id = p_project_id and user_id = p_user_id),
      'latest_verification_at', (select max(checked_at) from public.perception_verification_runs where project_id = p_project_id and user_id = p_user_id)
    )
  );

  return v_manifest;
end;
$$;

create or replace function public.perception_prepare_sovereign_export_internal(
  p_user_id uuid,
  p_project_id uuid,
  p_destination_class text,
  p_destination_ref_hash text default null,
  p_export_kind text default 'project_world'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_manifest jsonb;
  v_manifest_sha text;
  v_export_id uuid;
begin
  if p_destination_class not in ('lw_object_storage','lw_filesystem','lw_backup_system','isolated_restore') then
    raise exception 'Invalid sovereign export destination class' using errcode = '22023';
  end if;

  if p_export_kind not in ('project_world','full_database','restore_drill') then
    raise exception 'Invalid sovereign export kind' using errcode = '22023';
  end if;

  v_manifest := public.perception_build_sovereign_manifest_internal(p_user_id, p_project_id);
  v_manifest_sha := encode(digest(v_manifest::text, 'sha256'), 'hex');

  insert into public.perception_sovereign_exports (
    user_id,
    project_id,
    export_kind,
    destination_class,
    destination_ref_hash,
    manifest,
    manifest_sha256
  ) values (
    p_user_id,
    p_project_id,
    p_export_kind,
    p_destination_class,
    nullif(btrim(coalesce(p_destination_ref_hash,'')), ''),
    v_manifest,
    v_manifest_sha
  )
  returning id into v_export_id;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (
    p_user_id,
    p_project_id,
    'sovereign_export.prepared',
    jsonb_build_object(
      'export_id', v_export_id,
      'export_kind', p_export_kind,
      'destination_class', p_destination_class,
      'manifest_sha256', v_manifest_sha
    )
  );

  return jsonb_build_object(
    'ok', true,
    'export_id', v_export_id,
    'manifest_sha256', v_manifest_sha,
    'manifest', v_manifest
  );
end;
$$;

create or replace function public.perception_mark_sovereign_export_internal(
  p_user_id uuid,
  p_export_id uuid,
  p_archive_sha256 text,
  p_archive_bytes bigint,
  p_verified boolean default false,
  p_error_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_export public.perception_sovereign_exports%rowtype;
  v_status text;
begin
  select *
  into v_export
  from public.perception_sovereign_exports
  where id = p_export_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Sovereign export not found for user' using errcode = '42501';
  end if;

  if p_error_text is not null then
    v_status := 'failed';
  elsif p_verified then
    v_status := 'verified';
  else
    v_status := 'written';
  end if;

  if v_status <> 'failed' and (
    p_archive_sha256 is null
    or p_archive_sha256 !~ '^[0-9a-f]{64}$'
    or p_archive_bytes is null
    or p_archive_bytes < 0
  ) then
    raise exception 'Archive checksum and size are required' using errcode = '22023';
  end if;

  update public.perception_sovereign_exports
  set archive_sha256 = case when v_status = 'failed' then archive_sha256 else p_archive_sha256 end,
      archive_bytes = case when v_status = 'failed' then archive_bytes else p_archive_bytes end,
      status = v_status,
      error_text = case when v_status = 'failed' then left(p_error_text, 4000) else null end,
      written_at = case when v_status in ('written','verified') then coalesce(written_at, now()) else written_at end,
      verified_at = case when v_status = 'verified' then now() else verified_at end
  where id = p_export_id;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (
    v_export.user_id,
    v_export.project_id,
    case when v_status = 'verified' then 'sovereign_export.verified'
         when v_status = 'failed' then 'sovereign_export.failed'
         else 'sovereign_export.written' end,
    jsonb_strip_nulls(jsonb_build_object(
      'export_id', p_export_id,
      'status', v_status,
      'archive_sha256', case when v_status = 'failed' then null else p_archive_sha256 end,
      'archive_bytes', case when v_status = 'failed' then null else p_archive_bytes end
    ))
  );

  return jsonb_build_object('ok', true, 'export_id', p_export_id, 'status', v_status);
end;
$$;

revoke all on function public.perception_build_sovereign_manifest_internal(uuid,uuid)
  from public, anon, authenticated;
revoke all on function public.perception_prepare_sovereign_export_internal(uuid,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.perception_mark_sovereign_export_internal(uuid,uuid,text,bigint,boolean,text)
  from public, anon, authenticated;

grant execute on function public.perception_build_sovereign_manifest_internal(uuid,uuid)
  to service_role;
grant execute on function public.perception_prepare_sovereign_export_internal(uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.perception_mark_sovereign_export_internal(uuid,uuid,text,bigint,boolean,text)
  to service_role;

comment on table public.perception_storage_authority is
  'Machine-readable enforcement of the Perception Sovereign Storage Rule. AI-provider state is never canonical.';

comment on table public.perception_sovereign_exports is
  'Audit ledger for backups and restore drills written to Legacy Works Ventures-controlled storage.';
