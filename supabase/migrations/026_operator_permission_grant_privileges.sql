-- Allow authenticated users to create and revoke their own scoped
-- Perception permission grants. Row Level Security remains authoritative:
-- the existing policy restricts all access to rows where auth.uid() = user_id.

grant select, insert, update
on table public.perception_permission_grants
to authenticated;
