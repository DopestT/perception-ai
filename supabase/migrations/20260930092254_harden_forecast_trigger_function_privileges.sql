revoke all on function public.perception_score_forecast_resolution_trigger()
  from public, anon, authenticated;

revoke all on function public.perception_sync_resolution_proposals()
  from public, anon, authenticated;

grant execute on function public.perception_score_forecast_resolution_trigger()
  to service_role;

grant execute on function public.perception_sync_resolution_proposals()
  to service_role;
