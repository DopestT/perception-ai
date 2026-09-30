-- Continuous Mind post-deploy hardening: keep mutation RPCs server-only and
-- cover ownership/cascade foreign keys used by RLS and cleanup paths.

create index if not exists perception_learning_candidates_source_idx
  on public.perception_learning_candidates(source_id);
create index if not exists perception_learning_candidates_study_run_idx
  on public.perception_learning_candidates(study_run_id);
create index if not exists perception_learning_candidates_user_idx
  on public.perception_learning_candidates(user_id);
create index if not exists perception_learning_candidates_world_signal_idx
  on public.perception_learning_candidates(world_signal_id);
create index if not exists perception_learning_ledger_user_idx
  on public.perception_learning_ledger(user_id);
create index if not exists perception_learning_sources_user_idx
  on public.perception_learning_sources(user_id);
create index if not exists perception_study_runs_user_idx
  on public.perception_study_runs(user_id);

create policy perception_runtime_secret_hashes_service_select
  on public.perception_runtime_secret_hashes for select
  to service_role
  using (true);

revoke all on function public.perception_review_learning(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.perception_review_learning(uuid, text, text)
  to service_role;

create or replace function public.perception_review_learning_internal(
  p_user_id uuid,
  p_candidate_id uuid,
  p_decision text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_result jsonb;
begin
  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id
  ) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  v_result := public.perception_review_learning(
    p_candidate_id,
    p_decision,
    p_reason
  );
  perform set_config(
    'request.jwt.claim.sub',
    coalesce(v_previous_sub, ''),
    true
  );

  return v_result;
end;
$$;

revoke all on function public.perception_review_learning_internal(
  uuid, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.perception_review_learning_internal(
  uuid, uuid, text, text
) to service_role;
