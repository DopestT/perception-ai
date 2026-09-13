-- Perception FORECAST scenario intelligence index hardening
-- Cover foreign keys not already covered by the primary scenario lookup indexes.

create index if not exists perception_forecast_scenario_sets_user_idx
  on public.perception_forecast_scenario_sets(user_id, created_at desc);

create index if not exists perception_forecast_scenario_branches_forecast_idx
  on public.perception_forecast_scenario_branches(forecast_id);
create index if not exists perception_forecast_scenario_branches_user_idx
  on public.perception_forecast_scenario_branches(user_id, created_at desc);

create index if not exists perception_forecast_failure_checks_forecast_idx
  on public.perception_forecast_failure_checks(forecast_id);
create index if not exists perception_forecast_failure_checks_user_idx
  on public.perception_forecast_failure_checks(user_id, created_at desc);
