create table if not exists public.perception_microsite_lead_rate_limits (
  microsite_id uuid not null references public.perception_microsites(id) on delete cascade,
  network_hash text not null,
  hour_bucket timestamptz not null,
  submission_count integer not null default 0 check (submission_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (microsite_id, network_hash, hour_bucket)
);

create index if not exists perception_microsite_lead_rate_limits_time_idx
  on public.perception_microsite_lead_rate_limits(hour_bucket);

alter table public.perception_microsite_lead_rate_limits enable row level security;
revoke all on public.perception_microsite_lead_rate_limits from anon, authenticated;

comment on table public.perception_microsite_lead_rate_limits is
  'Abuse-control ledger for public microsite lead forms. Stores only a salted hash of the source network, never the raw IP.';
