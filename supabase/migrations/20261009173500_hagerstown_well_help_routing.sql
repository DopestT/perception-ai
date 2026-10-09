-- Durable, practice-first routing ledger for Perception microsites.
-- No Hagerstown Well Help production config or provider partnership is seeded here.

alter table public.perception_microsite_leads
  add column if not exists state text not null default 'NEW',
  add column if not exists service_key text,
  add column if not exists urgency text,
  add column if not exists normalized_phone_hash text,
  add column if not exists normalized_email_hash text,
  add column if not exists submission_fingerprint text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.perception_microsite_leads
  drop constraint if exists perception_microsite_leads_state_check,
  add constraint perception_microsite_leads_state_check check (
    state in ('NEW','QUALIFIED','ROUTING','ACCEPTED','CONTACTED','APPOINTMENT','COMPLETED','DUPLICATE','UNQUALIFIED','UNROUTABLE','LOST','CANCELLED','MANUAL_REVIEW')
  ),
  drop constraint if exists perception_microsite_leads_service_key_check,
  add constraint perception_microsite_leads_service_key_check check (
    service_key is null or service_key in ('NO_WATER','WELL_PUMP','LOW_PRESSURE','PRESSURE_TANK','WATER_TREATMENT','WELL_DIAGNOSTIC')
  ),
  drop constraint if exists perception_microsite_leads_urgency_check,
  add constraint perception_microsite_leads_urgency_check check (urgency is null or urgency in ('EMERGENCY','ROUTINE'));

create table if not exists public.perception_microsite_routing_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  microsite_id uuid not null unique references public.perception_microsites(id) on delete cascade,
  program_key text not null,
  mode text not null default 'PRACTICE' check (mode in ('PRACTICE','LIVE_DISABLED','LIVE')),
  service_area_rules jsonb not null default '[]'::jsonb check (jsonb_typeof(service_area_rules) = 'array'),
  emergency_timeout_seconds integer not null default 300 check (emergency_timeout_seconds between 30 and 86400),
  routine_timeout_seconds integer not null default 1800 check (routine_timeout_seconds between 30 and 86400),
  duplicate_window_minutes integer not null default 30 check (duplicate_window_minutes between 1 and 1440),
  outbound_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perception_microsite_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  status text not null default 'PAUSED' check (status in ('ACTIVE','PAUSED','DISABLED')),
  service_keys jsonb not null default '[]'::jsonb check (jsonb_typeof(service_keys) = 'array'),
  service_areas jsonb not null default '[]'::jsonb check (jsonb_typeof(service_areas) = 'array'),
  emergency_capable boolean not null default false,
  accepting_new_work boolean not null default false,
  routing_channel text not null,
  routing_destination text not null,
  priority_bias numeric(6,2) not null default 0 check (priority_bias between -20 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.perception_microsite_leads
  add column if not exists accepted_provider_id uuid references public.perception_microsite_providers(id) on delete set null;

alter table public.perception_microsite_revenue
  add column if not exists provider_id uuid references public.perception_microsite_providers(id) on delete set null;

create table if not exists public.perception_microsite_lead_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.perception_microsite_leads(id) on delete cascade,
  route_status text not null default 'ACTIVE' check (route_status in ('PENDING','ACTIVE','ACCEPTED','EXHAUSTED','CANCELLED')),
  urgency text not null check (urgency in ('EMERGENCY','ROUTINE')),
  service_key text not null check (service_key in ('NO_WATER','WELL_PUMP','LOW_PRESSURE','PRESSURE_TANK','WATER_TREATMENT','WELL_DIAGNOSTIC')),
  service_area_key text not null,
  practice boolean not null default true,
  accepted_provider_id uuid references public.perception_microsite_providers(id) on delete set null,
  idempotency_key text not null,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.perception_microsite_lead_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  route_id uuid not null references public.perception_microsite_lead_routes(id) on delete cascade,
  lead_id uuid not null references public.perception_microsite_leads(id) on delete cascade,
  provider_id uuid not null references public.perception_microsite_providers(id) on delete cascade,
  rank integer not null check (rank > 0),
  score numeric(8,3) not null,
  score_reasons jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING','SENT','ACCEPTED','PASSED','EXPIRED','DELIVERY_FAILED','CANCELLED')),
  idempotency_key text not null,
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz,
  delivery_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table if not exists public.perception_microsite_lead_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.perception_microsite_leads(id) on delete cascade,
  route_id uuid references public.perception_microsite_lead_routes(id) on delete cascade,
  offer_id uuid references public.perception_microsite_lead_offers(id) on delete cascade,
  event_type text not null,
  previous_state text,
  next_state text,
  actor_source text not null default 'system',
  provider_id uuid references public.perception_microsite_providers(id) on delete set null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  practice boolean not null default true,
  occurred_at timestamptz not null default now(),
  unique (lead_id, idempotency_key)
);

create unique index if not exists perception_microsite_one_unresolved_route_idx
  on public.perception_microsite_lead_routes(lead_id)
  where route_status in ('PENDING','ACTIVE');

create unique index if not exists perception_microsite_one_active_offer_provider_lead_idx
  on public.perception_microsite_lead_offers(lead_id, provider_id)
  where status in ('PENDING','SENT');

create index if not exists perception_microsite_leads_fingerprint_idx
  on public.perception_microsite_leads(microsite_id, submission_fingerprint, occurred_at desc);
create index if not exists perception_microsite_leads_phone_hash_idx
  on public.perception_microsite_leads(microsite_id, normalized_phone_hash, occurred_at desc) where normalized_phone_hash is not null;
create index if not exists perception_microsite_leads_email_hash_idx
  on public.perception_microsite_leads(microsite_id, normalized_email_hash, occurred_at desc) where normalized_email_hash is not null;
create index if not exists perception_microsite_routes_user_idx on public.perception_microsite_lead_routes(user_id, created_at desc);
create index if not exists perception_microsite_offers_route_idx on public.perception_microsite_lead_offers(route_id, rank);
create index if not exists perception_microsite_events_lead_idx on public.perception_microsite_lead_events(lead_id, occurred_at);
create index if not exists perception_microsite_revenue_provider_idx on public.perception_microsite_revenue(provider_id, occurred_at desc);

alter table public.perception_microsite_routing_configs enable row level security;
alter table public.perception_microsite_providers enable row level security;
alter table public.perception_microsite_lead_routes enable row level security;
alter table public.perception_microsite_lead_offers enable row level security;
alter table public.perception_microsite_lead_events enable row level security;

create policy "users read own microsite routing configs" on public.perception_microsite_routing_configs for select using ((select auth.uid()) = user_id);
create policy "users read own microsite providers" on public.perception_microsite_providers for select using ((select auth.uid()) = user_id);
create policy "users read own microsite routes" on public.perception_microsite_lead_routes for select using ((select auth.uid()) = user_id);
create policy "users read own microsite offers" on public.perception_microsite_lead_offers for select using ((select auth.uid()) = user_id);
create policy "users read own microsite events" on public.perception_microsite_lead_events for select using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.perception_microsite_routing_configs from anon, authenticated;
revoke insert, update, delete on public.perception_microsite_providers from anon, authenticated;
revoke insert, update, delete on public.perception_microsite_lead_routes from anon, authenticated;
revoke insert, update, delete on public.perception_microsite_lead_offers from anon, authenticated;
revoke insert, update, delete on public.perception_microsite_lead_events from anon, authenticated;

grant select on public.perception_microsite_routing_configs to authenticated;
grant select on public.perception_microsite_providers to authenticated;
grant select on public.perception_microsite_lead_routes to authenticated;
grant select on public.perception_microsite_lead_offers to authenticated;
grant select on public.perception_microsite_lead_events to authenticated;

create or replace function public.perception_ingest_microsite_lead(
  p_user_id uuid,
  p_microsite_id uuid,
  p_channel text,
  p_source_path text,
  p_metadata jsonb,
  p_phone_hash text,
  p_email_hash text,
  p_submission_fingerprint text,
  p_duplicate_window_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing uuid;
  v_lead uuid;
  v_state text := 'NEW';
  v_since timestamptz := now() - make_interval(mins => greatest(1, least(coalesce(p_duplicate_window_minutes, 30), 1440)));
begin
  if p_submission_fingerprint is null or btrim(p_submission_fingerprint) = '' then
    raise exception 'submission fingerprint required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.perception_microsites where id=p_microsite_id and user_id=p_user_id) then
    raise exception 'microsite not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_microsite_id::text || ':' || p_submission_fingerprint, 0));

  select id into v_existing
  from public.perception_microsite_leads
  where microsite_id=p_microsite_id
    and submission_fingerprint=p_submission_fingerprint
    and occurred_at >= v_since
  order by occurred_at desc
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('lead_id',v_existing,'duplicate',true,'manual_review',false);
  end if;

  if exists (
    select 1 from public.perception_microsite_leads
    where microsite_id=p_microsite_id
      and occurred_at >= v_since
      and (
        (p_phone_hash is not null and normalized_phone_hash=p_phone_hash)
        or (p_email_hash is not null and normalized_email_hash=p_email_hash)
      )
  ) then
    v_state := 'MANUAL_REVIEW';
  end if;

  insert into public.perception_microsite_leads(
    user_id,microsite_id,channel,source_path,metadata,state,
    normalized_phone_hash,normalized_email_hash,submission_fingerprint
  ) values (
    p_user_id,p_microsite_id,p_channel,p_source_path,coalesce(p_metadata,'{}'::jsonb),v_state,
    nullif(p_phone_hash,''),nullif(p_email_hash,''),p_submission_fingerprint
  ) returning id into v_lead;

  return jsonb_build_object('lead_id',v_lead,'duplicate',false,'manual_review',v_state='MANUAL_REVIEW');
end;
$$;

create or replace function public.perception_start_microsite_route(
  p_lead_id uuid,
  p_service_key text,
  p_service_area_key text,
  p_urgency text,
  p_practice boolean,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_route uuid;
  v_existing uuid;
  v_previous text;
begin
  select user_id,state into v_user,v_previous from public.perception_microsite_leads where id=p_lead_id for update;
  if v_user is null then raise exception 'lead not found' using errcode='P0002'; end if;
  if v_previous <> 'QUALIFIED' and v_previous <> 'ROUTING' then raise exception 'lead is not qualified'; end if;

  select id into v_existing from public.perception_microsite_lead_routes where user_id=v_user and idempotency_key=p_idempotency_key limit 1;
  if v_existing is not null then return v_existing; end if;
  select id into v_existing from public.perception_microsite_lead_routes where lead_id=p_lead_id and route_status in ('PENDING','ACTIVE') limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into public.perception_microsite_lead_routes(user_id,lead_id,route_status,urgency,service_key,service_area_key,practice,idempotency_key)
  values(v_user,p_lead_id,'ACTIVE',p_urgency,p_service_key,p_service_area_key,coalesce(p_practice,true),p_idempotency_key)
  returning id into v_route;

  update public.perception_microsite_leads set state='ROUTING',service_key=p_service_key,urgency=p_urgency,updated_at=now() where id=p_lead_id;
  insert into public.perception_microsite_lead_events(user_id,lead_id,route_id,event_type,previous_state,next_state,idempotency_key,practice)
  values(v_user,p_lead_id,v_route,'route.started',v_previous,'ROUTING',p_idempotency_key || ':event',coalesce(p_practice,true));
  return v_route;
end;
$$;

create or replace function public.perception_create_microsite_offer(
  p_route_id uuid,
  p_provider_id uuid,
  p_rank integer,
  p_score numeric,
  p_score_reasons jsonb,
  p_expires_at timestamptz,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_route public.perception_microsite_lead_routes%rowtype;
  v_provider public.perception_microsite_providers%rowtype;
  v_offer uuid;
begin
  select * into v_route from public.perception_microsite_lead_routes where id=p_route_id for update;
  if v_route.id is null then raise exception 'route not found' using errcode='P0002'; end if;
  select id into v_offer from public.perception_microsite_lead_offers where user_id=v_route.user_id and idempotency_key=p_idempotency_key limit 1;
  if v_offer is not null then return v_offer; end if;
  if v_route.route_status <> 'ACTIVE' then raise exception 'route is not active'; end if;

  select * into v_provider from public.perception_microsite_providers where id=p_provider_id and user_id=v_route.user_id;
  if v_provider.id is null then raise exception 'provider not found' using errcode='P0002'; end if;
  if v_provider.status <> 'ACTIVE' or not v_provider.accepting_new_work
     or not (v_provider.service_keys ? v_route.service_key)
     or not (v_provider.service_areas ? v_route.service_area_key)
     or (v_route.urgency='EMERGENCY' and not v_provider.emergency_capable) then
    raise exception 'provider is not eligible';
  end if;

  insert into public.perception_microsite_lead_offers(
    user_id,route_id,lead_id,provider_id,rank,score,score_reasons,status,idempotency_key,expires_at
  ) values(
    v_route.user_id,v_route.id,v_route.lead_id,p_provider_id,p_rank,p_score,coalesce(p_score_reasons,'{}'::jsonb),'PENDING',p_idempotency_key,p_expires_at
  ) returning id into v_offer;

  insert into public.perception_microsite_lead_events(user_id,lead_id,route_id,offer_id,event_type,provider_id,idempotency_key,metadata,practice)
  values(v_route.user_id,v_route.lead_id,v_route.id,v_offer,'offer.created',p_provider_id,p_idempotency_key || ':event',jsonb_build_object('rank',p_rank,'score',p_score),v_route.practice);
  return v_offer;
end;
$$;

create or replace function public.perception_resolve_microsite_offer(
  p_offer_id uuid,
  p_outcome text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.perception_microsite_lead_offers%rowtype;
  v_status text;
  v_event text;
begin
  select * into v_offer from public.perception_microsite_lead_offers where id=p_offer_id for update;
  if v_offer.id is null then raise exception 'offer not found' using errcode='P0002'; end if;

  if exists(select 1 from public.perception_microsite_lead_events where lead_id=v_offer.lead_id and idempotency_key=p_idempotency_key) then
    return jsonb_build_object('status',lower(v_offer.status));
  end if;
  if v_offer.status not in ('PENDING','SENT') then
    return jsonb_build_object('status',lower(v_offer.status));
  end if;

  v_status := upper(p_outcome);
  if v_status not in ('PASSED','EXPIRED','DELIVERY_FAILED','CANCELLED') then raise exception 'invalid offer outcome'; end if;
  if v_status='EXPIRED' and now() < v_offer.expires_at then return jsonb_build_object('status','not_expired'); end if;
  v_event := case v_status when 'PASSED' then 'offer.passed' when 'EXPIRED' then 'offer.expired' when 'DELIVERY_FAILED' then 'offer.delivery_failed' else 'offer.cancelled' end;

  update public.perception_microsite_lead_offers set status=v_status,responded_at=now() where id=p_offer_id;
  insert into public.perception_microsite_lead_events(user_id,lead_id,route_id,offer_id,event_type,provider_id,idempotency_key,practice)
  select v_offer.user_id,v_offer.lead_id,v_offer.route_id,v_offer.id,v_event,v_offer.provider_id,p_idempotency_key,r.practice
  from public.perception_microsite_lead_routes r where r.id=v_offer.route_id;
  return jsonb_build_object('status',lower(v_status));
end;
$$;

create or replace function public.perception_accept_microsite_offer(
  p_offer_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offer public.perception_microsite_lead_offers%rowtype;
  v_route public.perception_microsite_lead_routes%rowtype;
  v_previous text;
begin
  select * into v_offer from public.perception_microsite_lead_offers where id=p_offer_id;
  if v_offer.id is null then raise exception 'offer not found' using errcode='P0002'; end if;
  select * into v_route from public.perception_microsite_lead_routes where id=v_offer.route_id for update;

  if v_route.accepted_provider_id is not null then
    if v_route.accepted_provider_id=v_offer.provider_id and v_offer.status='ACCEPTED' then
      return jsonb_build_object('status','accepted','provider_id',v_offer.provider_id);
    end if;
    return jsonb_build_object('status','already_assigned','provider_id',v_route.accepted_provider_id);
  end if;
  if v_offer.status not in ('PENDING','SENT') then return jsonb_build_object('status',lower(v_offer.status)); end if;
  if now() > v_offer.expires_at then
    update public.perception_microsite_lead_offers set status='EXPIRED',responded_at=now() where id=v_offer.id;
    return jsonb_build_object('status','expired');
  end if;

  select state into v_previous from public.perception_microsite_leads where id=v_offer.lead_id for update;
  update public.perception_microsite_lead_routes set route_status='ACCEPTED',accepted_provider_id=v_offer.provider_id,resolved_at=now() where id=v_route.id;
  update public.perception_microsite_leads set state='ACCEPTED',accepted_provider_id=v_offer.provider_id,updated_at=now() where id=v_offer.lead_id;
  update public.perception_microsite_lead_offers set status='ACCEPTED',responded_at=now() where id=v_offer.id;
  update public.perception_microsite_lead_offers set status='CANCELLED',responded_at=now()
    where route_id=v_route.id and id<>v_offer.id and status in ('PENDING','SENT');

  insert into public.perception_microsite_lead_events(user_id,lead_id,route_id,offer_id,event_type,previous_state,next_state,provider_id,idempotency_key,practice)
  values(v_offer.user_id,v_offer.lead_id,v_route.id,v_offer.id,'offer.accepted',v_previous,'ACCEPTED',v_offer.provider_id,p_idempotency_key,v_route.practice)
  on conflict (lead_id,idempotency_key) do nothing;
  insert into public.perception_microsite_lead_events(user_id,lead_id,route_id,offer_id,event_type,previous_state,next_state,provider_id,idempotency_key,practice)
  values(v_offer.user_id,v_offer.lead_id,v_route.id,v_offer.id,'lead.accepted',v_previous,'ACCEPTED',v_offer.provider_id,p_idempotency_key || ':lead',v_route.practice)
  on conflict (lead_id,idempotency_key) do nothing;

  return jsonb_build_object('status','accepted','provider_id',v_offer.provider_id);
end;
$$;

create or replace function public.perception_transition_microsite_lead(
  p_lead_id uuid,
  p_next_state text,
  p_event_type text,
  p_provider_id uuid,
  p_metadata jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_previous text;
  v_practice boolean := true;
begin
  select user_id,state into v_user,v_previous from public.perception_microsite_leads where id=p_lead_id for update;
  if v_user is null then raise exception 'lead not found' using errcode='P0002'; end if;
  if exists(select 1 from public.perception_microsite_lead_events where lead_id=p_lead_id and idempotency_key=p_idempotency_key) then
    return jsonb_build_object('status','already_recorded','state',(select state from public.perception_microsite_leads where id=p_lead_id));
  end if;
  if p_next_state not in ('NEW','QUALIFIED','ROUTING','ACCEPTED','CONTACTED','APPOINTMENT','COMPLETED','DUPLICATE','UNQUALIFIED','UNROUTABLE','LOST','CANCELLED','MANUAL_REVIEW') then raise exception 'invalid lead state'; end if;
  select coalesce(r.practice,true) into v_practice from public.perception_microsite_lead_routes r where r.lead_id=p_lead_id order by r.created_at desc limit 1;
  update public.perception_microsite_leads set state=p_next_state,updated_at=now(),accepted_provider_id=coalesce(p_provider_id,accepted_provider_id) where id=p_lead_id;
  insert into public.perception_microsite_lead_events(user_id,lead_id,event_type,previous_state,next_state,provider_id,idempotency_key,metadata,practice)
  values(v_user,p_lead_id,p_event_type,v_previous,p_next_state,p_provider_id,p_idempotency_key,coalesce(p_metadata,'{}'::jsonb),coalesce(v_practice,true));
  return jsonb_build_object('status','recorded','state',p_next_state);
end;
$$;

create or replace function public.perception_exhaust_microsite_route(
  p_route_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_route public.perception_microsite_lead_routes%rowtype;
  v_previous text;
begin
  select * into v_route from public.perception_microsite_lead_routes where id=p_route_id for update;
  if v_route.id is null then raise exception 'route not found' using errcode='P0002'; end if;
  if v_route.route_status='EXHAUSTED' then return jsonb_build_object('status','exhausted'); end if;
  if v_route.accepted_provider_id is not null or v_route.route_status='ACCEPTED' then return jsonb_build_object('status','already_assigned'); end if;
  select state into v_previous from public.perception_microsite_leads where id=v_route.lead_id for update;
  update public.perception_microsite_lead_routes set route_status='EXHAUSTED',resolved_at=now() where id=v_route.id;
  update public.perception_microsite_leads set state='UNROUTABLE',updated_at=now() where id=v_route.lead_id;
  update public.perception_microsite_lead_offers set status='CANCELLED',responded_at=now() where route_id=v_route.id and status in ('PENDING','SENT');
  insert into public.perception_microsite_lead_events(user_id,lead_id,route_id,event_type,previous_state,next_state,idempotency_key,practice)
  values(v_route.user_id,v_route.lead_id,v_route.id,'route.exhausted',v_previous,'UNROUTABLE',p_idempotency_key,v_route.practice)
  on conflict (lead_id,idempotency_key) do nothing;
  return jsonb_build_object('status','exhausted');
end;
$$;

revoke all on function public.perception_ingest_microsite_lead(uuid,uuid,text,text,jsonb,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.perception_start_microsite_route(uuid,text,text,text,boolean,text) from public, anon, authenticated;
revoke all on function public.perception_create_microsite_offer(uuid,uuid,integer,numeric,jsonb,timestamptz,text) from public, anon, authenticated;
revoke all on function public.perception_resolve_microsite_offer(uuid,text,text) from public, anon, authenticated;
revoke all on function public.perception_accept_microsite_offer(uuid,text) from public, anon, authenticated;
revoke all on function public.perception_transition_microsite_lead(uuid,text,text,uuid,jsonb,text) from public, anon, authenticated;
revoke all on function public.perception_exhaust_microsite_route(uuid,text) from public, anon, authenticated;

grant execute on function public.perception_ingest_microsite_lead(uuid,uuid,text,text,jsonb,text,text,text,integer) to service_role;
grant execute on function public.perception_start_microsite_route(uuid,text,text,text,boolean,text) to service_role;
grant execute on function public.perception_create_microsite_offer(uuid,uuid,integer,numeric,jsonb,timestamptz,text) to service_role;
grant execute on function public.perception_resolve_microsite_offer(uuid,text,text) to service_role;
grant execute on function public.perception_accept_microsite_offer(uuid,text) to service_role;
grant execute on function public.perception_transition_microsite_lead(uuid,text,text,uuid,jsonb,text) to service_role;
grant execute on function public.perception_exhaust_microsite_route(uuid,text) to service_role;
