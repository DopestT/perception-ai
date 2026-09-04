-- Perception persistent User/Goal Model
-- Apply only to a dedicated Perception Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.perception_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  desired_reality text,
  current_reality text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perception_beliefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  scope text not null check (scope in ('user', 'project', 'task')),
  statement text not null,
  state text not null check (state in ('observed', 'inferred', 'confirmed', 'unknown', 'rejected', 'stale')),
  confidence double precision not null default 0 check (confidence >= 0 and confidence <= 1),
  evidence jsonb not null default '[]'::jsonb,
  contradictions jsonb not null default '[]'::jsonb,
  route_impact text not null default '',
  needs_confirmation boolean not null default false,
  source_kind text not null default 'conversation',
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perception_model_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists perception_projects_user_idx on public.perception_projects(user_id, updated_at desc);
create index if not exists perception_beliefs_project_idx on public.perception_beliefs(project_id, state, updated_at desc);
create index if not exists perception_events_project_idx on public.perception_model_events(project_id, created_at desc);

alter table public.perception_projects enable row level security;
alter table public.perception_beliefs enable row level security;
alter table public.perception_model_events enable row level security;

create policy "users own perception projects"
on public.perception_projects
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own perception beliefs"
on public.perception_beliefs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own perception model events"
on public.perception_model_events
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- The event table is append-oriented audit history. Application code should not
-- silently rewrite an inferred belief into observed/confirmed; it should create
-- an explicit correction/confirmation event and update the belief state.
