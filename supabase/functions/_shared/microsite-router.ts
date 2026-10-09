import { dispatchProviderOffer, type DeliveryResult, type MicrositeRoutingMode } from './microsite-delivery.ts'
import {
  classifyHagerstownWellHelp,
  deriveUrgency,
  offerTimeoutSeconds,
  rankEligibleProviders,
  resolveServiceAreaKey,
  type RoutingPerformance,
  type RoutingProvider,
  type RoutingServiceKey,
  type RoutingUrgency,
  type ServiceAreaRule,
} from './microsite-routing.ts'

export type RouterLeadState =
  | 'NEW' | 'QUALIFIED' | 'ROUTING' | 'ACCEPTED' | 'CONTACTED' | 'APPOINTMENT' | 'COMPLETED'
  | 'DUPLICATE' | 'UNQUALIFIED' | 'UNROUTABLE' | 'LOST' | 'CANCELLED' | 'MANUAL_REVIEW'

export type RouterLead = {
  id: string
  userId: string
  micrositeId: string
  state: RouterLeadState
  metadata: Record<string, unknown>
}

export type RouterProvider = RoutingProvider

export type RoutingConfig = {
  micrositeId: string
  mode: MicrositeRoutingMode
  outboundEnabled: boolean
  serviceAreaRules: ServiceAreaRule[]
  emergencyTimeoutSeconds: number
  routineTimeoutSeconds: number
}

export type RouterRouteStatus = 'PENDING' | 'ACTIVE' | 'ACCEPTED' | 'EXHAUSTED' | 'CANCELLED'
export type RouterOfferStatus = 'PENDING' | 'SENT' | 'ACCEPTED' | 'PASSED' | 'EXPIRED' | 'DELIVERY_FAILED' | 'CANCELLED'

export type RouterRoute = {
  id: string
  leadId: string
  status: RouterRouteStatus
  practice: boolean
  serviceKey: RoutingServiceKey
  serviceAreaKey: string
  urgency: RoutingUrgency
  acceptedProviderId?: string | null
}

export type RouterOffer = {
  id: string
  routeId: string
  leadId: string
  providerId: string
  rank: number
  status: RouterOfferStatus
  score: number
  scoreReasons: Record<string, number>
  expiresAt: string
}

export type TransitionLeadInput = {
  leadId: string
  nextState: RouterLeadState
  eventType: string
  providerId?: string | null
  metadata?: Record<string, unknown>
  idempotencyKey: string
}

export type StartRouteInput = {
  leadId: string
  serviceKey: RoutingServiceKey
  serviceAreaKey: string
  urgency: RoutingUrgency
  practice: boolean
  idempotencyKey: string
}

export type CreateOfferInput = {
  routeId: string
  leadId: string
  providerId: string
  rank: number
  score: number
  scoreReasons: Record<string, number>
  expiresAt: string
  idempotencyKey: string
}

export interface MicrositeRouterRepository {
  getLead(leadId: string): Promise<RouterLead | null>
  getRoutingConfig(micrositeId: string): Promise<RoutingConfig | null>
  listProviders(userId: string): Promise<RouterProvider[]>
  getProvider(providerId: string): Promise<RouterProvider | null>
  getProviderPerformance(userId: string): Promise<Record<string, RoutingPerformance>>
  transitionLead(input: TransitionLeadInput): Promise<void>
  startRoute(input: StartRouteInput): Promise<RouterRoute>
  getRoute(routeId: string): Promise<RouterRoute | null>
  listOffers(routeId: string): Promise<RouterOffer[]>
  createOffer(input: CreateOfferInput): Promise<RouterOffer>
  recordOfferDelivery(offerId: string, delivery: DeliveryResult): Promise<void>
  resolveOffer(offerId: string, outcome: 'PASSED' | 'EXPIRED' | 'DELIVERY_FAILED' | 'CANCELLED', idempotencyKey: string): Promise<{ status: string }>
  exhaustRoute(routeId: string, idempotencyKey: string): Promise<{ status: string }>
}

export type RouterResult = {
  status: 'OFFERED' | 'WAITING' | 'NOOP' | 'EXHAUSTED' | 'UNROUTABLE' | 'UNQUALIFIED' | 'REVIEW_REQUIRED' | 'LIVE_BLOCKED' | 'NOT_FOUND' | 'CONFIG_MISSING'
  routeId?: string
  offerId?: string
  providerId?: string
  reason?: string
}

function textMetadata(lead: RouterLead, key: string): string {
  const value = lead.metadata[key]
  return typeof value === 'string' ? value : ''
}

function isoAfter(now: Date, seconds: number) {
  return new Date(now.getTime() + seconds * 1000).toISOString()
}

function routeKey(leadId: string) {
  return `route:${leadId}`
}

async function createNextOffer(
  repo: MicrositeRouterRepository,
  lead: RouterLead,
  route: RouterRoute,
  config: RoutingConfig,
  now: Date,
): Promise<RouterResult> {
  const providers = await repo.listProviders(lead.userId)
  const performance = await repo.getProviderPerformance(lead.userId)
  const timeoutSeconds = offerTimeoutSeconds(route.urgency, {
    emergencyTimeoutSeconds: config.emergencyTimeoutSeconds,
    routineTimeoutSeconds: config.routineTimeoutSeconds,
  })
  const ranking = rankEligibleProviders({
    providers,
    performance,
    serviceKey: route.serviceKey,
    serviceAreaKey: route.serviceAreaKey,
    urgency: route.urgency,
    timeoutSeconds,
  })
  const offeredProviderIds = new Set((await repo.listOffers(route.id)).map((item) => item.providerId))

  for (let index = 0; index < ranking.eligible.length; index += 1) {
    const ranked = ranking.eligible[index]
    if (offeredProviderIds.has(ranked.provider.id)) continue

    // Ranking is a snapshot. Reload immediately before creating the offer.
    const current = await repo.getProvider(ranked.provider.id)
    if (!current) continue
    const currentEligibility = rankEligibleProviders({
      providers: [current],
      performance,
      serviceKey: route.serviceKey,
      serviceAreaKey: route.serviceAreaKey,
      urgency: route.urgency,
      timeoutSeconds,
    })
    if (currentEligibility.eligible.length !== 1) continue

    const reranked = currentEligibility.eligible[0]
    const expiresAt = isoAfter(now, timeoutSeconds)
    const created = await repo.createOffer({
      routeId: route.id,
      leadId: route.leadId,
      providerId: current.id,
      rank: index + 1,
      score: reranked.score,
      scoreReasons: reranked.scoreReasons,
      expiresAt,
      idempotencyKey: `offer:${route.id}:${current.id}`,
    })
    const delivery = await dispatchProviderOffer({
      offerId: created.id,
      leadId: route.leadId,
      providerId: current.id,
      serviceKey: route.serviceKey,
      serviceAreaKey: route.serviceAreaKey,
      urgency: route.urgency,
      expiresAt,
    }, config.mode)
    await repo.recordOfferDelivery(created.id, delivery)
    return { status: 'OFFERED', routeId: route.id, offerId: created.id, providerId: current.id }
  }

  await repo.exhaustRoute(route.id, `route:${route.id}:exhausted`)
  return { status: 'EXHAUSTED', routeId: route.id }
}

export async function startMicrositeRouting(
  repo: MicrositeRouterRepository,
  leadId: string,
  now = new Date(),
): Promise<RouterResult> {
  const lead = await repo.getLead(leadId)
  if (!lead) return { status: 'NOT_FOUND' }
  if (lead.state === 'MANUAL_REVIEW' || lead.state === 'DUPLICATE') {
    return { status: 'REVIEW_REQUIRED', reason: lead.state.toLowerCase() }
  }
  if (!['NEW', 'QUALIFIED'].includes(lead.state)) {
    return { status: 'NOOP', reason: `lead_${lead.state.toLowerCase()}` }
  }

  const config = await repo.getRoutingConfig(lead.micrositeId)
  if (!config) return { status: 'CONFIG_MISSING' }
  if (config.mode !== 'PRACTICE') return { status: 'LIVE_BLOCKED', reason: 'verified_live_adapter_not_installed' }

  const issue = textMetadata(lead, 'issue')
  const explicitServiceKey = textMetadata(lead, 'service_key') || null
  const classification = classifyHagerstownWellHelp({ explicitServiceKey, issue })
  if (classification.reviewRequired || !classification.serviceKey) {
    await repo.transitionLead({
      leadId: lead.id,
      nextState: 'MANUAL_REVIEW',
      eventType: 'lead.manual_review',
      metadata: { reason: classification.source },
      idempotencyKey: `lead:${lead.id}:manual-review`,
    })
    return { status: 'REVIEW_REQUIRED', reason: classification.source }
  }

  const serviceAreaKey = resolveServiceAreaKey(textMetadata(lead, 'zip'), config.serviceAreaRules)
  if (!serviceAreaKey) {
    await repo.transitionLead({
      leadId: lead.id,
      nextState: 'UNQUALIFIED',
      eventType: 'lead.unqualified',
      metadata: { reason: 'outside_service_area' },
      idempotencyKey: `lead:${lead.id}:unqualified:service-area`,
    })
    return { status: 'UNQUALIFIED', reason: 'outside_service_area' }
  }

  const urgency = deriveUrgency({ serviceKey: classification.serviceKey, issue })
  const providers = await repo.listProviders(lead.userId)
  const performance = await repo.getProviderPerformance(lead.userId)
  const timeoutSeconds = offerTimeoutSeconds(urgency, {
    emergencyTimeoutSeconds: config.emergencyTimeoutSeconds,
    routineTimeoutSeconds: config.routineTimeoutSeconds,
  })
  const ranking = rankEligibleProviders({
    providers,
    performance,
    serviceKey: classification.serviceKey,
    serviceAreaKey,
    urgency,
    timeoutSeconds,
  })
  if (ranking.eligible.length === 0) {
    await repo.transitionLead({
      leadId: lead.id,
      nextState: 'UNROUTABLE',
      eventType: 'route.no_eligible_provider',
      metadata: { serviceKey: classification.serviceKey, serviceAreaKey, urgency },
      idempotencyKey: `lead:${lead.id}:unroutable:no-provider`,
    })
    return { status: 'UNROUTABLE', reason: 'no_eligible_provider' }
  }

  if (lead.state !== 'QUALIFIED') {
    await repo.transitionLead({
      leadId: lead.id,
      nextState: 'QUALIFIED',
      eventType: 'lead.qualified',
      metadata: { serviceKey: classification.serviceKey, serviceAreaKey, urgency },
      idempotencyKey: `lead:${lead.id}:qualified`,
    })
  }

  const createdRoute = await repo.startRoute({
    leadId: lead.id,
    serviceKey: classification.serviceKey,
    serviceAreaKey,
    urgency,
    practice: true,
    idempotencyKey: routeKey(lead.id),
  })
  return await createNextOffer(repo, lead, createdRoute, config, now)
}

export async function tickMicrositeRouting(
  repo: MicrositeRouterRepository,
  routeId: string,
  now = new Date(),
): Promise<RouterResult> {
  const route = await repo.getRoute(routeId)
  if (!route) return { status: 'NOT_FOUND' }
  if (route.status !== 'ACTIVE') return { status: 'NOOP', routeId: route.id }

  const lead = await repo.getLead(route.leadId)
  if (!lead) return { status: 'NOT_FOUND' }
  const config = await repo.getRoutingConfig(lead.micrositeId)
  if (!config) return { status: 'CONFIG_MISSING' }
  if (config.mode !== 'PRACTICE') return { status: 'LIVE_BLOCKED', routeId: route.id }

  const offers = [...await repo.listOffers(route.id)].sort((a, b) => a.rank - b.rank)
  const current = offers.at(-1)
  if (!current) return await createNextOffer(repo, lead, route, config, now)

  if (current.status === 'ACCEPTED') return { status: 'NOOP', routeId: route.id }
  if (current.status === 'PENDING' || current.status === 'SENT') {
    if (new Date(current.expiresAt).getTime() > now.getTime()) {
      return { status: 'WAITING', routeId: route.id, offerId: current.id, providerId: current.providerId }
    }
    await repo.resolveOffer(current.id, 'EXPIRED', `offer:${current.id}:expired`)
  } else if (!['PASSED', 'DELIVERY_FAILED', 'EXPIRED', 'CANCELLED'].includes(current.status)) {
    return { status: 'NOOP', routeId: route.id }
  }

  return await createNextOffer(repo, lead, route, config, now)
}
