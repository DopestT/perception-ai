-- Perception owned-domain inventory.
-- Keeps domain reuse decisions private and evidence-backed.

create table if not exists public.perception_domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  status text not null default 'UNASSESSED' check (status in ('ACTIVE','PARKED','UNASSESSED','HOLD','CANDIDATE')),
  current_project_id uuid references public.perception_projects(id) on delete set null,
  notes text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, domain)
);

create table if not exists public.perception_domain_opportunity_fits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain_id uuid not null references public.perception_domains(id) on delete cascade,
  opportunity_key text not null,
  topical_fit numeric(5,2) not null check (topical_fit between 0 and 100),
  brand_fit numeric(5,2) not null check (brand_fit between 0 and 100),
  audience_fit numeric(5,2) not null check (audience_fit between 0 and 100),
  economic_potential numeric(5,2) not null check (economic_potential between 0 and 100),
  execution_feasibility numeric(5,2) not null check (execution_feasibility between 0 and 100),
  time_to_value numeric(5,2) not null check (time_to_value between 0 and 100),
  trust_risk numeric(5,2) not null check (trust_risk between 0 and 100),
  score numeric(5,2) not null check (score between 0 and 100),
  rationale text not null,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, domain_id, opportunity_key)
);

create index if not exists perception_domains_user_status_idx
  on public.perception_domains(user_id, status);
create index if not exists perception_domain_fit_score_idx
  on public.perception_domain_opportunity_fits(user_id, score desc);

alter table public.perception_domains enable row level security;
alter table public.perception_domain_opportunity_fits enable row level security;

create policy "users read own domains"
  on public.perception_domains for select
  using ((select auth.uid()) = user_id);

create policy "users read own domain opportunity fits"
  on public.perception_domain_opportunity_fits for select
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.perception_domains from anon, authenticated;
revoke insert, update, delete on public.perception_domain_opportunity_fits from anon, authenticated;

grant select on public.perception_domains to authenticated;
grant select on public.perception_domain_opportunity_fits to authenticated;
