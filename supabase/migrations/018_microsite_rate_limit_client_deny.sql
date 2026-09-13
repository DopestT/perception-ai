create policy "no client access to microsite lead rate limits"
on public.perception_microsite_lead_rate_limits
for all
to anon, authenticated
using (false)
with check (false);
