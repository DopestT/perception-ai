-- Growth Operator v0.1 security and schema gate.
begin;

do $$
declare
  v_tables text[] := array[
    'perception_growth_sites',
    'perception_growth_runs',
    'perception_growth_pages',
    'perception_growth_opportunities'
  ];
  v_table text;
  v_rls boolean;
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'missing growth table: %', v_table;
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
      raise exception 'authenticated role has growth write access on %', v_table;
    end if;
  end loop;
end;
$$;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.perception_get_growth_dashboard(uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role cannot read growth dashboard';
  end if;

  if has_function_privilege(
    'anon',
    'public.perception_get_growth_dashboard(uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon role can execute growth dashboard';
  end if;
end;
$$;

rollback;
