-- Perception objective runtime persistence
-- Extends 001_perception_memory.sql. Apply only to a dedicated Perception Supabase project.

create table if not exists public.perception_objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  statement text not null,
  desired_reality text not null default '',
  current_reality text not null default '',
  constraints jsonb not null default '[]'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  deliverables jsonb not null default '[]'::jsonb,
  known_unknowns jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'high', 'critical')),
  status text not null default 'captured' check (
    status in ('captured', 'resolved', 'mapped', 'routed', 'running', 'blocked', 'awaiting_approval', 'verifying', 'realized', 'paused', 'superseded')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perception_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  objective_id uuid not null references public.perception_objectives(id) on delete cascade,
  version integer not null check (version > 0),
  reason text not null default '',
  supersedes_route_id uuid references public.perception_routes(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (objective_id, version)
);

create table if not exists public.perception_route_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  route_id uuid not null references public.perception_routes(id) on delete cascade,
  label text not null,
  outcome text not null,
  status text not null default 'pending' check (
    status in ('pending', 'ready', 'running', 'awaiting_approval', 'verifying', 'completed', 'blocked', 'failed', 'skipped', 'superseded', 'paused')
  ),
  capability text not null check (
    capability in ('reason', 'research', 'retrieve', 'generate', 'edit', 'code', 'communicate', 'schedule', 'calculate', 'verify')
  ),
  permission_level text not null default 'P0' check (permission_level in ('P0', 'P1', 'P2', 'P3')),
  confidence double precision not null default 0 check (confidence >= 0 and confidence <= 1),
  risk text not null default 'low' check (risk in ('low', 'medium', 'high')),
  completion_tests jsonb not null default '[]'::jsonb,
  blocker text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perception_route_dependencies (
  route_node_id uuid not null references public.perception_route_nodes(id) on delete cascade,
  depends_on_node_id uuid not null references public.perception_route_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (route_node_id, depends_on_node_id),
  check (route_node_id <> depends_on_node_id)
);

create table if not exists public.perception_permission_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  permission_level text not null check (permission_level in ('P0', 'P1', 'P2', 'P3')),
  capability text check (
    capability is null or capability in ('reason', 'research', 'retrieve', 'generate', 'edit', 'code', 'communicate', 'schedule', 'calculate', 'verify')
  ),
  target text,
  scope_note text not null default '',
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.perception_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  objective_id uuid references public.perception_objectives(id) on delete set null,
  route_node_id uuid references public.perception_route_nodes(id) on delete set null,
  artifact_type text not null,
  title text not null default '',
  uri text,
  content_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.perception_verification_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  route_node_id uuid not null references public.perception_route_nodes(id) on delete cascade,
  passed boolean not null,
  evidence jsonb not null default '[]'::jsonb,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now()
);

create table if not exists public.perception_world_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  summary text not null,
  relevance double precision not null default 0 check (relevance >= 0 and relevance <= 1),
  impact double precision not null default 0 check (impact >= 0 and impact <= 1),
  novelty double precision not null default 0 check (novelty >= 0 and novelty <= 1),
  confidence double precision not null default 0 check (confidence >= 0 and confidence <= 1),
  urgency double precision not null default 0 check (urgency >= 0 and urgency <= 1),
  noise double precision not null default 0 check (noise >= 0 and noise <= 1),
  affected_belief_ids jsonb not null default '[]'::jsonb,
  affected_route_node_ids jsonb not null default '[]'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  surfaced_at timestamptz,
  dismissed_at timestamptz,
  detected_at timestamptz not null default now()
);

create index if not exists perception_objectives_project_idx on public.perception_objectives(project_id, updated_at desc);
create index if not exists perception_routes_objective_idx on public.perception_routes(objective_id, version desc);
create index if not exists perception_route_nodes_route_idx on public.perception_route_nodes(route_id, status, sort_order);
create index if not exists perception_permissions_project_idx on public.perception_permission_grants(project_id, revoked_at, expires_at);
create index if not exists perception_artifacts_project_idx on public.perception_artifacts(project_id, created_at desc);
create index if not exists perception_verification_node_idx on public.perception_verification_runs(route_node_id, checked_at desc);
create index if not exists perception_world_signals_project_idx on public.perception_world_signals(project_id, detected_at desc);

alter table public.perception_objectives enable row level security;
alter table public.perception_routes enable row level security;
alter table public.perception_route_nodes enable row level security;
alter table public.perception_route_dependencies enable row level security;
alter table public.perception_permission_grants enable row level security;
alter table public.perception_artifacts enable row level security;
alter table public.perception_verification_runs enable row level security;
alter table public.perception_world_signals enable row level security;

create policy "users own perception objectives"
on public.perception_objectives for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own perception routes"
on public.perception_routes for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own perception route nodes"
on public.perception_route_nodes for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own perception route dependencies"
on public.perception_route_dependencies for all
using (
  exists (
    select 1 from public.perception_route_nodes n
    where n.id = route_node_id and n.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.perception_route_nodes n
    where n.id = route_node_id and n.user_id = auth.uid()
  )
  and exists (
    select 1 from public.perception_route_nodes d
    where d.id = depends_on_node_id and d.user_id = auth.uid()
  )
);

create policy "users own perception permission grants"
on public.perception_permission_grants for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own perception artifacts"
on public.perception_artifacts for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own perception verification runs"
on public.perception_verification_runs for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users own perception world signals"
on public.perception_world_signals for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Material state lives in these tables; history should also be written to
-- perception_model_events so route and permission changes remain auditable.
