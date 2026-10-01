-- Growth Operator v0.2 — unattended scan scheduling.
-- Adds a bounded scheduler while preserving approval-required publishing.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.perception_growth_sites
  add column if not exists scan_interval_minutes integer not null default 360,
  add column if not exists next_scan_at timestamptz not null default now(),
  add column if not exists last_scan_at timestamptz,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists last_error text;

alter table public.perception_growth_sites
  drop constraint if exists perception_growth_sites_scan_interval_check;
alter table public.perception_growth_sites
  add constraint perception_growth_sites_scan_interval_check
  check (scan_interval_minutes between 60 and 10080);

alter table public.perception_growth_sites
  drop constraint if exists perception_growth_sites_consecutive_failures_check;
alter table public.perception_growth_sites
  add constraint perception_growth_sites_consecutive_failures_check
  check (consecutive_failures >= 0);

create index if not exists perception_growth_sites_due_idx
  on public.perception_growth_sites(next_scan_at)
  where enabled = true;

-- This table already exists in production from Continuous Mind. Creating it
-- here keeps the Growth Operator migration independently replayable in CI.
create table if not exists public.perception_runtime_secret_hashes (
  secret_name text primary key,
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  rotated_at timestamptz not null default now()
);

alter table public.perception_runtime_secret_hashes enable row level security;

drop policy if exists perception_runtime_secret_hashes_service_select
  on public.perception_runtime_secret_hashes;
create policy perception_runtime_secret_hashes_service_select
  on public.perception_runtime_secret_hashes for select
  to service_role
  using (true);

revoke all on public.perception_runtime_secret_hashes from public, anon, authenticated;
grant select on public.perception_runtime_secret_hashes to service_role;

create or replace function public.perception_claim_due_growth_sites_internal(
  p_limit integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if p_limit < 1 or p_limit > 10 then
    raise exception 'Growth site claim limit must be between 1 and 10'
      using errcode = '22023';
  end if;

  with due as (
    select s.id
    from public.perception_growth_sites s
    where s.enabled = true
      and s.next_scan_at <= now()
    order by s.next_scan_at, s.updated_at
    for update skip locked
    limit p_limit
  ),
  claimed as (
    update public.perception_growth_sites s
    set
      next_scan_at = now() + make_interval(mins => s.scan_interval_minutes),
      updated_at = now()
    from due
    where s.id = due.id
    returning s.*
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'user_id', c.user_id,
      'project_id', c.project_id,
      'site_url', c.site_url,
      'canonical_host', c.canonical_host,
      'repository', c.repository,
      'primary_goal', c.primary_goal,
      'conversion_event', c.conversion_event,
      'publishing_mode', c.publishing_mode,
      'enabled', c.enabled,
      'scan_interval_minutes', c.scan_interval_minutes
    )
    order by c.next_scan_at
  ), '[]'::jsonb)
  into v_result
  from claimed c;

  return v_result;
end;
$$;

create or replace function public.perception_complete_growth_scan_internal(
  p_site_id uuid,
  p_success boolean,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_site public.perception_growth_sites%rowtype;
  v_failures integer;
  v_next timestamptz;
begin
  select * into v_site
  from public.perception_growth_sites
  where id = p_site_id
  for update;

  if not found then
    raise exception 'Growth site not found' using errcode = 'P0002';
  end if;

  if coalesce(p_success, false) then
    v_failures := 0;
    v_next := now() + make_interval(mins => v_site.scan_interval_minutes);
  else
    v_failures := v_site.consecutive_failures + 1;
    v_next := now() + case
      when v_failures = 1 then interval '30 minutes'
      when v_failures = 2 then interval '1 hour'
      when v_failures = 3 then interval '3 hours'
      else interval '12 hours'
    end;
  end if;

  update public.perception_growth_sites
  set
    last_scan_at = now(),
    next_scan_at = v_next,
    consecutive_failures = v_failures,
    last_error = case
      when p_success then null
      else left(coalesce(p_error, 'growth scan failed'), 1200)
    end,
    updated_at = now()
  where id = p_site_id;

  return jsonb_build_object(
    'ok', true,
    'site_id', p_site_id,
    'success', coalesce(p_success, false),
    'consecutive_failures', v_failures,
    'next_scan_at', v_next
  );
end;
$$;

revoke all on function public.perception_claim_due_growth_sites_internal(integer)
  from public, anon, authenticated;
revoke all on function public.perception_complete_growth_scan_internal(uuid,boolean,text)
  from public, anon, authenticated;
grant execute on function public.perception_claim_due_growth_sites_internal(integer)
  to service_role;
grant execute on function public.perception_complete_growth_scan_internal(uuid,boolean,text)
  to service_role;

-- Create/recover a scheduler token entirely inside Postgres. The token is
-- never returned through the Data API or committed to source control.
do $$
declare
  v_token text;
begin
  if to_regnamespace('vault') is null then
    return;
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'perception_growth_operator_cron_token'
  limit 1;

  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    perform vault.create_secret(
      v_token,
      'perception_growth_operator_cron_token',
      'Authenticates scheduled Perception Growth Operator scans.'
    );
  end if;

  insert into public.perception_runtime_secret_hashes(
    secret_name, secret_hash, rotated_at
  ) values (
    'growth_operator_cron',
    encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    now()
  )
  on conflict (secret_name) do update
    set secret_hash = excluded.secret_hash,
        rotated_at = excluded.rotated_at;
end;
$$;

-- Run the scheduler frequently; each site controls its own much slower scan
-- cadence through scan_interval_minutes.
do $$
declare
  v_job record;
begin
  if to_regnamespace('cron') is null
     or to_regnamespace('net') is null
     or to_regnamespace('vault') is null then
    return;
  end if;

  for v_job in
    select jobid from cron.job where jobname = 'perception-growth-operator'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'perception-growth-operator',
    '*/30 * * * *',
    $job$
      select net.http_post(
        url := 'https://zxmdfmiueapjhktqchts.supabase.co/functions/v1/growth-operator',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-perception-growth-token', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'perception_growth_operator_cron_token'
            limit 1
          )
        ),
        body := '{"action":"scheduled_scan"}'::jsonb,
        timeout_milliseconds := 90000
      );
    $job$
  );
end;
$$;
