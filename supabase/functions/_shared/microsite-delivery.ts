export type MicrositeRoutingMode = 'PRACTICE' | 'LIVE_DISABLED' | 'LIVE'

export type ProviderOfferDeliveryInput = {
  offerId: string
  leadId: string
  providerId: string
  serviceKey: string
  serviceAreaKey: string
  urgency: string
  expiresAt: string
}

export type HomeownerNoticeInput = {
  leadId: string
  type: string
  rendered: { subject?: string; body: string }
}

export type DeliveryResult = {
  status: 'SIMULATED' | 'BLOCKED'
  simulated: boolean
  metadata: Record<string, unknown>
}

export async function dispatchProviderOffer(
  input: ProviderOfferDeliveryInput,
  mode: MicrositeRoutingMode,
): Promise<DeliveryResult> {
  const metadata = {
    kind: 'provider_offer',
    offerId: input.offerId,
    leadId: input.leadId,
    providerId: input.providerId,
    serviceKey: input.serviceKey,
    serviceAreaKey: input.serviceAreaKey,
    urgency: input.urgency,
    expiresAt: input.expiresAt,
  }
  if (mode === 'PRACTICE') return { status: 'SIMULATED', simulated: true, metadata }
  return {
    status: 'BLOCKED',
    simulated: false,
    metadata: { ...metadata, reason: 'live_adapter_not_installed' },
  }
}

export async function dispatchHomeownerNotice(
  input: HomeownerNoticeInput,
  mode: MicrositeRoutingMode,
): Promise<DeliveryResult> {
  const metadata = {
    kind: 'homeowner_notice',
    leadId: input.leadId,
    type: input.type,
    rendered: input.rendered,
  }
  if (mode === 'PRACTICE' || mode === 'LIVE_DISABLED') {
    return { status: 'SIMULATED', simulated: true, metadata }
  }
  return {
    status: 'BLOCKED',
    simulated: false,
    metadata: { ...metadata, reason: 'live_adapter_not_installed' },
  }
}
