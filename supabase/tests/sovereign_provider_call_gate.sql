\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email)
values ('00000000-0000-0000-0000-000000000981','provider-audit@example.invalid')
on conflict (id) do nothing;

insert into public.perception_projects(
  id,user_id,name,desired_reality,current_reality
) values (
  '00000000-0000-0000-0000-000000000982',
  '00000000-0000-0000-0000-000000000981',
  'Provider audit gate',
  'Provider calls remain bounded and non-authoritative.',
  'Canonical state is held by Perception.'
)
on conflict (id) do nothing;

insert into public.perception_objectives(
  id,user_id,project_id,statement,desired_reality,current_reality
) values (
  '00000000-0000-0000-0000-000000000983',
  '00000000-0000-0000-0000-000000000981',
  '00000000-0000-0000-0000-000000000982',
  'Audit provider provenance.',
  'Every provider attempt is recoverable from LWV-controlled state.',
  'Testing provider-call provenance.'
)
on conflict (id) do nothing;

do $$
declare
  v_call_id uuid;
  v_manifest jsonb;
begin
  v_call_id := public.perception_record_provider_call_internal(
    '00000000-0000-0000-0000-000000000981',
    '00000000-0000-0000-0000-000000000982',
    '00000000-0000-0000-0000-000000000983',
    null,
    'reason',
    'meaning_resolver',
    'resolve',
    1,
    'openai',
    'test-model',
    'responses',
    'balanced',
    true,
    null,
    100,
    20,
    50,
    5,
    'store_false',
    '{"routing_strategy":"verified-cheapest-first"}'::jsonb
  );

  if v_call_id is null then
    raise exception 'FAIL: provider call was not persisted';
  end if;

  if not exists (
    select 1
    from public.perception_provider_calls
    where id=v_call_id
      and bounded_copy=true
      and provider_state_authoritative=false
      and canonical_dependency=false
      and provider_storage_directive='store_false'
  ) then
    raise exception 'FAIL: sovereign provider flags were not persisted';
  end if;

  -- Same canonical attempt is idempotent.
  if public.perception_record_provider_call_internal(
    '00000000-0000-0000-0000-000000000981',
    '00000000-0000-0000-0000-000000000982',
    '00000000-0000-0000-0000-000000000983',
    null,
    'reason',
    'meaning_resolver',
    'resolve',
    1,
    'openai',
    'test-model',
    'responses',
    'balanced',
    true,
    null,
    100,
    20,
    50,
    5,
    'store_false',
    '{}'::jsonb
  ) <> v_call_id then
    raise exception 'FAIL: provider call retry did not resolve to canonical row';
  end if;

  begin
    perform public.perception_record_provider_call_internal(
      '00000000-0000-0000-0000-000000000981',
      '00000000-0000-0000-0000-000000000982',
      '00000000-0000-0000-0000-000000000983',
      null,
      'reason',
      'invalid_openai_storage',
      'resolve',
      1,
      'openai',
      'test-model',
      'responses',
      'balanced',
      true,
      null,
      1,0,1,0,
      'none',
      '{}'::jsonb
    );
    raise exception 'FAIL: OpenAI provider call without store_false was accepted';
  exception
    when check_violation or invalid_parameter_value then
      null;
    when others then
      if sqlstate <> '22023' then raise; end if;
  end;

  v_manifest := public.perception_build_sovereign_manifest_internal(
    '00000000-0000-0000-0000-000000000981',
    '00000000-0000-0000-0000-000000000982'
  );

  if (v_manifest #>> '{row_counts,provider_calls}')::integer <> 1 then
    raise exception 'FAIL: sovereign manifest does not count provider-call provenance';
  end if;

  if (v_manifest #>> '{checkpoints,latest_provider_call_at}') is null then
    raise exception 'FAIL: sovereign manifest lacks provider-call checkpoint';
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
      and c.relname='perception_provider_calls'
      and c.relrowsecurity
  ) then
    raise exception 'FAIL: provider-call ledger does not have RLS enabled';
  end if;

  if has_table_privilege('authenticated','public.perception_provider_calls','insert')
     or has_table_privilege('authenticated','public.perception_provider_calls','update')
     or has_table_privilege('authenticated','public.perception_provider_calls','delete') then
    raise exception 'FAIL: browser-authenticated role can mutate provider-call provenance';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.perception_record_provider_call_internal(uuid,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,boolean,text,bigint,bigint,bigint,bigint,text,jsonb)',
    'execute'
  ) then
    raise exception 'FAIL: browser-authenticated role can write privileged provider provenance';
  end if;
end
$$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000981',false);
set role authenticated;

do $$
declare
  v_dashboard jsonb;
begin
  v_dashboard := public.perception_get_sovereignty_dashboard(
    '00000000-0000-0000-0000-000000000982'
  );

  if (v_dashboard #>> '{authority,owner_organization}') <> 'Legacy Works Ventures' then
    raise exception 'FAIL: sovereignty dashboard lost canonical owner';
  end if;

  if (v_dashboard #>> '{provider_summary_24h,calls_24h}')::integer <> 1 then
    raise exception 'FAIL: sovereignty dashboard provider-call count is wrong';
  end if;

  if (v_dashboard #>> '{provider_summary_24h,openai_store_false_24h}')::integer <> 1 then
    raise exception 'FAIL: sovereignty dashboard does not prove store_false for OpenAI call';
  end if;

  if jsonb_array_length(v_dashboard->'recent_provider_calls') <> 1 then
    raise exception 'FAIL: sovereignty dashboard recent provider-call list is wrong';
  end if;
end
$$;

reset role;
rollback;

\echo 'PASS: Perception sovereign provider-call audit gate'
