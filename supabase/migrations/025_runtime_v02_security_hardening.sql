-- Runtime v0.2 security hardening discovered by Supabase advisor after production sync.

alter function public.perception_permission_rank(text)
  set search_path = public, pg_temp;

revoke all on function public.perception_enforce_worker_permission()
  from public, anon, authenticated;
revoke all on function public.perception_capture_worker_execution()
  from public, anon, authenticated;
revoke all on function public.perception_capture_artifact_observation()
  from public, anon, authenticated;
revoke all on function public.perception_capture_verification_execution()
  from public, anon, authenticated;

grant execute on function public.perception_enforce_worker_permission()
  to service_role;
grant execute on function public.perception_capture_worker_execution()
  to service_role;
grant execute on function public.perception_capture_artifact_observation()
  to service_role;
grant execute on function public.perception_capture_verification_execution()
  to service_role;
