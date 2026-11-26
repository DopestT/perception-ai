-- PROPOSAL ONLY. NOT an applied migration. No production schema changes.
-- Generate a numbered migration via Supabase CLI and run security advisors
-- after explicit production approval. The website's /api/search fails closed
-- until this function exists AND a server-only credential is supplied.
--
-- Per-request atomic quota, initial restricted pilot: 20 total queries/day
-- and 5 queries per caller/day. The external provider must ALSO have an
-- enforceable hard billing cap. No raw IP or search query is persisted.
--
-- HMAC bucket input is a salted, rotating (day + IP) 64-byte hex fingerprint,
-- generated on the server. No public client access to table or function.

create table if not exists public.perception_guest_search_quota_daily (
  day_utc date not null,
  bucket text not null,
  request_count integer not null default 0 check (request_count between 0 and 20),
  created_at timestamptz not null default now(),
  primary key (day_utc, bucket)
);

alter table public.perception_guest_search_quota_daily enable row level security;
revoke all on table public.perception_guest_search_quota_daily
  from public, anon, authenticated;
-- Service-role adapter needs explicit, narrowly scoped table privileges.
grant select, insert, update on public.perception_guest_search_quota_daily
  to service_role;

-- Use only the server's service_role privileges; do not add anon policies.
create or replace function public.perception_reserve_guest_search_quota(p_ip_hash text)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_count integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  -- Per-fingerprint quota first. ON CONFLICT row-level locking is atomic.
  insert into public.perception_guest_search_quota_daily(day_utc, bucket, request_count)
  values (v_day, 'ip:' || p_ip_hash, 1)
  on conflict (day_utc, bucket) do update
    set request_count = public.perception_guest_search_quota_daily.request_count + 1
    where public.perception_guest_search_quota_daily.request_count < 5
  returning request_count into v_count;
  if v_count is null then return false; end if;

  -- Shared daily hard stop for all guests (conservative pilot).
  v_count := null;
  insert into public.perception_guest_search_quota_daily(day_utc, bucket, request_count)
  values (v_day, 'global', 1)
  on conflict (day_utc, bucket) do update
    set request_count = public.perception_guest_search_quota_daily.request_count + 1
    where public.perception_guest_search_quota_daily.request_count < 20
  returning request_count into v_count;

  -- A denied global request consumes its IP slot but incurs no paid API call.
  return v_count is not null;
end;
$$;

revoke all on function public.perception_reserve_guest_search_quota(text)
  from public, anon, authenticated;
grant execute on function public.perception_reserve_guest_search_quota(text)
  to service_role;

-- Post-approval deployment validation (read-only):
-- SELECT has_function_privilege('anon',
--   'public.perception_reserve_guest_search_quota(text)', 'execute') AS anon_can_execute;
-- SELECT has_function_privilege('service_role',
--   'public.perception_reserve_guest_search_quota(text)', 'execute') AS service_can_execute;
--
-- Required tests BEFORE switching on guest traffic:
-- - concurrent reservations cannot exceed total cap of 20
-- - single fingerprint cannot exceed 5
-- - anon/authenticated cannot execute RPC; no access to quota table
-- - malformed fingerprints denied
-- - simulated RPC outage yields 503 before Brave receives ANY request
-- - cleanup/retention plan approved for hashes (e.g. drop rows >30 days)
-- - provider hard monthly cap/credit check and approved WAF settings
