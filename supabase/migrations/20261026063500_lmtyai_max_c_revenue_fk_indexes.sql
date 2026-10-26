-- Cover Max C revenue foreign keys used by ownership/RLS lookups.
create index if not exists lmtyai_revenue_events_user_idx
  on public.lmtyai_revenue_events (user_id);

create index if not exists lmtyai_revenue_reconciliations_user_idx
  on public.lmtyai_revenue_reconciliations (user_id);
