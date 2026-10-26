-- LMTYAI Max C: append-only revenue intelligence and reconciliation.

create table if not exists public.lmtyai_revenue_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  provider text not null default 'stripe' check (length(provider) between 1 and 32),
  provider_event_id text not null check (length(provider_event_id) between 1 and 255),
  event_type text not null check (length(event_type) between 1 and 120),
  provider_object_type text,
  provider_object_id text,
  checkout_session_id text,
  payment_intent_id text,
  invoice_id text,
  subscription_id text,
  customer_ref text,
  product_ref text,
  price_ref text,
  amount_gross_minor bigint not null default 0 check (amount_gross_minor >= 0),
  amount_refunded_minor bigint not null default 0 check (amount_refunded_minor >= 0),
  amount_net_minor bigint not null default 0,
  currency text not null default 'usd' check (currency ~ '^[a-zA-Z]{3}$'),
  occurred_at timestamptz not null,
  source_channel text,
  source_platform text,
  campaign_id text,
  creative_id text,
  first_touch jsonb not null default '{}'::jsonb check (jsonb_typeof(first_touch) = 'object'),
  last_touch jsonb not null default '{}'::jsonb check (jsonb_typeof(last_touch) = 'object'),
  attribution_state text not null default 'unknown'
    check (attribution_state in ('verified', 'probable', 'possible', 'unknown')),
  attribution_confidence double precision not null default 0
    check (attribution_confidence >= 0 and attribution_confidence <= 1),
  verification_state text not null default 'observed'
    check (verification_state in ('observed', 'verified', 'contradicted')),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  raw_facts jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_facts) = 'object'),
  created_at timestamptz not null default now(),
  constraint lmtyai_revenue_events_provider_event_unique unique (provider, provider_event_id)
);

comment on table public.lmtyai_revenue_events is
  'Append-only LMTYAI commercial event ledger. Stripe remains authoritative for money; card/payment-method details are intentionally excluded.';

create table if not exists public.lmtyai_revenue_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.perception_projects(id) on delete cascade,
  provider text not null default 'stripe' check (length(provider) between 1 and 32),
  window_start timestamptz not null,
  window_end timestamptz not null,
  ledger_event_count bigint not null default 0 check (ledger_event_count >= 0),
  provider_event_count bigint not null default 0 check (provider_event_count >= 0),
  ledger_gross_minor bigint not null default 0,
  ledger_refunded_minor bigint not null default 0,
  ledger_net_minor bigint not null default 0,
  provider_gross_minor bigint not null default 0,
  provider_refunded_minor bigint not null default 0,
  provider_net_minor bigint not null default 0,
  currency text not null default 'usd' check (currency ~ '^[a-zA-Z]{3}$'),
  status text not null check (status in ('matched', 'mismatch', 'partial')),
  differences jsonb not null default '{}'::jsonb check (jsonb_typeof(differences) = 'object'),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  created_at timestamptz not null default now(),
  check (window_end > window_start)
);

comment on table public.lmtyai_revenue_reconciliations is
  'Append-only comparison between Perception revenue observations and Stripe-authoritative totals. Mismatches are preserved rather than silently rewritten.';

alter table public.lmtyai_revenue_events enable row level security;
alter table public.lmtyai_revenue_reconciliations enable row level security;

revoke all on table public.lmtyai_revenue_events from anon, authenticated, service_role;
revoke all on table public.lmtyai_revenue_reconciliations from anon, authenticated, service_role;

grant select on table public.lmtyai_revenue_events to authenticated;
grant select on table public.lmtyai_revenue_reconciliations to authenticated;
grant select, insert on table public.lmtyai_revenue_events to service_role;
grant select, insert on table public.lmtyai_revenue_reconciliations to service_role;

create policy "owners read lmtyai revenue events"
on public.lmtyai_revenue_events
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "owners read lmtyai revenue reconciliations"
on public.lmtyai_revenue_reconciliations
for select
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists lmtyai_revenue_events_project_occurred_idx
  on public.lmtyai_revenue_events (project_id, occurred_at desc);
create index if not exists lmtyai_revenue_events_project_attribution_idx
  on public.lmtyai_revenue_events (project_id, attribution_state, occurred_at desc);
create index if not exists lmtyai_revenue_events_project_creative_idx
  on public.lmtyai_revenue_events (project_id, creative_id, occurred_at desc)
  where creative_id is not null;
create index if not exists lmtyai_revenue_reconciliations_project_created_idx
  on public.lmtyai_revenue_reconciliations (project_id, created_at desc);

create or replace function public.lmtyai_get_revenue_dashboard(
  p_project_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered as (
    select e.*
    from public.lmtyai_revenue_events e
    where e.project_id = p_project_id
      and e.user_id = (select auth.uid())
      and e.occurred_at >= p_from
      and e.occurred_at < p_to
  ),
  totals as (
    select
      count(*)::bigint as event_count,
      count(*) filter (where amount_gross_minor > 0)::bigint as order_events,
      coalesce(sum(amount_gross_minor), 0)::bigint as gross_minor,
      coalesce(sum(amount_refunded_minor), 0)::bigint as refunded_minor,
      coalesce(sum(amount_net_minor), 0)::bigint as net_minor,
      coalesce(sum(amount_net_minor) filter (
        where lower(coalesce(source_platform, '')) = 'tiktok' and attribution_state = 'verified'
      ), 0)::bigint as tiktok_verified_net_minor,
      coalesce(sum(amount_net_minor) filter (
        where lower(coalesce(source_platform, '')) = 'tiktok' and attribution_state = 'probable'
      ), 0)::bigint as tiktok_probable_net_minor,
      coalesce(sum(amount_net_minor) filter (
        where lower(coalesce(source_platform, '')) = 'tiktok' and attribution_state = 'possible'
      ), 0)::bigint as tiktok_possible_net_minor,
      coalesce(sum(amount_net_minor) filter (where attribution_state = 'unknown'), 0)::bigint as unknown_attribution_net_minor
    from filtered
  ),
  top_creative as (
    select
      creative_id,
      coalesce(sum(amount_net_minor), 0)::bigint as net_minor,
      count(*) filter (where amount_gross_minor > 0)::bigint as order_events
    from filtered
    where creative_id is not null
    group by creative_id
    order by sum(amount_net_minor) desc, creative_id
    limit 1
  ),
  last_reconciliation as (
    select r.*
    from public.lmtyai_revenue_reconciliations r
    where r.project_id = p_project_id
      and r.user_id = (select auth.uid())
    order by r.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'project_id', p_project_id,
    'window', jsonb_build_object('from', p_from, 'to', p_to),
    'event_count', t.event_count,
    'order_events', t.order_events,
    'gross_minor', t.gross_minor,
    'refunded_minor', t.refunded_minor,
    'net_minor', t.net_minor,
    'attribution', jsonb_build_object(
      'tiktok_verified_net_minor', t.tiktok_verified_net_minor,
      'tiktok_probable_net_minor', t.tiktok_probable_net_minor,
      'tiktok_possible_net_minor', t.tiktok_possible_net_minor,
      'unknown_net_minor', t.unknown_attribution_net_minor
    ),
    'top_creative', coalesce((
      select jsonb_build_object(
        'creative_id', c.creative_id,
        'net_minor', c.net_minor,
        'order_events', c.order_events
      )
      from top_creative c
    ), 'null'::jsonb),
    'last_reconciliation', coalesce((
      select jsonb_build_object(
        'status', r.status,
        'provider', r.provider,
        'window_start', r.window_start,
        'window_end', r.window_end,
        'ledger_net_minor', r.ledger_net_minor,
        'provider_net_minor', r.provider_net_minor,
        'differences', r.differences,
        'created_at', r.created_at
      )
      from last_reconciliation r
    ), 'null'::jsonb)
  )
  from totals t;
$$;

revoke all on function public.lmtyai_get_revenue_dashboard(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.lmtyai_get_revenue_dashboard(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.lmtyai_get_stripe_webhook_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select v.decrypted_secret
  from vault.decrypted_secrets v
  where v.name = 'lmtyai_stripe_webhook_signing_secret'
  order by v.updated_at desc
  limit 1;
$$;

revoke all on function public.lmtyai_get_stripe_webhook_secret() from public, anon, authenticated;
grant execute on function public.lmtyai_get_stripe_webhook_secret() to service_role;
