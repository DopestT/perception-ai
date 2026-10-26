-- LMTYAI Max C revenue intelligence security/schema gate.
begin;

do $$
declare
  v_tables text[] := array[
    'lmtyai_revenue_events',
    'lmtyai_revenue_reconciliations'
  ];
  v_table text;
  v_rls boolean;
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'missing Max C table: %', v_table;
    end if;

    select c.relrowsecurity
      into v_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = v_table;

    if not coalesce(v_rls, false) then
      raise exception 'RLS disabled on %', v_table;
    end if;

    if has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
      or has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
      or has_table_privilege('authenticated', 'public.' || v_table, 'DELETE') then
      raise exception 'authenticated role has Max C write access on %', v_table;
    end if;

    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
      or has_table_privilege('anon', 'public.' || v_table, 'INSERT')
      or has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
      or has_table_privilege('anon', 'public.' || v_table, 'DELETE') then
      raise exception 'anon role has Max C table access on %', v_table;
    end if;
  end loop;
end;
$$;

do $$
begin
  if to_regprocedure('public.lmtyai_get_revenue_dashboard(uuid,timestamp with time zone,timestamp with time zone)') is null then
    raise exception 'missing Max C dashboard RPC';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.lmtyai_get_revenue_dashboard(uuid,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role cannot read Max C dashboard';
  end if;

  if has_function_privilege(
    'anon',
    'public.lmtyai_get_revenue_dashboard(uuid,timestamp with time zone,timestamp with time zone)',
    'EXECUTE'
  ) then
    raise exception 'anon role can execute Max C dashboard';
  end if;

  if to_regprocedure('public.lmtyai_get_stripe_webhook_secret()') is null then
    raise exception 'missing Stripe Vault accessor';
  end if;

  if has_function_privilege('authenticated', 'public.lmtyai_get_stripe_webhook_secret()', 'EXECUTE')
    or has_function_privilege('anon', 'public.lmtyai_get_stripe_webhook_secret()', 'EXECUTE') then
    raise exception 'client role can execute Stripe Vault accessor';
  end if;
end;
$$;

do $$
declare
  v_unique boolean;
begin
  select exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'lmtyai_revenue_events'
      and indexdef ilike '%unique%'
      and indexdef ilike '%provider%'
      and indexdef ilike '%provider_event_id%'
  ) into v_unique;

  if not v_unique then
    raise exception 'missing provider event idempotency uniqueness';
  end if;
end;
$$;

rollback;
