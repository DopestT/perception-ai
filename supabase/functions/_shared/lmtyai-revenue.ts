type JsonObject = Record<string, unknown>

type StripeLikeEvent = {
  id: string
  type: string
  created: number
  livemode?: boolean
  data: { object: JsonObject }
}

export type NormalizedRevenueEvent = {
  provider_event_id: string
  event_type: string
  provider_object_type: string | null
  provider_object_id: string | null
  checkout_session_id: string | null
  payment_intent_id: string | null
  invoice_id: string | null
  subscription_id: string | null
  customer_ref: string | null
  product_ref: string | null
  price_ref: string | null
  amount_gross_minor: number
  amount_refunded_minor: number
  amount_net_minor: number
  currency: string
  occurred_at: string
  source_channel: string | null
  source_platform: string | null
  campaign_id: string | null
  creative_id: string | null
  first_touch: JsonObject
  last_touch: JsonObject
  attribution_state: 'verified' | 'probable' | 'possible' | 'unknown'
  attribution_confidence: number
  verification_state: 'observed' | 'verified'
  evidence: JsonObject[]
  raw_facts: JsonObject
}

const text = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && 'id' in value && typeof (value as { id?: unknown }).id === 'string') {
    return String((value as { id: string }).id)
  }
  return null
}

const integer = (value: unknown): number => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0

const metadataOf = (obj: JsonObject): Record<string, string> => {
  const raw = obj.metadata
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, String(value)])
  )
}

const first = (meta: Record<string, string>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = meta[key]?.trim()
    if (value) return value
  }
  return null
}

function attribution(meta: Record<string, string>) {
  const sourcePlatform = first(meta, ['source_platform', 'lmtyai_source_platform', 'utm_source'])
  const sourceChannel = first(meta, ['source_channel', 'lmtyai_source_channel', 'utm_medium'])
  const campaignId = first(meta, ['campaign_id', 'lmtyai_campaign_id', 'utm_campaign'])
  const creativeId = first(meta, ['creative_id', 'lmtyai_creative_id', 'content_id', 'utm_content'])

  if (sourcePlatform && creativeId) {
    return { sourcePlatform, sourceChannel, campaignId, creativeId, state: 'verified' as const, confidence: 1 }
  }
  if (sourcePlatform && campaignId) {
    return { sourcePlatform, sourceChannel, campaignId, creativeId, state: 'probable' as const, confidence: 0.8 }
  }
  if (sourcePlatform) {
    return { sourcePlatform, sourceChannel, campaignId, creativeId, state: 'possible' as const, confidence: 0.5 }
  }
  return { sourcePlatform: null, sourceChannel, campaignId, creativeId, state: 'unknown' as const, confidence: 0 }
}

export function normalizeStripeRevenueEvent(event: StripeLikeEvent): NormalizedRevenueEvent {
  const obj = event.data?.object ?? {}
  const objectType = text(obj.object)
  const objectId = text(obj.id)
  const meta = metadataOf(obj)
  const attr = attribution(meta)

  let gross = 0
  let refunded = 0
  let net = 0
  let verification: 'observed' | 'verified' = 'observed'

  if (event.type === 'payment_intent.succeeded') {
    const invoice = text(obj.invoice)
    if (!invoice) {
      gross = integer(obj.amount_received ?? obj.amount)
      net = gross
    }
    verification = 'verified'
  } else if (event.type === 'invoice.paid') {
    gross = integer(obj.amount_paid)
    net = gross
    verification = 'verified'
  } else if (event.type === 'charge.refunded') {
    refunded = integer(obj.amount_refunded)
    net = -refunded
    verification = 'verified'
  }

  const invoiceId = event.type.startsWith('invoice.') ? objectId : text(obj.invoice)
  const paymentIntentId = event.type.startsWith('payment_intent.') ? objectId : text(obj.payment_intent)
  const checkoutSessionId = event.type.startsWith('checkout.session.') ? objectId : text(meta.checkout_session_id)
  const subscriptionId = event.type.startsWith('customer.subscription.') ? objectId : text(obj.subscription)
  const currency = (text(obj.currency) ?? 'usd').toLowerCase()

  return {
    provider_event_id: event.id,
    event_type: event.type,
    provider_object_type: objectType,
    provider_object_id: objectId,
    checkout_session_id: checkoutSessionId,
    payment_intent_id: paymentIntentId,
    invoice_id: invoiceId,
    subscription_id: subscriptionId,
    customer_ref: text(obj.customer),
    product_ref: first(meta, ['product_ref', 'product_id', 'lmtyai_product_id']),
    price_ref: first(meta, ['price_ref', 'price_id', 'lmtyai_price_id']),
    amount_gross_minor: Math.max(0, gross),
    amount_refunded_minor: Math.max(0, refunded),
    amount_net_minor: net,
    currency,
    occurred_at: new Date(event.created * 1000).toISOString(),
    source_channel: attr.sourceChannel,
    source_platform: attr.sourcePlatform?.toLowerCase() ?? null,
    campaign_id: attr.campaignId,
    creative_id: attr.creativeId,
    first_touch: {},
    last_touch: {},
    attribution_state: attr.state,
    attribution_confidence: attr.confidence,
    verification_state: verification,
    evidence: [{ provider: 'stripe', event_id: event.id, event_type: event.type }],
    raw_facts: {
      object_id: objectId,
      object_type: objectType,
      status: text(obj.status),
      payment_status: text(obj.payment_status),
      mode: text(obj.mode),
      livemode: Boolean(event.livemode),
      metadata_keys: Object.keys(meta).sort(),
    },
  }
}
