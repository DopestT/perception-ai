-- Growth Operator v0.1
-- Durable, owner-scoped state for website growth scans and bounded opportunities.
-- Writes are reserved to trusted server-side workers. Authenticated users have read-only access.

create table if not exists public.perception_growth_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  site_url text not null,
  canonical_host text not null,
  repository text,
  primary_goal text not null,
  conversion_event text not null default '',
  publishing_mode text not null default 'approval'
    check (publishing_mode in ('draft','approval','autopilot')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id)
);

create table if not exists public.perception_growth_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  site_id uuid not null references public.perception_growth_sites(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running','succeeded','partial','failed')),
  trigger text not null default 'manual',
  pages_discovered integer not null default 0 check (pages_discovered >= 0),
  pages_scanned integer not null default 0 check (pages_scanned >= 0),
  baseline jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.perception_growth_pages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.perception_growth_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  url text not null,
  path text not null,
  http_status integer not null,
  title text not null default '',
  meta_description text not null default '',
  h1 text not null default '',
  word_count integer not null default 0 check (word_count >= 0),
  internal_links integer not null default 0 check (internal_links >= 0),
  external_links integer not null default 0 check (external_links >= 0),
  noindex boolean not null default false,
  signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, url)
);

create table if not exists public.perception_growth_opportunities (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.perception_growth_runs(id) on delete cascade,
  site_id uuid not null references public.perception_growth_sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  opportunity_key text not null,
  kind text not null,
  target_url text not null,
  target_path text not null,
  title text not null,
  rationale text not null,
  score integer not null check (score between 0 and 100),
  status text not null default 'proposed'
    check (status in ('proposed','queued','in_progress','verified','dismissed','failed')),
  bounded_job jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, opportunity_key)
);

create index if not exists perception_growth_sites_project_idx
  on public.perception_growth_sites(project_id, enabled);
create index if not exists perception_growth_runs_project_started_idx
  on public.perception_growth_runs(project_id, started_at desc);
create index if not exists perception_growth_pages_run_idx
  on public.perception_growth_pages(run_id, path);
create index if not exists perception_growth_opportunities_run_score_idx
  on public.perception_growth_opportunities(run_id, score desc, created_at);

alter table public.perception_growth_sites enable row level security;
alter table public.perception_growth_runs enable row level security;
alter table public.perception_growth_pages enable row level security;
alter table public.perception_growth_opportunities enable row level security;

drop policy if exists "users read own growth sites" on public.perception_growth_sites;
drop policy if exists "users read own growth runs" on public.perception_growth_runs;
drop policy if exists "users read own growth pages" on public.perception_growth_pages;
drop policy if exists "users read own growth opportunities" on public.perception_growth_opportunities;

create policy "users read own growth sites"
  on public.perception_growth_sites for select
  using ((select auth.uid()) = user_id);

create policy "users read own growth runs"
  on public.perception_growth_runs for select
  using ((select auth.uid()) = user_id);

create policy "users read own growth pages"
  on public.perception_growth_pages for select
  using ((select auth.uid()) = user_id);

create policy "users read own growth opportunities"
  on public.perception_growth_opportunities for select
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.perception_growth_sites from anon, authenticated;
revoke insert, update, delete on public.perception_growth_runs from anon, authenticated;
revoke insert, update, delete on public.perception_growth_pages from anon, authenticated;
revoke insert, update, delete on public.perception_growth_opportunities from anon, authenticated;

grant select on public.perception_growth_sites to authenticated;
grant select on public.perception_growth_runs to authenticated;
grant select on public.perception_growth_pages to authenticated;
grant select on public.perception_growth_opportunities to authenticated;

create or replace function public.perception_get_growth_dashboard(p_project_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_site public.perception_growth_sites%rowtype;
  v_run public.perception_growth_runs%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.perception_projects
    where id = p_project_id and user_id = v_user
  ) then
    raise exception 'Project World not found' using errcode = 'P0002';
  end if;

  select *
  into v_site
  from public.perception_growth_sites
  where project_id = p_project_id and user_id = v_user
  order by updated_at desc
  limit 1;

  if v_site.id is null then
    return jsonb_build_object(
      'site', null,
      'latest_run', null,
      'opportunities', '[]'::jsonb
    );
  end if;

  select *
  into v_run
  from public.perception_growth_runs
  where site_id = v_site.id and user_id = v_user
  order by started_at desc
  limit 1;

  return jsonb_build_object(
    'site', to_jsonb(v_site),
    'latest_run', case when v_run.id is null then null else to_jsonb(v_run) end,
    'opportunities', case
      when v_run.id is null then '[]'::jsonb
      else coalesce((
        select jsonb_agg(to_jsonb(o) order by o.score desc, o.created_at)
        from public.perception_growth_opportunities o
        where o.run_id = v_run.id and o.user_id = v_user
      ), '[]'::jsonb)
    end
  );
end;
$$;

revoke all on function public.perception_get_growth_dashboard(uuid) from public, anon;
grant execute on function public.perception_get_growth_dashboard(uuid) to authenticated, service_role;
