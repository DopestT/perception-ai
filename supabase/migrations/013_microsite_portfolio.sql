-- Perception Microsite Engine: 100-site portfolio foundation
-- Public microsites are outputs; Perception remains the private source of truth.

create table if not exists public.perception_microsite_portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.perception_projects(id) on delete set null,
  vertical text not null default 'waterproofing',
  target_sites integer not null default 100 check (target_sites between 1 and 1000),
  status text not null default 'researching' check (status in ('researching','building','live','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perception_microsite_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.perception_microsite_portfolios(id) on delete cascade,
  slot_number integer not null check (slot_number > 0),
  status text not null default 'researching' check (status in ('empty','researching','candidate','validated','approval_required','building','live','monetizing','paused')),
  opportunity_score numeric(5,2),
  market_candidate_id uuid,
  microsite_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, slot_number)
);

create table if not exists public.perception_microsite_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.perception_microsite_portfolios(id) on delete cascade,
  vertical text not null,
  city text not null,
  state text not null,
  country text not null default 'US',
  primary_service text not null,
  secondary_services jsonb not null default '[]'::jsonb,
  commercial_intent numeric(5,2),
  competition numeric(5,2),
  local_demand numeric(5,2),
  estimated_lead_value numeric(5,2),
  domain_fit numeric(5,2),
  opportunity_score numeric(5,2),
  evidence_confidence text check (evidence_confidence in ('LOW','MEDIUM','HIGH')),
  evidence jsonb not null default '[]'::jsonb,
  stage text not null default 'RESEARCH' check (stage in ('RESEARCH','VALIDATED','READY_TO_BUILD','READY_TO_DEPLOY','LIVE','MONETIZING','PAUSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perception_microsites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.perception_microsite_portfolios(id) on delete cascade,
  candidate_id uuid references public.perception_microsite_candidates(id) on delete set null,
  domain text,
  public_brand_name text,
  primary_service text not null,
  secondary_services jsonb not null default '[]'::jsonb,
  service_area jsonb not null default '[]'::jsonb,
  deployment_provider text,
  deployment_ref text,
  lead_destination_id text,
  claims_approved boolean not null default false,
  domain_purchase_approved boolean not null default false,
  deployment_approved boolean not null default false,
  status text not null default 'draft' check (status in ('draft','approval_required','building','live','monetizing','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.perception_microsite_slots
  add constraint perception_microsite_slots_candidate_fk
  foreign key (market_candidate_id) references public.perception_microsite_candidates(id) on delete set null;

alter table public.perception_microsite_slots
  add constraint perception_microsite_slots_site_fk
  foreign key (microsite_id) references public.perception_microsites(id) on delete set null;

create table if not exists public.perception_microsite_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  microsite_id uuid not null references public.perception_microsites(id) on delete cascade,
  channel text not null check (channel in ('FORM','CALL','CHAT')),
  qualified boolean,
  contractor_destination_id text,
  source_path text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create table if not exists public.perception_microsite_revenue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  microsite_id uuid not null references public.perception_microsites(id) on delete cascade,
  lead_id uuid references public.perception_microsite_leads(id) on delete set null,
  model text not null check (model in ('PAY_PER_LEAD','MONTHLY_LEASE','REVENUE_SHARE','HYBRID')),
  amount_cents integer not null check (amount_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists perception_microsite_portfolios_user_idx on public.perception_microsite_portfolios(user_id);
create index if not exists perception_microsite_slots_portfolio_idx on public.perception_microsite_slots(portfolio_id, slot_number);
create index if not exists perception_microsite_candidates_score_idx on public.perception_microsite_candidates(portfolio_id, opportunity_score desc nulls last);
create index if not exists perception_microsites_portfolio_idx on public.perception_microsites(portfolio_id, status);
create index if not exists perception_microsite_leads_site_idx on public.perception_microsite_leads(microsite_id, occurred_at desc);
create index if not exists perception_microsite_revenue_site_idx on public.perception_microsite_revenue(microsite_id, occurred_at desc);

alter table public.perception_microsite_portfolios enable row level security;
alter table public.perception_microsite_slots enable row level security;
alter table public.perception_microsite_candidates enable row level security;
alter table public.perception_microsites enable row level security;
alter table public.perception_microsite_leads enable row level security;
alter table public.perception_microsite_revenue enable row level security;

create policy "users read own microsite portfolios" on public.perception_microsite_portfolios for select using ((select auth.uid()) = user_id);
create policy "users read own microsite slots" on public.perception_microsite_slots for select using ((select auth.uid()) = user_id);
create policy "users read own microsite candidates" on public.perception_microsite_candidates for select using ((select auth.uid()) = user_id);
create policy "users read own microsites" on public.perception_microsites for select using ((select auth.uid()) = user_id);
create policy "users read own microsite leads" on public.perception_microsite_leads for select using ((select auth.uid()) = user_id);
create policy "users read own microsite revenue" on public.perception_microsite_revenue for select using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.perception_microsite_portfolios from anon, authenticated;
revoke insert, update, delete on public.perception_microsite_slots from anon, authenticated;
revoke insert, update, delete on public.perception_microsite_candidates from anon, authenticated;
revoke insert, update, delete on public.perception_microsites from anon, authenticated;
revoke insert, update, delete on public.perception_microsite_leads from anon, authenticated;
revoke insert, update, delete on public.perception_microsite_revenue from anon, authenticated;

grant select on public.perception_microsite_portfolios to authenticated;
grant select on public.perception_microsite_slots to authenticated;
grant select on public.perception_microsite_candidates to authenticated;
grant select on public.perception_microsites to authenticated;
grant select on public.perception_microsite_leads to authenticated;
grant select on public.perception_microsite_revenue to authenticated;

create or replace function public.perception_create_microsite_portfolio(
  p_vertical text default 'waterproofing',
  p_target_sites integer default 100,
  p_project_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_portfolio uuid;
  v_slot integer;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_target_sites < 1 or p_target_sites > 1000 then
    raise exception 'Target sites must be between 1 and 1000' using errcode = '22023';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.perception_projects where id = p_project_id and user_id = v_user
  ) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  insert into public.perception_microsite_portfolios (user_id, project_id, vertical, target_sites)
  values (v_user, p_project_id, btrim(coalesce(p_vertical, 'waterproofing')), p_target_sites)
  returning id into v_portfolio;

  for v_slot in 1..p_target_sites loop
    insert into public.perception_microsite_slots (user_id, portfolio_id, slot_number, status)
    values (v_user, v_portfolio, v_slot, 'researching');
  end loop;

  insert into public.perception_model_events (user_id, project_id, event_type, payload)
  select v_user, p_project_id, 'microsite_portfolio.created',
    jsonb_build_object('portfolio_id', v_portfolio, 'vertical', p_vertical, 'target_sites', p_target_sites)
  where p_project_id is not null;

  return v_portfolio;
end;
$$;

revoke all on function public.perception_create_microsite_portfolio(text, integer, uuid) from public, anon;
grant execute on function public.perception_create_microsite_portfolio(text, integer, uuid) to authenticated;
