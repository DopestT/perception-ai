-- Perception FORECAST adaptive-weight boundary
-- Every non-prior forecaster now receives the same learned multiplier at the database write boundary.

create or replace function public.perception_record_forecaster_output_internal(
  p_user_id uuid,
  p_forecast_id uuid,
  p_model_key text,
  p_model_family text,
  p_probability double precision,
  p_raw_weight double precision default 1,
  p_calibrated_weight double precision default 1,
  p_confidence double precision default 0.5,
  p_rationale text default '',
  p_evidence_ids jsonb default '[]'::jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_deadline timestamptz;
  v_output_id uuid;
  v_probability double precision := greatest(0, least(1, p_probability));
  v_confidence double precision := greatest(0, least(1, coalesce(p_confidence, 0.5)));
  v_raw_weight double precision := greatest(0.01, coalesce(p_raw_weight, 1));
  v_base_weight double precision := greatest(0.01, coalesce(p_calibrated_weight, 1));
  v_calibrated_weight double precision;
  v_model_key text := btrim(coalesce(p_model_key, ''));
  v_model_family text := coalesce(nullif(btrim(p_model_family), ''), 'unknown');
  v_provider text := nullif(lower(btrim(coalesce(p_metadata->>'provider', ''))), '');
  v_horizon text;
  v_multiplier double precision := 1.0;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if p_user_id is null then raise exception 'user required' using errcode = '22023'; end if;
  if p_probability is null then raise exception 'probability required' using errcode = '22023'; end if;
  if v_model_key = '' then raise exception 'model key required' using errcode = '22023'; end if;

  select f.project_id, f.deadline
  into v_project_id, v_deadline
  from public.perception_forecasts f
  where f.id = p_forecast_id and f.user_id = p_user_id and f.status = 'open';
  if not found then raise exception 'open forecast not found' using errcode = 'P0002'; end if;

  v_horizon := public.perception_forecast_horizon_bucket(v_deadline, now());

  -- The original prior remains a weak fixed anchor. Learned performance changes actual forecasters.
  if v_model_key <> 'prior' then
    v_multiplier := public.perception_calibration_weight_multiplier_internal(
      p_user_id,
      v_model_key,
      v_model_family,
      v_provider,
      v_horizon
    );
  end if;

  v_calibrated_weight := greatest(0.01, v_base_weight * v_multiplier);
  v_metadata := v_metadata || jsonb_build_object(
    '_calibration', jsonb_build_object(
      'base_weight', v_base_weight,
      'multiplier', v_multiplier,
      'applied_weight', v_calibrated_weight,
      'horizon_bucket', v_horizon,
      'provider', v_provider,
      'applied_at', now()
    )
  );

  insert into public.perception_forecaster_outputs (
    forecast_id, user_id, project_id, model_key, model_family, probability,
    raw_weight, calibrated_weight, confidence, rationale, evidence_ids, metadata
  ) values (
    p_forecast_id, p_user_id, v_project_id, v_model_key, v_model_family, v_probability,
    v_raw_weight, v_calibrated_weight, v_confidence, coalesce(p_rationale, ''),
    coalesce(p_evidence_ids, '[]'::jsonb), v_metadata
  ) returning id into v_output_id;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (
    p_user_id,
    v_project_id,
    'forecast.model.output',
    jsonb_build_object(
      'forecast_id', p_forecast_id,
      'output_id', v_output_id,
      'model_key', v_model_key,
      'model_family', v_model_family,
      'provider', v_provider,
      'probability', v_probability,
      'base_weight', v_base_weight,
      'calibration_multiplier', v_multiplier,
      'weight', v_calibrated_weight,
      'horizon_bucket', v_horizon
    )
  );

  return jsonb_build_object(
    'ok', true,
    'output_id', v_output_id,
    'calibration_multiplier', v_multiplier,
    'calibrated_weight', v_calibrated_weight,
    'horizon_bucket', v_horizon
  );
end;
$$;

revoke all on function public.perception_record_forecaster_output_internal(uuid,uuid,text,text,double precision,double precision,double precision,double precision,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.perception_record_forecaster_output_internal(uuid,uuid,text,text,double precision,double precision,double precision,double precision,text,jsonb,jsonb) to service_role;
