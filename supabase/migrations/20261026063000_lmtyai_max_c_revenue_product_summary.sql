-- Expand the Max C read model so Perception can answer what sold and how many customers converted.
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
      count(*) filter (where amount_gross_minor > 0 and verification_state = 'verified')::bigint as verified_order_events,
      count(distinct customer_ref) filter (where customer_ref is not null and amount_gross_minor > 0)::bigint as customer_count,
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
  product_rows as (
    select
      coalesce(product_ref, 'unknown') as product_ref,
      price_ref,
      currency,
      count(*) filter (where amount_gross_minor > 0)::bigint as order_events,
      count(distinct customer_ref) filter (where customer_ref is not null and amount_gross_minor > 0)::bigint as customer_count,
      coalesce(sum(amount_gross_minor), 0)::bigint as gross_minor,
      coalesce(sum(amount_refunded_minor), 0)::bigint as refunded_minor,
      coalesce(sum(amount_net_minor), 0)::bigint as net_minor
    from filtered
    where amount_gross_minor > 0 or amount_refunded_minor > 0
    group by coalesce(product_ref, 'unknown'), price_ref, currency
  ),
  products as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_ref', product_ref,
          'price_ref', price_ref,
          'currency', currency,
          'order_events', order_events,
          'customer_count', customer_count,
          'gross_minor', gross_minor,
          'refunded_minor', refunded_minor,
          'net_minor', net_minor
        ) order by net_minor desc, product_ref
      ),
      '[]'::jsonb
    ) as items
    from product_rows
  ),
  top_product as (
    select *
    from product_rows
    order by net_minor desc, product_ref
    limit 1
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
    'verified_order_events', t.verified_order_events,
    'customer_count', t.customer_count,
    'gross_minor', t.gross_minor,
    'refunded_minor', t.refunded_minor,
    'net_minor', t.net_minor,
    'attribution', jsonb_build_object(
      'tiktok_verified_net_minor', t.tiktok_verified_net_minor,
      'tiktok_probable_net_minor', t.tiktok_probable_net_minor,
      'tiktok_possible_net_minor', t.tiktok_possible_net_minor,
      'unknown_net_minor', t.unknown_attribution_net_minor
    ),
    'products', p.items,
    'top_product', coalesce((
      select jsonb_build_object(
        'product_ref', tp.product_ref,
        'price_ref', tp.price_ref,
        'currency', tp.currency,
        'order_events', tp.order_events,
        'customer_count', tp.customer_count,
        'gross_minor', tp.gross_minor,
        'refunded_minor', tp.refunded_minor,
        'net_minor', tp.net_minor
      )
      from top_product tp
    ), 'null'::jsonb),
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
  from totals t
  cross join products p;
$$;

revoke all on function public.lmtyai_get_revenue_dashboard(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.lmtyai_get_revenue_dashboard(uuid, timestamptz, timestamptz) to authenticated;
