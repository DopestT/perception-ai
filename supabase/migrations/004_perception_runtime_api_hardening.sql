-- Harden the Perception runtime API.
-- Signed-in clients read Project World through RLS. Authoritative writes are performed
-- by a JWT-authenticating Edge Function using a server-side secret key.

revoke execute on function public.perception_submit_objective(text) from authenticated;

create or replace function public.perception_submit_objective_internal(p_user_id uuid, p_statement text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_result jsonb;
begin
  if p_user_id is null then
    raise exception 'User id is required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  v_result := public.perception_submit_objective(p_statement);

  if v_previous_sub is not null and v_previous_sub <> '' then
    perform set_config('request.jwt.claim.sub', v_previous_sub, true);
  end if;

  return v_result;
end;
$$;

revoke all on function public.perception_submit_objective_internal(uuid, text) from public, anon, authenticated;
grant execute on function public.perception_submit_objective_internal(uuid, text) to service_role;

create or replace function public.perception_get_project_world(p_project_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not exists (select 1 from public.perception_projects p where p.id = p_project_id and p.user_id = v_user) then
    raise exception 'Project World not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'project', to_jsonb(p),
    'beliefs', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at) from public.perception_beliefs b where b.project_id = p.id), '[]'::jsonb),
    'objectives', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from public.perception_objectives o where o.project_id = p.id), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.perception_routes r where r.project_id = p.id), '[]'::jsonb),
    'route_nodes', coalesce((select jsonb_agg(to_jsonb(n) order by n.sort_order, n.created_at) from public.perception_route_nodes n where n.project_id = p.id), '[]'::jsonb),
    'worker_runs', coalesce((select jsonb_agg(to_jsonb(w) order by w.created_at) from public.perception_worker_runs w where w.project_id = p.id), '[]'::jsonb),
    'artifacts', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from public.perception_artifacts a where a.project_id = p.id), '[]'::jsonb),
    'verifications', coalesce((select jsonb_agg(to_jsonb(v) order by v.checked_at) from public.perception_verification_runs v where v.project_id = p.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from public.perception_model_events e where e.project_id = p.id), '[]'::jsonb)
  ) into v_result
  from public.perception_projects p
  where p.id = p_project_id and p.user_id = v_user;

  return v_result;
end;
$$;

revoke all on function public.perception_get_project_world(uuid) from public, anon;
grant execute on function public.perception_get_project_world(uuid) to authenticated;
