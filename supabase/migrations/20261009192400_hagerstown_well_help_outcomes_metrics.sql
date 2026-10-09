-- Outcome-state hardening, duplicate evidence, and live/practice routing metrics.

create or replace function public.perception_ingest_microsite_lead(
  p_user_id uuid,
  p_microsite_id uuid,
  p_channel text,
  p_source_path text,
  p_metadata jsonb,
  p_phone_hash text,
  p_email_hash text,
  p_submission_fingerprint text,
  p_duplicate_window_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing uuid;
  v_lead uuid;
  v_state text := 'NEW';
  v_practice boolean := true;
  v_since timestamptz := now() - make_interval(mins => greatest(1, least(coalesce(p_duplicate_window_minutes, 30), 1440)));
begin
  if p_submission_fingerprint is null or btrim(p_submission_fingerprint) = '' then
    raise exception 'submission fingerprint required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.perception_microsites where id=p_microsite_id and user_id=p_user_id) then
    raise exception 'microsite not found' using errcode = 'P0002';
  end if;

  select coalesce(not (c.mode='LIVE' and c.outbound_enabled), true)
  into v_practice
  from public.perception_microsite_routing_configs c
  where c.microsite_id=p_microsite_id;
  v_practice := coalesce(v_practice, true);

  perform pg_advisory_xact_lock(hashtextextended(p_microsite_id::text || ':' || p_submission_fingerprint, 0));

  select id into v_existing
  from public.perception_microsite_leads
  where microsite_id=p_microsite_id
    and submission_fingerprint=p_submission_fingerprint
    and occurred_at >= v_since
  order by occurred_at desc
  limit 1;

  if v_existing is not null then
    insert into public.perception_microsite_lead_events(
      user_id,lead_id,event_type,actor_source,idempotency_key,metadata,practice
    ) values (
      p_user_id,v_existing,'lead.duplicate_detected','microsite-intake',
      'duplicate:' || gen_random_uuid()::text,
      jsonb_build_object('fingerprint_hash',p_submission_fingerprint),v_practice
    );
    return jsonb_build_object('lead_id',v_existing,'duplicate',true,'manual_review',false);
  end if;

  if exists (
    select 1 from public.perception_microsite_leads
    where microsite_id=p_microsite_id
      and occurred_at >= v_since
      and (
        (p_phone_hash is not null and normalized_phone_hash=p_phone_hash)
        or (p_email_hash is not null and normalized_email_hash=p_email_hash)
      )
  ) then
    v_state := 'MANUAL_REVIEW';
  end if;

  insert into public.perception_microsite_leads(
    user_id,microsite_id,channel,source_path,metadata,state,
    normalized_phone_hash,normalized_email_hash,submission_fingerprint
  ) values (
    p_user_id,p_microsite_id,p_channel,p_source_path,coalesce(p_metadata,'{}'::jsonb),v_state,
    nullif(p_phone_hash,''),nullif(p_email_hash,''),p_submission_fingerprint
  ) returning id into v_lead;

  if v_state='MANUAL_REVIEW' then
    insert into public.perception_microsite_lead_events(
      user_id,lead_id,event_type,previous_state,next_state,actor_source,idempotency_key,metadata,practice
    ) values (
      p_user_id,v_lead,'lead.manual_review','NEW','MANUAL_REVIEW','microsite-intake',
      'manual-review:' || v_lead::text,
      jsonb_build_object('reason','same_contact_changed_submission'),v_practice
    );
  end if;

  return jsonb_build_object('lead_id',v_lead,'duplicate',false,'manual_review',v_state='MANUAL_REVIEW');
end;
$$;

create or replace function public.perception_transition_microsite_lead(
  p_lead_id uuid,
  p_next_state text,
  p_event_type text,
  p_provider_id uuid,
  p_metadata jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_microsite uuid;
  v_previous text;
  v_practice boolean;
begin
  select user_id,microsite_id,state into v_user,v_microsite,v_previous
  from public.perception_microsite_leads where id=p_lead_id for update;
  if v_user is null then raise exception 'lead not found' using errcode='P0002'; end if;

  if exists(select 1 from public.perception_microsite_lead_events where lead_id=p_lead_id and idempotency_key=p_idempotency_key) then
    return jsonb_build_object('status','already_recorded','state',(select state from public.perception_microsite_leads where id=p_lead_id));
  end if;

  if p_next_state not in ('NEW','QUALIFIED','ROUTING','ACCEPTED','CONTACTED','APPOINTMENT','COMPLETED','DUPLICATE','UNQUALIFIED','UNROUTABLE','LOST','CANCELLED','MANUAL_REVIEW') then
    raise exception 'invalid lead state' using errcode='22023';
  end if;

  if p_next_state='CONTACTED' and v_previous<>'ACCEPTED' then
    raise exception 'invalid outcome transition % -> %', v_previous,p_next_state using errcode='22023';
  elsif p_next_state='APPOINTMENT' and v_previous<>'CONTACTED' then
    raise exception 'invalid outcome transition % -> %', v_previous,p_next_state using errcode='22023';
  elsif p_next_state='COMPLETED' and v_previous<>'APPOINTMENT' then
    raise exception 'invalid outcome transition % -> %', v_previous,p_next_state using errcode='22023';
  elsif p_next_state='LOST' and v_previous not in ('ACCEPTED','CONTACTED','APPOINTMENT') then
    raise exception 'invalid outcome transition % -> %', v_previous,p_next_state using errcode='22023';
  elsif p_next_state='CANCELLED' and v_previous not in ('NEW','QUALIFIED','ROUTING','ACCEPTED','CONTACTED','APPOINTMENT') then
    raise exception 'invalid outcome transition % -> %', v_previous,p_next_state using errcode='22023';
  end if;

  select r.practice into v_practice
  from public.perception_microsite_lead_routes r
  where r.lead_id=p_lead_id
  order by r.created_at desc
  limit 1;

  if v_practice is null then
    select coalesce(not (c.mode='LIVE' and c.outbound_enabled), true)
    into v_practice
    from public.perception_microsite_routing_configs c
    where c.microsite_id=v_microsite;
  end if;
  v_practice := coalesce(v_practice,true);

  update public.perception_microsite_leads
  set state=p_next_state,updated_at=now(),accepted_provider_id=coalesce(p_provider_id,accepted_provider_id)
  where id=p_lead_id;

  insert into public.perception_microsite_lead_events(
    user_id,lead_id,event_type,previous_state,next_state,provider_id,idempotency_key,metadata,practice
  ) values (
    v_user,p_lead_id,p_event_type,v_previous,p_next_state,p_provider_id,p_idempotency_key,coalesce(p_metadata,'{}'::jsonb),v_practice
  );
  return jsonb_build_object('status','recorded','state',p_next_state);
end;
$$;

create or replace function public.perception_get_microsite_routing_metrics(
  p_microsite_id uuid,
  p_since timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_since timestamptz := coalesce(p_since, now()-interval '30 days');
  v_live_routes integer := 0;
  v_practice_routes integer := 0;
  v_live_offers integer := 0;
  v_practice_offers integer := 0;
  v_live_accepts integer := 0;
  v_practice_accepts integer := 0;
  v_live_exhausted integer := 0;
  v_practice_exhausted integer := 0;
  v_live_qualified integer := 0;
  v_live_decisions integer := 0;
  v_live_duplicates integer := 0;
  v_live_appointments integer := 0;
  v_live_completed integer := 0;
  v_live_revenue_leads integer := 0;
  v_practice_revenue integer := 0;
  v_median_first numeric;
  v_median_accept numeric;
  v_result jsonb;
begin
  select user_id into v_owner from public.perception_microsites where id=p_microsite_id;
  if v_owner is null then raise exception 'microsite not found' using errcode='P0002'; end if;
  if v_user is null or v_user<>v_owner then raise exception 'forbidden' using errcode='42501'; end if;

  select
    count(*) filter (where not r.practice),
    count(*) filter (where r.practice),
    count(*) filter (where not r.practice and r.route_status='ACCEPTED'),
    count(*) filter (where r.practice and r.route_status='ACCEPTED'),
    count(*) filter (where not r.practice and r.route_status='EXHAUSTED'),
    count(*) filter (where r.practice and r.route_status='EXHAUSTED')
  into v_live_routes,v_practice_routes,v_live_accepts,v_practice_accepts,v_live_exhausted,v_practice_exhausted
  from public.perception_microsite_lead_routes r
  join public.perception_microsite_leads l on l.id=r.lead_id
  where l.microsite_id=p_microsite_id and r.created_at>=v_since;

  select
    count(*) filter (where not r.practice),
    count(*) filter (where r.practice)
  into v_live_offers,v_practice_offers
  from public.perception_microsite_lead_offers o
  join public.perception_microsite_lead_routes r on r.id=o.route_id
  join public.perception_microsite_leads l on l.id=r.lead_id
  where l.microsite_id=p_microsite_id and o.created_at>=v_since;

  select
    count(distinct e.lead_id) filter (where not e.practice and e.event_type='lead.qualified'),
    count(distinct e.lead_id) filter (where not e.practice and e.event_type in ('lead.qualified','lead.unqualified','lead.manual_review','route.no_eligible_provider')),
    count(*) filter (where not e.practice and e.event_type='lead.duplicate_detected'),
    count(distinct e.lead_id) filter (where not e.practice and e.event_type='appointment.confirmed'),
    count(distinct e.lead_id) filter (where not e.practice and e.event_type='job.completed')
  into v_live_qualified,v_live_decisions,v_live_duplicates,v_live_appointments,v_live_completed
  from public.perception_microsite_lead_events e
  join public.perception_microsite_leads l on l.id=e.lead_id
  where l.microsite_id=p_microsite_id and e.occurred_at>=v_since;

  select count(distinct rev.lead_id)
  into v_live_revenue_leads
  from public.perception_microsite_revenue rev
  join public.perception_microsite_lead_routes r on r.lead_id=rev.lead_id and not r.practice
  where rev.microsite_id=p_microsite_id and rev.occurred_at>=v_since
    and coalesce((rev.metadata->>'practice')::boolean,false)=false;

  select count(*) into v_practice_revenue
  from public.perception_microsite_revenue rev
  where rev.microsite_id=p_microsite_id and rev.occurred_at>=v_since
    and coalesce((rev.metadata->>'practice')::boolean,false)=true;

  select percentile_cont(0.5) within group (order by extract(epoch from (first_offer.first_at-l.occurred_at)))
  into v_median_first
  from public.perception_microsite_lead_routes r
  join public.perception_microsite_leads l on l.id=r.lead_id
  join lateral (
    select min(o.offered_at) as first_at from public.perception_microsite_lead_offers o where o.route_id=r.id
  ) first_offer on first_offer.first_at is not null
  where l.microsite_id=p_microsite_id and not r.practice and r.created_at>=v_since;

  select percentile_cont(0.5) within group (order by extract(epoch from (r.resolved_at-l.occurred_at)))
  into v_median_accept
  from public.perception_microsite_lead_routes r
  join public.perception_microsite_leads l on l.id=r.lead_id
  where l.microsite_id=p_microsite_id and not r.practice and r.route_status='ACCEPTED'
    and r.resolved_at is not null and r.created_at>=v_since;

  v_result := jsonb_build_object(
    'qualification_rate', case when v_live_decisions=0 then 0 else round(v_live_qualified::numeric/v_live_decisions,4) end,
    'duplicate_rate', case when (v_live_decisions+v_live_duplicates)=0 then 0 else round(v_live_duplicates::numeric/(v_live_decisions+v_live_duplicates),4) end,
    'median_time_to_first_offer_seconds', v_median_first,
    'median_time_to_acceptance_seconds', v_median_accept,
    'provider_acceptance_rate', case when v_live_offers=0 then 0 else round(v_live_accepts::numeric/v_live_offers,4) end,
    'route_exhaustion_rate', case when v_live_routes=0 then 0 else round(v_live_exhausted::numeric/v_live_routes,4) end,
    'appointment_rate', case when v_live_routes=0 then 0 else round(v_live_appointments::numeric/v_live_routes,4) end,
    'completion_rate', case when v_live_routes=0 then 0 else round(v_live_completed::numeric/v_live_routes,4) end,
    'lead_to_revenue_rate', case when v_live_routes=0 then 0 else round(v_live_revenue_leads::numeric/v_live_routes,4) end,
    'practice', jsonb_build_object(
      'route_count',v_practice_routes,
      'offer_count',v_practice_offers,
      'accepted_route_count',v_practice_accepts,
      'exhausted_route_count',v_practice_exhausted,
      'revenue_evidence_count',v_practice_revenue
    )
  );
  return v_result;
end;
$$;

revoke all on function public.perception_get_microsite_routing_metrics(uuid,timestamptz) from public, anon;
grant execute on function public.perception_get_microsite_routing_metrics(uuid,timestamptz) to authenticated, service_role;
