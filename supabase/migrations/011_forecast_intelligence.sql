-- Perception FORECAST intelligence layer
-- Additive only: append-only evidence, forecaster outputs, external market signals,
-- and bounded service-role RPCs that recompute consensus without weakening existing RLS.

create table if not exists public.perception_forecast_evidence (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.perception_forecasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  source_kind text not null,
  source_name text not null default '',
  source_ref text,
  claim text not null,
  stance text not null check (stance in ('support','contradict','neutral')),
  reliability double precision not null check (reliability >= 0 and reliability <= 1),
  corroboration double precision not null check (corroboration >= 0 and corroboration <= 1),
  freshness double precision not null check (freshness >= 0 and freshness <= 1),
  independence double precision not null check (independence >= 0 and independence <= 1),
  specificity double precision not null check (specificity >= 0 and specificity <= 1),
  manipulation_risk double precision not null check (manipulation_risk >= 0 and manipulation_risk <= 1),
  evidence_score double precision not null check (evidence_score >= 0 and evidence_score <= 1),
  observed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.perception_forecaster_outputs (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.perception_forecasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  model_key text not null,
  model_family text not null,
  probability double precision not null check (probability >= 0 and probability <= 1),
  raw_weight double precision not null default 1 check (raw_weight > 0),
  calibrated_weight double precision not null default 1 check (calibrated_weight > 0),
  confidence double precision not null default 0.5 check (confidence >= 0 and confidence <= 1),
  rationale text not null default '',
  evidence_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.perception_external_market_signals (
  id uuid primary key default gen_random_uuid(),
  forecast_id uuid not null references public.perception_forecasts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  provider text not null,
  market_ticker text not null,
  market_title text not null default '',
  implied_probability double precision not null check (implied_probability >= 0 and implied_probability <= 1),
  yes_bid double precision,
  yes_ask double precision,
  last_price double precision,
  spread double precision,
  volume double precision,
  source_ref text,
  raw_payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists perception_forecast_evidence_forecast_idx
  on public.perception_forecast_evidence(forecast_id, evidence_score desc, created_at desc);
create index if not exists perception_forecast_evidence_user_idx
  on public.perception_forecast_evidence(user_id, created_at desc);
create index if not exists perception_forecaster_outputs_forecast_idx
  on public.perception_forecaster_outputs(forecast_id, model_key, created_at desc);
create index if not exists perception_forecaster_outputs_user_idx
  on public.perception_forecaster_outputs(user_id, created_at desc);
create index if not exists perception_external_market_signals_forecast_idx
  on public.perception_external_market_signals(forecast_id, provider, captured_at desc);
create index if not exists perception_external_market_signals_user_idx
  on public.perception_external_market_signals(user_id, captured_at desc);

alter table public.perception_forecast_evidence enable row level security;
alter table public.perception_forecaster_outputs enable row level security;
alter table public.perception_external_market_signals enable row level security;

drop policy if exists "users read own perception forecast evidence" on public.perception_forecast_evidence;
drop policy if exists "users read own perception forecaster outputs" on public.perception_forecaster_outputs;
drop policy if exists "users read own perception external market signals" on public.perception_external_market_signals;

create policy "users read own perception forecast evidence"
on public.perception_forecast_evidence for select
using ((select auth.uid()) = user_id);

create policy "users read own perception forecaster outputs"
on public.perception_forecaster_outputs for select
using ((select auth.uid()) = user_id);

create policy "users read own perception external market signals"
on public.perception_external_market_signals for select
using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.perception_forecast_evidence from anon, authenticated;
revoke insert, update, delete on public.perception_forecaster_outputs from anon, authenticated;
revoke insert, update, delete on public.perception_external_market_signals from anon, authenticated;
grant select on public.perception_forecast_evidence to authenticated;
grant select on public.perception_forecaster_outputs to authenticated;
grant select on public.perception_external_market_signals to authenticated;

create or replace function public.perception_record_forecast_evidence_internal(
  p_user_id uuid,
  p_forecast_id uuid,
  p_source_kind text,
  p_source_name text,
  p_source_ref text,
  p_claim text,
  p_stance text,
  p_reliability double precision,
  p_corroboration double precision,
  p_freshness double precision,
  p_independence double precision,
  p_specificity double precision,
  p_manipulation_risk double precision,
  p_observed_at timestamptz default now(),
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid;
  v_evidence_id uuid;
  v_reliability double precision := greatest(0, least(1, coalesce(p_reliability, 0.5)));
  v_corroboration double precision := greatest(0, least(1, coalesce(p_corroboration, 0.5)));
  v_freshness double precision := greatest(0, least(1, coalesce(p_freshness, 0.5)));
  v_independence double precision := greatest(0, least(1, coalesce(p_independence, 0.5)));
  v_specificity double precision := greatest(0, least(1, coalesce(p_specificity, 0.5)));
  v_manipulation double precision := greatest(0, least(1, coalesce(p_manipulation_risk, 0.5)));
  v_score double precision;
begin
  if p_user_id is null then raise exception 'user required' using errcode = '22023'; end if;
  if btrim(coalesce(p_claim, '')) = '' then raise exception 'claim required' using errcode = '22023'; end if;
  if p_stance not in ('support','contradict','neutral') then raise exception 'invalid stance' using errcode = '22023'; end if;

  select f.project_id into v_project_id
  from public.perception_forecasts f
  where f.id = p_forecast_id and f.user_id = p_user_id and f.status = 'open';
  if not found then raise exception 'open forecast not found' using errcode = 'P0002'; end if;

  v_score :=
      0.24 * v_reliability
    + 0.18 * v_corroboration
    + 0.16 * v_freshness
    + 0.16 * v_independence
    + 0.16 * v_specificity
    + 0.10 * (1 - v_manipulation);

  insert into public.perception_forecast_evidence (
    forecast_id, user_id, project_id, source_kind, source_name, source_ref, claim, stance,
    reliability, corroboration, freshness, independence, specificity, manipulation_risk,
    evidence_score, observed_at, metadata
  ) values (
    p_forecast_id, p_user_id, v_project_id, coalesce(nullif(btrim(p_source_kind), ''), 'unknown'),
    coalesce(p_source_name, ''), p_source_ref, btrim(p_claim), p_stance,
    v_reliability, v_corroboration, v_freshness, v_independence, v_specificity, v_manipulation,
    v_score, coalesce(p_observed_at, now()), coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_evidence_id;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (
    p_user_id, v_project_id, 'forecast.evidence.recorded',
    jsonb_build_object('forecast_id', p_forecast_id, 'evidence_id', v_evidence_id, 'stance', p_stance, 'score', v_score, 'source_kind', p_source_kind)
  );

  return jsonb_build_object('ok', true, 'evidence_id', v_evidence_id, 'evidence_score', v_score);
end;
$$;

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
  v_output_id uuid;
  v_probability double precision := greatest(0, least(1, p_probability));
  v_confidence double precision := greatest(0, least(1, coalesce(p_confidence, 0.5)));
  v_raw_weight double precision := greatest(0.01, coalesce(p_raw_weight, 1));
  v_calibrated_weight double precision := greatest(0.01, coalesce(p_calibrated_weight, 1));
begin
  if p_user_id is null then raise exception 'user required' using errcode = '22023'; end if;
  if p_probability is null then raise exception 'probability required' using errcode = '22023'; end if;
  if btrim(coalesce(p_model_key, '')) = '' then raise exception 'model key required' using errcode = '22023'; end if;

  select f.project_id into v_project_id
  from public.perception_forecasts f
  where f.id = p_forecast_id and f.user_id = p_user_id and f.status = 'open';
  if not found then raise exception 'open forecast not found' using errcode = 'P0002'; end if;

  insert into public.perception_forecaster_outputs (
    forecast_id, user_id, project_id, model_key, model_family, probability,
    raw_weight, calibrated_weight, confidence, rationale, evidence_ids, metadata
  ) values (
    p_forecast_id, p_user_id, v_project_id, btrim(p_model_key),
    coalesce(nullif(btrim(p_model_family), ''), 'unknown'), v_probability,
    v_raw_weight, v_calibrated_weight, v_confidence, coalesce(p_rationale, ''),
    coalesce(p_evidence_ids, '[]'::jsonb), coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_output_id;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (
    p_user_id, v_project_id, 'forecast.model.output',
    jsonb_build_object('forecast_id', p_forecast_id, 'output_id', v_output_id, 'model_key', p_model_key, 'probability', v_probability, 'weight', v_calibrated_weight)
  );

  return jsonb_build_object('ok', true, 'output_id', v_output_id);
end;
$$;

create or replace function public.perception_recompute_forecast_consensus_internal(
  p_user_id uuid,
  p_forecast_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_forecast public.perception_forecasts%rowtype;
  v_model_count integer := 0;
  v_weight_sum double precision := 0;
  v_probability double precision;
  v_disagreement double precision := 0;
  v_previous_probability double precision;
  v_trend text := 'steady';
  v_confidence text := 'low';
  v_model_breakdown jsonb := '{}'::jsonb;
  v_supporting jsonb := '[]'::jsonb;
  v_contradicting jsonb := '[]'::jsonb;
  v_watch jsonb := '[]'::jsonb;
  v_evidence_count integer := 0;
  v_version integer;
begin
  select * into v_forecast
  from public.perception_forecasts
  where id = p_forecast_id and user_id = p_user_id
  for update;
  if not found then raise exception 'forecast not found' using errcode = 'P0002'; end if;
  if v_forecast.status <> 'open' then raise exception 'forecast is not open' using errcode = '22023'; end if;

  v_previous_probability := v_forecast.current_probability;

  with latest as (
    select distinct on (model_key)
      model_key, model_family, probability, calibrated_weight, confidence, rationale, metadata, created_at
    from public.perception_forecaster_outputs
    where forecast_id = p_forecast_id and user_id = p_user_id
    order by model_key, created_at desc
  )
  select count(*), coalesce(sum(calibrated_weight), 0),
         case when coalesce(sum(calibrated_weight), 0) > 0
           then sum(probability * calibrated_weight) / sum(calibrated_weight)
           else null end
    into v_model_count, v_weight_sum, v_probability
  from latest;

  if v_probability is null then
    return jsonb_build_object('ok', true, 'forecast', to_jsonb(v_forecast), 'model_count', 0, 'disagreement', null);
  end if;

  with latest as (
    select distinct on (model_key)
      model_key, probability, calibrated_weight, created_at
    from public.perception_forecaster_outputs
    where forecast_id = p_forecast_id and user_id = p_user_id
    order by model_key, created_at desc
  )
  select coalesce(sqrt(sum(calibrated_weight * power(probability - v_probability, 2)) / nullif(sum(calibrated_weight), 0)), 0)
    into v_disagreement
  from latest;

  with latest as (
    select distinct on (model_key)
      model_key, model_family, probability, calibrated_weight, confidence, rationale, metadata, created_at
    from public.perception_forecaster_outputs
    where forecast_id = p_forecast_id and user_id = p_user_id
    order by model_key, created_at desc
  )
  select coalesce(jsonb_object_agg(
    model_key,
    jsonb_build_object(
      'family', model_family,
      'probability', probability,
      'weight', calibrated_weight,
      'confidence', confidence,
      'rationale', rationale,
      'metadata', metadata,
      'observed_at', created_at
    )
  ), '{}'::jsonb)
  into v_model_breakdown
  from latest;

  select count(*) into v_evidence_count
  from public.perception_forecast_evidence
  where forecast_id = p_forecast_id and user_id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'label', e.claim,
    'source', e.source_name,
    'source_ref', e.source_ref,
    'score', e.evidence_score,
    'source_kind', e.source_kind
  ) order by e.evidence_score desc, e.created_at desc), '[]'::jsonb)
  into v_supporting
  from (
    select * from public.perception_forecast_evidence
    where forecast_id = p_forecast_id and user_id = p_user_id and stance = 'support'
    order by evidence_score desc, created_at desc
    limit 8
  ) e;

  select coalesce(jsonb_agg(jsonb_build_object(
    'label', e.claim,
    'source', e.source_name,
    'source_ref', e.source_ref,
    'score', e.evidence_score,
    'source_kind', e.source_kind
  ) order by e.evidence_score desc, e.created_at desc), '[]'::jsonb)
  into v_contradicting
  from (
    select * from public.perception_forecast_evidence
    where forecast_id = p_forecast_id and user_id = p_user_id and stance = 'contradict'
    order by evidence_score desc, created_at desc
    limit 8
  ) e;

  select coalesce(jsonb_agg(jsonb_build_object(
    'label', e.claim,
    'source', e.source_name,
    'source_ref', e.source_ref,
    'score', e.evidence_score,
    'source_kind', e.source_kind
  ) order by e.evidence_score desc, e.created_at desc), '[]'::jsonb)
  into v_watch
  from (
    select * from public.perception_forecast_evidence
    where forecast_id = p_forecast_id and user_id = p_user_id and stance = 'neutral'
    order by evidence_score desc, created_at desc
    limit 8
  ) e;

  v_trend := case
    when v_probability > v_previous_probability + 0.002 then 'up'
    when v_probability < v_previous_probability - 0.002 then 'down'
    else 'steady'
  end;

  v_confidence := case
    when v_model_count >= 4 and v_evidence_count >= 4 and v_disagreement <= 0.10 then 'high'
    when v_model_count >= 2 and v_disagreement <= 0.20 then 'medium'
    else 'low'
  end;

  select coalesce(max(version), 0) + 1 into v_version
  from public.perception_forecast_versions
  where forecast_id = p_forecast_id;

  insert into public.perception_forecast_versions (
    forecast_id, user_id, version, probability, confidence, trend,
    supporting_evidence, contradicting_evidence, watch_signals, model_breakdown, rationale
  ) values (
    p_forecast_id, p_user_id, v_version, v_probability, v_confidence, v_trend,
    v_supporting, v_contradicting, v_watch, v_model_breakdown,
    concat('Weighted consensus from ', v_model_count, ' independent model keys; disagreement ', round(v_disagreement::numeric, 4), '.')
  );

  update public.perception_forecasts
  set current_probability = v_probability,
      confidence = v_confidence,
      trend = v_trend,
      supporting_evidence = v_supporting,
      contradicting_evidence = v_contradicting,
      watch_signals = v_watch,
      model_breakdown = v_model_breakdown || jsonb_build_object(
        '_consensus', jsonb_build_object(
          'model_count', v_model_count,
          'weight_sum', v_weight_sum,
          'disagreement', v_disagreement,
          'evidence_count', v_evidence_count
        )
      ),
      updated_at = now()
  where id = p_forecast_id;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values
    (p_user_id, v_forecast.project_id, 'forecast.consensus.updated', jsonb_build_object(
      'forecast_id', p_forecast_id, 'version', v_version, 'probability', v_probability,
      'model_count', v_model_count, 'disagreement', v_disagreement, 'confidence', v_confidence
    )),
    (p_user_id, v_forecast.project_id, 'forecast.updated', jsonb_build_object(
      'forecast_id', p_forecast_id, 'version', v_version, 'probability', v_probability, 'trend', v_trend, 'source', 'ensemble_consensus'
    ));

  return (
    select jsonb_build_object(
      'ok', true,
      'forecast', to_jsonb(f),
      'version', v_version,
      'model_count', v_model_count,
      'disagreement', v_disagreement,
      'evidence_count', v_evidence_count
    )
    from public.perception_forecasts f
    where f.id = p_forecast_id
  );
end;
$$;

create or replace function public.perception_record_market_signal_internal(
  p_user_id uuid,
  p_forecast_id uuid,
  p_provider text,
  p_market_ticker text,
  p_market_title text,
  p_implied_probability double precision,
  p_yes_bid double precision,
  p_yes_ask double precision,
  p_last_price double precision,
  p_spread double precision,
  p_volume double precision,
  p_source_ref text,
  p_raw_payload jsonb,
  p_raw_weight double precision,
  p_calibrated_weight double precision,
  p_confidence double precision,
  p_manipulation_risk double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_forecast public.perception_forecasts%rowtype;
  v_signal_id uuid;
  v_stance text;
  v_evidence jsonb;
  v_output jsonb;
begin
  select * into v_forecast
  from public.perception_forecasts
  where id = p_forecast_id and user_id = p_user_id and status = 'open';
  if not found then raise exception 'open forecast not found' using errcode = 'P0002'; end if;

  insert into public.perception_external_market_signals (
    forecast_id, user_id, project_id, provider, market_ticker, market_title,
    implied_probability, yes_bid, yes_ask, last_price, spread, volume,
    source_ref, raw_payload, captured_at
  ) values (
    p_forecast_id, p_user_id, v_forecast.project_id, lower(btrim(p_provider)), btrim(p_market_ticker),
    coalesce(p_market_title, ''), greatest(0, least(1, p_implied_probability)),
    p_yes_bid, p_yes_ask, p_last_price, p_spread, p_volume,
    p_source_ref, coalesce(p_raw_payload, '{}'::jsonb), now()
  ) returning id into v_signal_id;

  if not exists (
    select 1 from public.perception_forecaster_outputs
    where forecast_id = p_forecast_id and user_id = p_user_id and model_key = 'prior'
  ) then
    perform public.perception_record_forecaster_output_internal(
      p_user_id, p_forecast_id, 'prior', 'base_rate', v_forecast.original_probability,
      0.35, 0.35, 0.35,
      'Original neutral/base prior retained as a weak anchor.', '[]'::jsonb,
      jsonb_build_object('source', 'forecast.original_probability')
    );
  end if;

  v_stance := case
    when p_implied_probability > 0.52 then 'support'
    when p_implied_probability < 0.48 then 'contradict'
    else 'neutral'
  end;

  select public.perception_record_forecast_evidence_internal(
    p_user_id, p_forecast_id, 'prediction_market', upper(p_provider), p_source_ref,
    concat(coalesce(nullif(p_market_title, ''), p_market_ticker), ' implies ', round((p_implied_probability * 100)::numeric, 1), '% YES.'),
    v_stance,
    0.78,
    0.55,
    1.0,
    0.78,
    0.96,
    greatest(0, least(1, coalesce(p_manipulation_risk, 0.25))),
    now(),
    jsonb_build_object('signal_id', v_signal_id, 'provider', p_provider, 'ticker', p_market_ticker, 'volume', p_volume, 'spread', p_spread)
  ) into v_evidence;

  select public.perception_record_forecaster_output_internal(
    p_user_id, p_forecast_id,
    concat('market:', lower(p_provider), ':', p_market_ticker),
    'prediction_market',
    p_implied_probability,
    greatest(0.05, coalesce(p_raw_weight, 1)),
    greatest(0.05, coalesce(p_calibrated_weight, 1)),
    greatest(0, least(1, coalesce(p_confidence, 0.6))),
    concat(upper(p_provider), ' market-implied probability from current public market data.'),
    jsonb_build_array(v_evidence->>'evidence_id'),
    jsonb_build_object('signal_id', v_signal_id, 'provider', p_provider, 'ticker', p_market_ticker, 'spread', p_spread, 'volume', p_volume)
  ) into v_output;

  insert into public.perception_model_events(user_id, project_id, event_type, payload)
  values (
    p_user_id, v_forecast.project_id, 'forecast.market_signal.recorded',
    jsonb_build_object('forecast_id', p_forecast_id, 'signal_id', v_signal_id, 'provider', p_provider, 'ticker', p_market_ticker, 'probability', p_implied_probability)
  );

  return public.perception_recompute_forecast_consensus_internal(p_user_id, p_forecast_id)
    || jsonb_build_object('market_signal_id', v_signal_id);
end;
$$;

revoke all on function public.perception_record_forecast_evidence_internal(uuid,uuid,text,text,text,text,text,double precision,double precision,double precision,double precision,double precision,double precision,timestamptz,jsonb) from public, anon, authenticated;
revoke all on function public.perception_record_forecaster_output_internal(uuid,uuid,text,text,double precision,double precision,double precision,double precision,text,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.perception_recompute_forecast_consensus_internal(uuid,uuid) from public, anon, authenticated;
revoke all on function public.perception_record_market_signal_internal(uuid,uuid,text,text,text,double precision,double precision,double precision,double precision,double precision,double precision,text,jsonb,double precision,double precision,double precision,double precision) from public, anon, authenticated;

grant execute on function public.perception_record_forecast_evidence_internal(uuid,uuid,text,text,text,text,text,double precision,double precision,double precision,double precision,double precision,double precision,timestamptz,jsonb) to service_role;
grant execute on function public.perception_record_forecaster_output_internal(uuid,uuid,text,text,double precision,double precision,double precision,double precision,text,jsonb,jsonb) to service_role;
grant execute on function public.perception_recompute_forecast_consensus_internal(uuid,uuid) to service_role;
grant execute on function public.perception_record_market_signal_internal(uuid,uuid,text,text,text,double precision,double precision,double precision,double precision,double precision,double precision,text,jsonb,double precision,double precision,double precision,double precision) to service_role;
