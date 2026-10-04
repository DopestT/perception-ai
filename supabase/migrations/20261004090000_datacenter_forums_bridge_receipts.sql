-- DataCenter.Forums -> Perception transport receipt ledger.
-- Locks each external event id to one signed body hash so an event id cannot be
-- reused with different content. This is transport integrity, not epistemic truth.

create table if not exists public.perception_bridge_receipts (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  event_id text not null,
  body_hash text not null,
  status text not null default 'processing'
    check (status in ('processing', 'accepted', 'failed')),
  observation_id uuid references public.perception_source_observations(id) on delete set null,
  last_error text,
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, event_id)
);

create index if not exists perception_bridge_receipts_status_idx
  on public.perception_bridge_receipts(client_id, status, updated_at desc);

alter table public.perception_bridge_receipts enable row level security;

revoke all on public.perception_bridge_receipts from public, anon, authenticated;
grant select, insert, update on public.perception_bridge_receipts to service_role;
