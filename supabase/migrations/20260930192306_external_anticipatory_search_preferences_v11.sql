create table if not exists public.perception_runtime_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  external_anticipatory_search_enabled boolean not null default false,
  external_search_consent_version integer not null default 1
    check (external_search_consent_version >= 1),
  external_search_consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.perception_runtime_preferences enable row level security;

drop policy if exists "users read own perception runtime preferences"
  on public.perception_runtime_preferences;
create policy "users read own perception runtime preferences"
on public.perception_runtime_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "users create own perception runtime preferences"
  on public.perception_runtime_preferences;
create policy "users create own perception runtime preferences"
on public.perception_runtime_preferences
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "users update own perception runtime preferences"
  on public.perception_runtime_preferences;
create policy "users update own perception runtime preferences"
on public.perception_runtime_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.perception_runtime_preferences from public, anon;
grant select, insert, update on table public.perception_runtime_preferences to authenticated;
grant select, insert, update, delete on table public.perception_runtime_preferences to service_role;
