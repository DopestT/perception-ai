import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { normalizeStripeRevenueEvent } from '../_shared/lmtyai-revenue.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
})

const supportedEvents = new Set([
  'checkout.session.completed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
])

function serviceKey() {
  const named = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
  return named.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || ''
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = serviceKey()
  const signature = req.headers.get('stripe-signature') ?? ''
  if (!url || !key || !signature) return json({ ok: false, error: 'webhook_unavailable' }, 503)

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: webhookSecret, error: secretError } = await admin.rpc('lmtyai_get_stripe_webhook_secret')
  if (secretError || typeof webhookSecret !== 'string' || !webhookSecret) {
    console.error('lmtyai_stripe_webhook_secret_unavailable')
    return json({ ok: false, error: 'webhook_unavailable' }, 503)
  }

  const rawBody = await req.text()
  const stripe = new Stripe('sk_placeholder', { apiVersion: '2025-08-27.basil' })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch {
    return json({ ok: false, error: 'invalid_signature' }, 400)
  }

  if (!supportedEvents.has(event.type)) {
    return json({ ok: true, received: true, ignored: true })
  }

  const { data: project, error: projectError } = await admin
    .from('perception_projects')
    .select('id,user_id')
    .eq('name', 'LMTYAI Growth Sniffer')
    .eq('active', true)
    .maybeSingle()

  if (projectError || !project) {
    console.error('lmtyai_stripe_project_unavailable')
    return json({ ok: false, error: 'project_unavailable' }, 503)
  }

  const normalized = normalizeStripeRevenueEvent(event as unknown as Parameters<typeof normalizeStripeRevenueEvent>[0])
  const payload = {
    user_id: project.user_id,
    project_id: project.id,
    provider: 'stripe',
    ...normalized,
  }

  const { data: inserted, error: insertError } = await admin
    .from('lmtyai_revenue_events')
    .insert(payload)
    .select('id')
    .maybeSingle()

  if (insertError?.code === '23505') {
    return json({ ok: true, received: true, duplicate: true })
  }
  if (insertError || !inserted) {
    console.error('lmtyai_stripe_revenue_insert_failed')
    return json({ ok: false, error: 'ledger_write_failed' }, 503)
  }

  if (normalized.amount_net_minor !== 0 || event.type === 'checkout.session.completed') {
    const amount = (normalized.amount_net_minor / 100).toFixed(2)
    const attribution = normalized.attribution_state === 'unknown'
      ? 'attribution unknown'
      : `${normalized.attribution_state} ${normalized.source_platform ?? 'source'} attribution`
    const summary = normalized.amount_net_minor > 0
      ? `LMTYAI: verified Stripe revenue event ${normalized.currency.toUpperCase()} ${amount}; ${attribution}.`
      : normalized.amount_net_minor < 0
        ? `LMTYAI: verified Stripe negative revenue event ${normalized.currency.toUpperCase()} ${amount}; ${attribution}.`
        : `LMTYAI: Stripe checkout completed; ${attribution}.`

    const { error: signalError } = await admin.from('perception_world_signals').insert({
      user_id: project.user_id,
      project_id: project.id,
      summary,
      relevance: 1,
      impact: normalized.amount_net_minor === 0 ? 0.55 : 0.92,
      novelty: 0.9,
      confidence: normalized.verification_state === 'verified' ? 0.99 : 0.9,
      urgency: normalized.amount_net_minor < 0 ? 0.8 : 0.55,
      noise: 0,
      affected_belief_ids: [],
      affected_route_node_ids: [],
      source_refs: [{ provider: 'stripe', event_id: event.id, revenue_event_id: inserted.id }],
      surfaced_at: new Date().toISOString(),
      detected_at: normalized.occurred_at,
    })
    if (signalError) console.error('lmtyai_stripe_world_signal_failed')
  }

  return json({ ok: true, received: true, revenue_event_id: inserted.id })
})
