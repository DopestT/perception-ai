begin;

-- Schema/RLS surface must exist and remain client-read-only.
do $$
declare
  t text;
begin
  foreach t in array array[
    'perception_microsite_routing_configs',
    'perception_microsite_providers',
    'perception_microsite_lead_routes',
    'perception_microsite_lead_offers',
    'perception_microsite_lead_events'
  ] loop
    if to_regclass('public.' || t) is null then
      raise exception 'missing routing table: %', t;
    end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass('public.' || t)) then
      raise exception 'RLS disabled: %', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      raise exception 'authenticated has routing write privilege: %', t;
    end if;
  end loop;
end $$;

-- Defaults must fail closed.
do $$
declare
  v_emergency text;
  v_routine text;
  v_duplicate text;
  v_outbound text;
begin
  select column_default into v_emergency from information_schema.columns
    where table_schema='public' and table_name='perception_microsite_routing_configs' and column_name='emergency_timeout_seconds';
  select column_default into v_routine from information_schema.columns
    where table_schema='public' and table_name='perception_microsite_routing_configs' and column_name='routine_timeout_seconds';
  select column_default into v_duplicate from information_schema.columns
    where table_schema='public' and table_name='perception_microsite_routing_configs' and column_name='duplicate_window_minutes';
  select column_default into v_outbound from information_schema.columns
    where table_schema='public' and table_name='perception_microsite_routing_configs' and column_name='outbound_enabled';
  if v_emergency not like '%300%' or v_routine not like '%1800%' or v_duplicate not like '%30%' then
    raise exception 'routing timeout defaults changed';
  end if;
  if coalesce(v_outbound,'') not like '%false%' then
    raise exception 'outbound routing must default false';
  end if;
end $$;

-- RPCs must exist.
do $$
begin
  if to_regprocedure('public.perception_ingest_microsite_lead(uuid,uuid,text,text,jsonb,text,text,text,integer)') is null then raise exception 'missing ingest rpc'; end if;
  if to_regprocedure('public.perception_start_microsite_route(uuid,text,text,text,boolean,text)') is null then raise exception 'missing route rpc'; end if;
  if to_regprocedure('public.perception_create_microsite_offer(uuid,uuid,integer,numeric,jsonb,timestamp with time zone,text)') is null then raise exception 'missing offer rpc'; end if;
  if to_regprocedure('public.perception_resolve_microsite_offer(uuid,text,text)') is null then raise exception 'missing resolve rpc'; end if;
  if to_regprocedure('public.perception_accept_microsite_offer(uuid,text)') is null then raise exception 'missing accept rpc'; end if;
  if to_regprocedure('public.perception_transition_microsite_lead(uuid,text,text,uuid,jsonb,text)') is null then raise exception 'missing transition rpc'; end if;
  if to_regprocedure('public.perception_exhaust_microsite_route(uuid,text)') is null then raise exception 'missing exhaust rpc'; end if;
  if to_regprocedure('public.perception_get_microsite_routing_metrics(uuid,timestamp with time zone)') is null then raise exception 'missing routing metrics rpc'; end if;
end $$;

-- Behavioral contract.
do $$
declare
  u uuid := '10000000-0000-0000-0000-000000000001';
  p uuid := '20000000-0000-0000-0000-000000000001';
  s uuid := '30000000-0000-0000-0000-000000000001';
  a uuid := '40000000-0000-0000-0000-000000000001';
  b uuid := '40000000-0000-0000-0000-000000000002';
  l1 uuid;
  l2 uuid;
  l3 uuid;
  r1 uuid;
  r2 uuid;
  o1 uuid;
  o2 uuid;
  j jsonb;
  transition_failed boolean := false;
begin
  insert into auth.users(id,email) values (u,'hwh-test@example.com');
  insert into public.perception_microsite_portfolios(id,user_id,vertical,target_sites,status)
    values (p,u,'well-help',1,'building');
  insert into public.perception_microsites(id,user_id,portfolio_id,primary_service,status)
    values (s,u,p,'well-help','building');
  insert into public.perception_microsite_routing_configs(user_id,microsite_id,program_key,mode,outbound_enabled)
    values (u,s,'hagerstown-well-help','PRACTICE',false);

  insert into public.perception_microsite_providers(
    id,user_id,display_name,status,service_keys,service_areas,emergency_capable,accepting_new_work,routing_channel,routing_destination,priority_bias
  ) values
    (a,u,'Provider A','ACTIVE','["NO_WATER"]','["washington-county-md"]',true,true,'TEST','provider-a',0),
    (b,u,'Provider B','ACTIVE','["NO_WATER"]','["washington-county-md"]',true,true,'TEST','provider-b',0);

  j := public.perception_ingest_microsite_lead(u,s,'FORM','/request','{"zip":"21740","issue":"no water"}','ph1','eh1','fp1',30);
  l1 := (j->>'lead_id')::uuid;
  if coalesce((j->>'duplicate')::boolean,false) then raise exception 'first lead marked duplicate'; end if;

  j := public.perception_ingest_microsite_lead(u,s,'FORM','/request','{"zip":"21740","issue":"no water"}','ph1','eh1','fp1',30);
  l2 := (j->>'lead_id')::uuid;
  if l2 <> l1 or not coalesce((j->>'duplicate')::boolean,false) then raise exception 'exact duplicate did not collapse'; end if;

  j := public.perception_ingest_microsite_lead(u,s,'FORM','/request','{"zip":"21740","issue":"pump making noise"}','ph1','eh1','fp2',30);
  l3 := (j->>'lead_id')::uuid;
  if l3 = l1 then raise exception 'changed submission incorrectly collapsed'; end if;
  if (select state from public.perception_microsite_leads where id=l3) <> 'MANUAL_REVIEW' then raise exception 'changed same-contact submission must enter MANUAL_REVIEW'; end if;

  update public.perception_microsite_leads set state='QUALIFIED', service_key='NO_WATER', urgency='EMERGENCY' where id=l1;
  r1 := public.perception_start_microsite_route(l1,'NO_WATER','washington-county-md','EMERGENCY',true,'route-1');
  r2 := public.perception_start_microsite_route(l1,'NO_WATER','washington-county-md','EMERGENCY',true,'route-1');
  if r1 <> r2 then raise exception 'route start is not idempotent'; end if;

  o1 := public.perception_create_microsite_offer(r1,a,1,95,'{"fit":true}',now()+interval '5 minutes','offer-a');
  o2 := public.perception_create_microsite_offer(r1,b,2,90,'{"fit":true}',now()+interval '5 minutes','offer-b');
  j := public.perception_accept_microsite_offer(o1,'accept-a');
  if j->>'status' <> 'accepted' then raise exception 'winner not accepted: %', j; end if;
  if (select accepted_provider_id from public.perception_microsite_lead_routes where id=r1) <> a then raise exception 'route provider not bound'; end if;
  if (select accepted_provider_id from public.perception_microsite_leads where id=l1) <> a then raise exception 'lead provider not bound'; end if;
  if (select status from public.perception_microsite_lead_offers where id=o2) <> 'CANCELLED' then raise exception 'losing offer not cancelled'; end if;
  j := public.perception_accept_microsite_offer(o2,'accept-b');
  if j->>'status' <> 'already_assigned' then raise exception 'competing accept did not fail closed: %', j; end if;
  j := public.perception_accept_microsite_offer(o1,'accept-a');
  if j->>'status' <> 'accepted' then raise exception 'repeated accept not idempotent'; end if;

  -- Outcome state rules are forward-only.
  j := public.perception_transition_microsite_lead(l1,'CONTACTED','homeowner.contacted',a,'{}','contacted-1');
  if j->>'state' <> 'CONTACTED' then raise exception 'accepted -> contacted failed'; end if;
  j := public.perception_transition_microsite_lead(l1,'APPOINTMENT','appointment.confirmed',a,'{}','appointment-1');
  if j->>'state' <> 'APPOINTMENT' then raise exception 'contacted -> appointment failed'; end if;
  begin
    perform public.perception_transition_microsite_lead(l1,'CONTACTED','bad.backwards',a,'{}','backwards-1');
  exception when others then
    transition_failed := true;
  end;
  if not transition_failed then raise exception 'backwards outcome transition was accepted'; end if;
  j := public.perception_transition_microsite_lead(l1,'COMPLETED','job.completed',a,'{}','completed-1');
  if j->>'state' <> 'COMPLETED' then raise exception 'appointment -> completed failed'; end if;

  -- Practice revenue is evidence only and must be excluded from live metrics.
  insert into public.perception_microsite_revenue(user_id,microsite_id,lead_id,provider_id,model,amount_cents,metadata)
  values (u,s,l1,a,'PAY_PER_LEAD',12345,'{"practice":true,"simulated":true}');

  -- Separate lead exercises PASS/EXPIRED and exhaustion.
  j := public.perception_ingest_microsite_lead(u,s,'FORM','/request','{"zip":"21740","issue":"no water again"}','ph2','eh2','fp3',30);
  l2 := (j->>'lead_id')::uuid;
  update public.perception_microsite_leads set state='QUALIFIED', service_key='NO_WATER', urgency='EMERGENCY' where id=l2;
  r2 := public.perception_start_microsite_route(l2,'NO_WATER','washington-county-md','EMERGENCY',true,'route-2');
  o1 := public.perception_create_microsite_offer(r2,a,1,95,'{}',now()+interval '5 minutes','offer-2a');
  j := public.perception_resolve_microsite_offer(o1,'PASSED','pass-2a');
  if j->>'status' <> 'passed' then raise exception 'pass resolution failed'; end if;
  j := public.perception_resolve_microsite_offer(o1,'PASSED','pass-2a');
  if j->>'status' <> 'passed' then raise exception 'pass resolution not idempotent'; end if;
  o2 := public.perception_create_microsite_offer(r2,b,2,90,'{}',now()-interval '1 second','offer-2b');
  j := public.perception_resolve_microsite_offer(o2,'EXPIRED','expire-2b');
  if j->>'status' <> 'expired' then raise exception 'expiry resolution failed'; end if;
  j := public.perception_exhaust_microsite_route(r2,'exhaust-2');
  if j->>'status' <> 'exhausted' then raise exception 'route exhaustion failed'; end if;
  if (select state from public.perception_microsite_leads where id=l2) <> 'UNROUTABLE' then raise exception 'lead not marked UNROUTABLE'; end if;

  perform set_config('request.jwt.claim.sub', u::text, true);
  j := public.perception_get_microsite_routing_metrics(s, now()-interval '1 day');
  if not (j ? 'qualification_rate' and j ? 'duplicate_rate' and j ? 'median_time_to_first_offer_seconds'
    and j ? 'median_time_to_acceptance_seconds' and j ? 'provider_acceptance_rate'
    and j ? 'route_exhaustion_rate' and j ? 'appointment_rate' and j ? 'completion_rate'
    and j ? 'lead_to_revenue_rate' and j ? 'practice') then
    raise exception 'metrics payload missing required keys: %', j;
  end if;
  if coalesce((j->>'lead_to_revenue_rate')::numeric,0) <> 0 then
    raise exception 'practice revenue contaminated live metrics: %', j;
  end if;
  if coalesce((j->'practice'->>'route_count')::integer,0) < 2 then
    raise exception 'practice diagnostics did not include practice routes: %', j;
  end if;
end $$;

rollback;