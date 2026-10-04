\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email)
values ('00000000-0000-0000-0000-000000000991','sovereign-gate@example.invalid')
on conflict (id) do nothing;

insert into public.perception_projects(id,user_id,name,desired_reality,current_reality)
values (
  '00000000-0000-0000-0000-000000000992',
  '00000000-0000-0000-0000-000000000991',
  'Sovereign storage gate',
  'Perception remains recoverable without provider memory.',
  'Canonical state is held in the Perception database.'
)
on conflict (id) do nothing;

insert into public.perception_objectives(
  id,user_id,project_id,statement,desired_reality,current_reality
) values (
  '00000000-0000-0000-0000-000000000993',
  '00000000-0000-0000-0000-000000000991',
  '00000000-0000-0000-0000-000000000992',
  'Verify sovereign storage.',
  'Provider state can disappear without losing project truth.',
  'Testing the canonical manifest.'
)
on conflict (id) do nothing;

do $$
declare
  v_authority public.perception_storage_authority%rowtype;
  v_manifest jsonb;
  v_export jsonb;
  v_export_id uuid;
  v_mark jsonb;
begin
  select *
  into v_authority
  from public.perception_storage_authority
  where authority_key='canonical';

  if v_authority.owner_organization <> 'Legacy Works Ventures' then
    raise exception 'FAIL: wrong sovereign owner';
  end if;

  if v_authority.provider_state_authoritative
     or v_authority.conversation_history_authoritative
     or v_authority.provider_vector_store_authoritative
     or v_authority.provider_thread_authoritative then
    raise exception 'FAIL: provider state was marked authoritative';
  end if;

  v_manifest := public.perception_build_sovereign_manifest_internal(
    '00000000-0000-0000-0000-000000000991',
    '00000000-0000-0000-0000-000000000992'
  );

  if v_manifest->>'schema' <> 'perception-sovereign-manifest/v1' then
    raise exception 'FAIL: sovereign manifest schema missing';
  end if;

  if (v_manifest #>> '{authority,owner}') <> 'Legacy Works Ventures' then
    raise exception 'FAIL: manifest authority owner mismatch';
  end if;

  if (v_manifest #>> '{row_counts,objectives}')::integer < 1 then
    raise exception 'FAIL: canonical objective did not appear in manifest';
  end if;

  v_export := public.perception_prepare_sovereign_export_internal(
    '00000000-0000-0000-0000-000000000991',
    '00000000-0000-0000-0000-000000000992',
    'lw_backup_system',
    repeat('a',64),
    'project_world'
  );

  v_export_id := (v_export->>'export_id')::uuid;

  if length(v_export->>'manifest_sha256') <> 64 then
    raise exception 'FAIL: manifest checksum was not produced';
  end if;

  v_mark := public.perception_mark_sovereign_export_internal(
    '00000000-0000-0000-0000-000000000991',
    v_export_id,
    repeat('b',64),
    4096,
    true,
    null
  );

  if v_mark->>'status' <> 'verified' then
    raise exception 'FAIL: restore/export verification state was not persisted';
  end if;

  if not exists (
    select 1
    from public.perception_model_events
    where project_id='00000000-0000-0000-0000-000000000992'
      and event_type='sovereign_export.verified'
  ) then
    raise exception 'FAIL: sovereign export verification was not audited';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname='perception_sovereign_exports'
      and c.relrowsecurity
  ) then
    raise exception 'FAIL: sovereign export table does not have RLS enabled';
  end if;

  if has_table_privilege('authenticated','public.perception_sovereign_exports','insert')
     or has_table_privilege('authenticated','public.perception_sovereign_exports','update')
     or has_table_privilege('authenticated','public.perception_sovereign_exports','delete') then
    raise exception 'FAIL: browser-authenticated role can mutate sovereign export ledger';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.perception_prepare_sovereign_export_internal(uuid,uuid,text,text,text)',
    'execute'
  ) then
    raise exception 'FAIL: browser-authenticated role can prepare privileged sovereign exports';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.perception_prepare_sovereign_export_internal(uuid,uuid,text,text,text)',
    'execute'
  ) then
    raise exception 'FAIL: service role cannot prepare sovereign exports';
  end if;
end
$$;

rollback;

\echo 'PASS: Perception sovereign storage gate'
