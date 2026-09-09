alter function public.perception_get_token_dashboard(uuid) security invoker;
revoke execute on function public.perception_get_token_dashboard(uuid) from anon;
grant execute on function public.perception_get_token_dashboard(uuid) to authenticated;

revoke execute on function public.perception_record_token_usage_internal(
  uuid, uuid, uuid, uuid, text, text, text, text, text,
  bigint, bigint, bigint, bigint, integer, numeric, numeric, text, jsonb
) from anon, authenticated;

grant execute on function public.perception_record_token_usage_internal(
  uuid, uuid, uuid, uuid, text, text, text, text, text,
  bigint, bigint, bigint, bigint, integer, numeric, numeric, text, jsonb
) to service_role;
