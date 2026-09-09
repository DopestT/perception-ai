create index if not exists perception_token_decisions_user_created_idx
  on public.perception_token_decisions(user_id, created_at desc);
create index if not exists perception_token_decisions_objective_idx
  on public.perception_token_decisions(objective_id);
create index if not exists perception_token_policies_project_idx
  on public.perception_token_policies(project_id);
create index if not exists perception_token_usage_objective_idx
  on public.perception_token_usage(objective_id);
create index if not exists perception_token_usage_worker_run_idx
  on public.perception_token_usage(worker_run_id);

drop policy if exists perception_token_policies_select_own on public.perception_token_policies;
create policy perception_token_policies_select_own
  on public.perception_token_policies for select
  using (user_id = (select auth.uid()));

drop policy if exists perception_token_policies_insert_own on public.perception_token_policies;
create policy perception_token_policies_insert_own
  on public.perception_token_policies for insert
  with check (
    user_id = (select auth.uid())
    and (project_id is null or exists (
      select 1 from public.perception_projects p
      where p.id = project_id and p.user_id = (select auth.uid())
    ))
  );

drop policy if exists perception_token_policies_update_own on public.perception_token_policies;
create policy perception_token_policies_update_own
  on public.perception_token_policies for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists perception_token_decisions_select_own on public.perception_token_decisions;
create policy perception_token_decisions_select_own
  on public.perception_token_decisions for select
  using (user_id = (select auth.uid()));

drop policy if exists perception_token_usage_select_own on public.perception_token_usage;
create policy perception_token_usage_select_own
  on public.perception_token_usage for select
  using (user_id = (select auth.uid()));
