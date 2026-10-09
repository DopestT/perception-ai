import { pathToFileURL } from 'node:url'
import {
  startMicrositeRouting,
  tickMicrositeRouting,
} from '../supabase/functions/_shared/microsite-router.ts'
import {
  dispatchHomeownerNotice,
} from '../supabase/functions/_shared/microsite-delivery.ts'
import {
  renderHomeownerNotice,
} from '../supabase/functions/_shared/microsite-routing.ts'
import {
  buildMicrositeLeadIdentity,
} from '../supabase/functions/_shared/microsite-intake.ts'
import {
  signOfferToken,
} from '../supabase/functions/_shared/microsite-offer-token.ts'
import {
  handleMicrositeProviderResponse,
} from '../supabase/functions/_shared/microsite-provider-response.ts'

const NOW = new Date('2026-10-09T19:00:00.000Z')
const TOKEN_SECRET = 'practice-only-offer-token-secret-32-bytes'
const IDENTITY_SECRET = 'practice-only-lead-identity-secret-32-bytes'

const clone = (value) => structuredClone(value)

function provider(id, overrides = {}) {
  return {
    id,
    displayName: `Provider ${id.slice(-1).toUpperCase()}`,
    status: 'ACTIVE',
    acceptingNewWork: true,
    serviceKeys: ['NO_WATER', 'LOW_PRESSURE'],
    serviceAreaKeys: ['washington-county-md'],
    emergencyCapable: true,
    priorityBias: 0,
    ...overrides,
  }
}

function baseConfig() {
  return {
    micrositeId: 'hwh-practice-site',
    mode: 'PRACTICE',
    outboundEnabled: false,
    serviceAreaRules: [{ key: 'washington-county-md', zips: ['21740', '21742', '21713'] }],
    emergencyTimeoutSeconds: 300,
    routineTimeoutSeconds: 1800,
  }
}

class MemoryRouterRepo {
  constructor(providers = []) {
    this.providers = providers.map(clone)
    this.config = baseConfig()
    this.leads = new Map()
    this.routes = new Map()
    this.offers = []
    this.events = []
    this.fingerprints = new Map()
    this.routeKeys = new Map()
    this.offerKeys = new Map()
    this.eventKeys = new Set()
    this.externalDeliveries = 0
    this.nextLead = 1
    this.nextRoute = 1
    this.nextOffer = 1
  }

  event(type, leadId, idempotencyKey = `${type}:${leadId}:${this.events.length + 1}`) {
    if (this.eventKeys.has(idempotencyKey)) return false
    this.eventKeys.add(idempotencyKey)
    this.events.push({ type, leadId, idempotencyKey })
    return true
  }

  async ingest(input) {
    const identity = await buildMicrositeLeadIdentity({
      secret: IDENTITY_SECRET,
      micrositeId: this.config.micrositeId,
      phone: input.phone,
      email: input.email ?? '',
      zip: input.zip,
      issue: input.issue,
    })
    const existing = this.fingerprints.get(identity.submissionFingerprint)
    if (existing) {
      this.event('lead.duplicate_detected', existing, `duplicate:${identity.submissionFingerprint}:${this.events.length}`)
      return { leadId: existing, duplicate: true }
    }
    const id = `HWH-TEST-${String(this.nextLead++).padStart(4, '0')}`
    this.leads.set(id, {
      id,
      userId: 'practice-user',
      micrositeId: this.config.micrositeId,
      state: 'NEW',
      metadata: { zip: input.zip, issue: input.issue, service_key: input.serviceKey ?? '' },
      acceptedProviderId: null,
    })
    this.fingerprints.set(identity.submissionFingerprint, id)
    return { leadId: id, duplicate: false }
  }

  async getLead(leadId) {
    const value = this.leads.get(leadId)
    return value ? clone(value) : null
  }

  async getRoutingConfig(micrositeId) {
    return micrositeId === this.config.micrositeId ? clone(this.config) : null
  }

  async listProviders() {
    return this.providers.map(clone)
  }

  async getProvider(providerId) {
    const value = this.providers.find((item) => item.id === providerId)
    return value ? clone(value) : null
  }

  async getProviderPerformance() {
    return {}
  }

  async transitionLead(input) {
    if (this.eventKeys.has(input.idempotencyKey)) return
    const lead = this.leads.get(input.leadId)
    if (!lead) throw new Error('lead not found')
    const previous = lead.state
    lead.state = input.nextState
    if (input.providerId) lead.acceptedProviderId = input.providerId
    this.event(input.eventType, input.leadId, input.idempotencyKey)
    this.events.at(-1).previousState = previous
    this.events.at(-1).nextState = input.nextState
  }

  async startRoute(input) {
    const existingId = this.routeKeys.get(input.idempotencyKey)
    if (existingId) return clone(this.routes.get(existingId))
    const lead = this.leads.get(input.leadId)
    if (!lead) throw new Error('lead not found')
    const id = `HWH-ROUTE-${String(this.nextRoute++).padStart(4, '0')}`
    const value = {
      id,
      leadId: input.leadId,
      status: 'ACTIVE',
      practice: input.practice,
      serviceKey: input.serviceKey,
      serviceAreaKey: input.serviceAreaKey,
      urgency: input.urgency,
      acceptedProviderId: null,
    }
    this.routes.set(id, value)
    this.routeKeys.set(input.idempotencyKey, id)
    lead.state = 'ROUTING'
    this.event('route.started', lead.id, `${input.idempotencyKey}:event`)
    return clone(value)
  }

  async getRoute(routeId) {
    const value = this.routes.get(routeId)
    return value ? clone(value) : null
  }

  async listOffers(routeId) {
    return this.offers.filter((item) => item.routeId === routeId).map(clone)
  }

  async createOffer(input) {
    const existingId = this.offerKeys.get(input.idempotencyKey)
    if (existingId) return clone(this.offers.find((item) => item.id === existingId))
    const id = `HWH-OFFER-${String(this.nextOffer++).padStart(4, '0')}`
    const value = {
      id,
      routeId: input.routeId,
      leadId: input.leadId,
      providerId: input.providerId,
      rank: input.rank,
      status: 'PENDING',
      score: input.score,
      scoreReasons: clone(input.scoreReasons),
      expiresAt: input.expiresAt,
      delivery: null,
    }
    this.offers.push(value)
    this.offerKeys.set(input.idempotencyKey, id)
    this.event('offer.created', input.leadId, `${input.idempotencyKey}:event`)
    return clone(value)
  }

  async recordOfferDelivery(offerId, delivery) {
    const offer = this.offers.find((item) => item.id === offerId)
    if (!offer) throw new Error('offer not found')
    offer.delivery = clone(delivery)
    if (!delivery.simulated && delivery.status !== 'BLOCKED') this.externalDeliveries += 1
    this.event(delivery.status === 'SIMULATED' ? 'offer.simulated' : 'offer.delivery_blocked', offer.leadId, `delivery:${offerId}`)
  }

  async resolveOffer(offerId, outcome, idempotencyKey) {
    const offer = this.offers.find((item) => item.id === offerId)
    if (!offer) throw new Error('offer not found')
    if (this.eventKeys.has(idempotencyKey)) return { status: offer.status.toLowerCase() }
    if (!['PENDING', 'SENT'].includes(offer.status)) return { status: offer.status.toLowerCase() }
    offer.status = outcome
    const event = {
      PASSED: 'offer.passed',
      EXPIRED: 'offer.expired',
      DELIVERY_FAILED: 'offer.delivery_failed',
      CANCELLED: 'offer.cancelled',
    }[outcome]
    this.event(event, offer.leadId, idempotencyKey)
    return { status: outcome.toLowerCase() }
  }

  async exhaustRoute(routeId, idempotencyKey) {
    const route = this.routes.get(routeId)
    if (!route) throw new Error('route not found')
    if (route.acceptedProviderId) return { status: 'already_assigned' }
    route.status = 'EXHAUSTED'
    const lead = this.leads.get(route.leadId)
    lead.state = 'UNROUTABLE'
    for (const offer of this.offers) {
      if (offer.routeId === routeId && ['PENDING', 'SENT'].includes(offer.status)) offer.status = 'CANCELLED'
    }
    this.event('route.exhausted', route.leadId, idempotencyKey)
    return { status: 'exhausted' }
  }

  async getOffer(offerId) {
    const offer = this.offers.find((item) => item.id === offerId)
    return offer ? {
      id: offer.id,
      routeId: offer.routeId,
      status: offer.status,
      expiresAt: offer.expiresAt,
    } : null
  }

  async resolvePass(offerId, idempotencyKey) {
    return await this.resolveOffer(offerId, 'PASSED', idempotencyKey)
  }

  async acceptOffer(offerId, idempotencyKey) {
    const offer = this.offers.find((item) => item.id === offerId)
    if (!offer) throw new Error('offer not found')
    const route = this.routes.get(offer.routeId)
    if (!route) throw new Error('route not found')

    if (route.acceptedProviderId) {
      if (route.acceptedProviderId === offer.providerId && offer.status === 'ACCEPTED') {
        return { status: 'accepted', provider_id: offer.providerId }
      }
      return { status: 'already_assigned', provider_id: route.acceptedProviderId }
    }
    if (!['PENDING', 'SENT'].includes(offer.status)) return { status: offer.status.toLowerCase() }

    route.status = 'ACCEPTED'
    route.acceptedProviderId = offer.providerId
    offer.status = 'ACCEPTED'
    const lead = this.leads.get(route.leadId)
    lead.state = 'ACCEPTED'
    lead.acceptedProviderId = offer.providerId
    for (const other of this.offers) {
      if (other.routeId === route.id && other.id !== offer.id && ['PENDING', 'SENT'].includes(other.status)) other.status = 'CANCELLED'
    }
    this.event('offer.accepted', lead.id, idempotencyKey)
    return { status: 'accepted', provider_id: offer.providerId }
  }

  async simulateNotice(type, leadId, providerId = null) {
    const providerValue = providerId ? this.providers.find((item) => item.id === providerId) : null
    const rendered = renderHomeownerNotice(type, {
      leadId,
      acceptedProviderId: providerValue?.id ?? null,
      providerName: providerValue?.displayName ?? null,
      simulated: true,
    })
    const delivery = await dispatchHomeownerNotice({
      leadId,
      type,
      rendered: { subject: rendered.subject, body: rendered.body },
    }, 'PRACTICE')
    if (!delivery.simulated && delivery.status !== 'BLOCKED') this.externalDeliveries += 1
    this.event(`homeowner.notice.${type.toLowerCase()}`, leadId, `notice:${type}:${leadId}`)
    return { rendered, delivery }
  }
}

function scenarioResult(id, repo, { leadIds = [], routeIds = [], acceptedProviderId = null, passed, notes = [] }) {
  return {
    id,
    passed: Boolean(passed),
    leadIds,
    routeIds,
    acceptedProviderId,
    externalDeliveries: repo.externalDeliveries,
    events: repo.events.map((item) => item.type),
    notes,
  }
}

async function signedResponse(repo, offer, response, now) {
  const token = await signOfferToken({
    offerId: offer.id,
    routeId: offer.routeId,
    expiresAt: offer.expiresAt,
  }, TOKEN_SECRET)
  return await handleMicrositeProviderResponse({ token, response }, repo, TOKEN_SECRET, now)
}

async function scenario01() {
  const repo = new MemoryRouterRepo([provider('provider-a')])
  const ingested = await repo.ingest({ phone: '3015550001', email: 'one@example.test', zip: '21740', issue: 'no water' })
  const started = await startMicrositeRouting(repo, ingested.leadId, NOW)
  const offer = repo.offers.find((item) => item.id === started.offerId)
  const response = await signedResponse(repo, offer, 'ACCEPT', new Date('2026-10-09T19:01:00Z'))
  await repo.simulateNotice('PROVIDER_ACCEPTED', ingested.leadId, 'provider-a')
  const route = repo.routes.get(started.routeId)
  return scenarioResult('01-emergency-first-accept', repo, {
    leadIds: [ingested.leadId], routeIds: [started.routeId], acceptedProviderId: route?.acceptedProviderId ?? null,
    passed: started.status === 'OFFERED' && response.body.status === 'accepted' && route?.acceptedProviderId === 'provider-a' && repo.externalDeliveries === 0,
  })
}

async function scenario02() {
  const repo = new MemoryRouterRepo([provider('provider-a'), provider('provider-b'), provider('provider-c')])
  const ingested = await repo.ingest({ phone: '3015550002', email: 'two@example.test', zip: '21740', issue: 'no water' })
  const started = await startMicrositeRouting(repo, ingested.leadId, NOW)
  const afterTimeout = await tickMicrositeRouting(repo, started.routeId, new Date('2026-10-09T19:05:01Z'))
  const second = repo.offers.find((item) => item.id === afterTimeout.offerId)
  await signedResponse(repo, second, 'PASS', new Date('2026-10-09T19:05:02Z'))
  const afterPass = await tickMicrositeRouting(repo, started.routeId, new Date('2026-10-09T19:05:03Z'))
  const third = repo.offers.find((item) => item.id === afterPass.offerId)
  const accepted = await signedResponse(repo, third, 'ACCEPT', new Date('2026-10-09T19:05:04Z'))
  const route = repo.routes.get(started.routeId)
  return scenarioResult('02-timeout-pass-third-accept', repo, {
    leadIds: [ingested.leadId], routeIds: [started.routeId], acceptedProviderId: route?.acceptedProviderId ?? null,
    passed: afterTimeout.providerId === 'provider-b' && afterPass.providerId === 'provider-c' && accepted.body.status === 'accepted' && route?.acceptedProviderId === 'provider-c',
  })
}

async function scenario03() {
  const repo = new MemoryRouterRepo([provider('provider-a')])
  const first = await repo.ingest({ phone: '3015550003', email: 'three-a@example.test', zip: '21740', issue: 'no water' })
  const second = await repo.ingest({ phone: '3015550004', email: 'three-b@example.test', zip: '21742', issue: 'low pressure' })
  const [a, b] = await Promise.all([
    startMicrositeRouting(repo, first.leadId, NOW),
    startMicrositeRouting(repo, second.leadId, NOW),
  ])
  return scenarioResult('03-simultaneous-independent-leads', repo, {
    leadIds: [first.leadId, second.leadId], routeIds: [a.routeId, b.routeId],
    passed: a.status === 'OFFERED' && b.status === 'OFFERED' && a.routeId !== b.routeId,
  })
}

async function scenario04() {
  const repo = new MemoryRouterRepo([provider('provider-a')])
  const input = { phone: '3015550005', email: 'four@example.test', zip: '21740', issue: 'no water' }
  const first = await repo.ingest(input)
  const second = await repo.ingest(input)
  return scenarioResult('04-duplicate-canonical-lead', repo, {
    leadIds: [first.leadId, second.leadId],
    passed: first.leadId === second.leadId && second.duplicate === true && repo.events.some((item) => item.type === 'lead.duplicate_detected'),
  })
}

async function scenario05() {
  const repo = new MemoryRouterRepo([provider('provider-a')])
  const ingested = await repo.ingest({ phone: '3015550006', email: 'five@example.test', zip: '21740', issue: 'no water' })
  const started = await startMicrositeRouting(repo, ingested.leadId, NOW)
  const offer = repo.offers.find((item) => item.id === started.offerId)
  const token = await signOfferToken({ offerId: offer.id, routeId: offer.routeId, expiresAt: offer.expiresAt }, TOKEN_SECRET)
  const first = await handleMicrositeProviderResponse({ token, response: 'ACCEPT' }, repo, TOKEN_SECRET, new Date('2026-10-09T19:01:00Z'))
  const second = await handleMicrositeProviderResponse({ token, response: 'ACCEPT' }, repo, TOKEN_SECRET, new Date('2026-10-09T19:01:01Z'))
  const route = repo.routes.get(started.routeId)
  return scenarioResult('05-repeat-accept-idempotent', repo, {
    leadIds: [ingested.leadId], routeIds: [started.routeId], acceptedProviderId: route?.acceptedProviderId ?? null,
    passed: first.body.status === 'accepted' && second.body.status === 'accepted' && repo.events.filter((item) => item.type === 'offer.accepted').length === 1,
  })
}

async function scenario06() {
  const repo = new MemoryRouterRepo([provider('provider-a'), provider('provider-b')])
  const ingested = await repo.ingest({ phone: '3015550007', email: 'six@example.test', zip: '21740', issue: 'no water' })
  const started = await startMicrositeRouting(repo, ingested.leadId, NOW)
  const first = repo.offers.find((item) => item.id === started.offerId)
  const second = await repo.createOffer({
    routeId: started.routeId,
    leadId: ingested.leadId,
    providerId: 'provider-b',
    rank: 2,
    score: 50,
    scoreReasons: { base: 50, priorityBias: 0, acceptanceRate: 0, responseSpeed: 0, completionRate: 0 },
    expiresAt: first.expiresAt,
    idempotencyKey: `parallel:${started.routeId}:provider-b`,
  })
  const [a, b] = await Promise.all([
    signedResponse(repo, first, 'ACCEPT', new Date('2026-10-09T19:01:00Z')),
    signedResponse(repo, second, 'ACCEPT', new Date('2026-10-09T19:01:00Z')),
  ])
  const statuses = [a.body.status, b.body.status].sort()
  const route = repo.routes.get(started.routeId)
  return scenarioResult('06-competing-accepts-one-winner', repo, {
    leadIds: [ingested.leadId], routeIds: [started.routeId], acceptedProviderId: route?.acceptedProviderId ?? null,
    passed: statuses.join(',') === 'accepted,already_assigned' && repo.events.filter((item) => item.type === 'offer.accepted').length === 1,
    notes: statuses.join(',') === 'accepted,already_assigned' ? ['one_accept_one_already_assigned'] : [],
  })
}

async function scenario07() {
  const repo = new MemoryRouterRepo([provider('provider-a'), provider('provider-b')])
  const ingested = await repo.ingest({ phone: '3015550008', email: 'seven@example.test', zip: '21740', issue: 'no water' })
  const started = await startMicrositeRouting(repo, ingested.leadId, NOW)
  await repo.resolveOffer(started.offerId, 'DELIVERY_FAILED', `delivery-failed:${started.offerId}`)
  const advanced = await tickMicrositeRouting(repo, started.routeId, new Date('2026-10-09T19:00:01Z'))
  return scenarioResult('07-delivery-failure-advances', repo, {
    leadIds: [ingested.leadId], routeIds: [started.routeId],
    passed: advanced.status === 'OFFERED' && advanced.providerId === 'provider-b',
    notes: advanced.providerId === 'provider-b' ? ['provider-b-offered-after-failure'] : [],
  })
}

async function scenario08() {
  const repo = new MemoryRouterRepo([
    provider('provider-a', { status: 'PAUSED' }),
    provider('provider-b', { serviceAreaKeys: ['other-area'] }),
  ])
  const ingested = await repo.ingest({ phone: '3015550009', email: 'eight@example.test', zip: '21740', issue: 'no water' })
  const started = await startMicrositeRouting(repo, ingested.leadId, NOW)
  const notice = await repo.simulateNotice('NO_PROVIDER_SECURED', ingested.leadId)
  const honest = !/accepted|matched with|provider a|provider b/i.test(notice.rendered.body)
  return scenarioResult('08-all-unavailable-honest-unroutable', repo, {
    leadIds: [ingested.leadId], routeIds: [], acceptedProviderId: null,
    passed: started.status === 'UNROUTABLE' && honest && repo.externalDeliveries === 0,
    notes: honest ? ['no-provider-match-claimed'] : [],
  })
}

async function scenario09() {
  const repo = new MemoryRouterRepo([
    provider('provider-disabled', { displayName: 'Disabled', status: 'DISABLED' }),
    provider('provider-outside', { displayName: 'Outside', serviceAreaKeys: ['other-area'] }),
    provider('provider-good', { displayName: 'Good Provider' }),
  ])
  const ingested = await repo.ingest({ phone: '3015550010', email: 'nine@example.test', zip: '21740', issue: 'no water' })
  const started = await startMicrositeRouting(repo, ingested.leadId, NOW)
  const offered = repo.offers.map((item) => item.providerId)
  const disabledExcluded = !offered.includes('provider-disabled')
  const outsideExcluded = !offered.includes('provider-outside')
  return scenarioResult('09-ineligible-providers-never-offered', repo, {
    leadIds: [ingested.leadId], routeIds: [started.routeId],
    passed: started.providerId === 'provider-good' && disabledExcluded && outsideExcluded,
    notes: [disabledExcluded ? 'disabled-not-offered' : '', outsideExcluded ? 'out-of-area-not-offered' : ''].filter(Boolean),
  })
}

async function scenario10() {
  const repo = new MemoryRouterRepo([provider('provider-a')])
  const ingested = await repo.ingest({ phone: '3015550011', email: 'ten@example.test', zip: '21740', issue: 'no water' })
  const started = await startMicrositeRouting(repo, ingested.leadId, NOW)
  await repo.simulateNotice('REQUEST_RECEIVED', ingested.leadId)
  const simulatedOffers = repo.offers.every((item) => item.delivery?.status === 'SIMULATED')
  return scenarioResult('10-zero-external-deliveries', repo, {
    leadIds: [ingested.leadId], routeIds: [started.routeId],
    passed: started.status === 'OFFERED' && simulatedOffers && repo.externalDeliveries === 0,
    notes: simulatedOffers ? ['all-deliveries-simulated'] : [],
  })
}

export async function runPracticeSuite() {
  const scenarios = []
  for (const run of [scenario01, scenario02, scenario03, scenario04, scenario05, scenario06, scenario07, scenario08, scenario09, scenario10]) {
    try {
      scenarios.push(await run())
    } catch (error) {
      scenarios.push({
        id: run.name,
        passed: false,
        leadIds: [],
        routeIds: [],
        acceptedProviderId: null,
        externalDeliveries: 0,
        events: [],
        notes: [error instanceof Error ? error.message : 'unknown_error'],
      })
    }
  }
  const externalDeliveries = scenarios.reduce((sum, item) => sum + item.externalDeliveries, 0)
  return {
    passed: scenarios.length === 10 && scenarios.every((item) => item.passed) && externalDeliveries === 0,
    externalDeliveries,
    scenarios,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runPracticeSuite()
  console.log(JSON.stringify(report, null, 2))
  if (!report.passed) process.exitCode = 1
}
