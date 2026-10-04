-- Structured benchmark cases received from DataCenter.Forums.
-- These cases are part of Perception's real-world evaluation curriculum and remain
-- subordinate to Perception's own Project World and verification rules.

create table if not exists public.perception_external_evaluation_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  source_observation_id uuid not null references public.perception_source_observations(id) on delete cascade,
  client_id text not null,
  external_evaluation_id text not null,
  benchmark_hash text not null,
  eval_type text not null check (
    eval_type in (
      'change_detection',
      'contradiction_detection',
      'entity_resolution',
      'source_routing',
      'verification'
    )
  ),
  case_key text not null,
  subject_type text,
  subject_key text,
  benchmark jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'graded', 'returned', 'return_failed')
  ),
  outcome text check (outcome in ('pass', 'fail', 'partial')),
  score double precision check (score is null or (score >= 0 and score <= 1)),
  observed_state jsonb,
  result_notes text,
  grader_system text,
  graded_at timestamptz,
  returned_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_observation_id)
);

create index if not exists perception_external_eval_project_idx
  on public.perception_external_evaluation_cases(project_id, status, created_at desc);

create index if not exists perception_external_eval_external_id_idx
  on public.perception_external_evaluation_cases(client_id, external_evaluation_id, created_at desc);

alter table public.perception_external_evaluation_cases enable row level security;

drop policy if exists "users read external evaluation cases" on public.perception_external_evaluation_cases;
create policy "users read external evaluation cases"
on public.perception_external_evaluation_cases for select
using (auth.uid() = user_id);

revoke all on public.perception_external_evaluation_cases from public, anon;
grant select on public.perception_external_evaluation_cases to authenticated;
grant select, insert, update on public.perception_external_evaluation_cases to service_role;
