import { describe, expect, it, vi } from 'vitest'
import {
  startMicrositeRouting,
  tickMicrositeRouting,
  type MicrositeRouterRepository,
  type RouterLead,
  type RouterOffer,
  type RouterProvider,
  type RouterRoute,
  type RoutingConfig,
} from '../../supabase/functions/_shared/microsite-router'

const NOW = new Date('2026-10-09T19:00:00Z')

function provider(overrides: Partial<RouterProvider> = {}): RouterProvider {
  return {
    id: 'provider-a',
    displayName: 'Provider A',
    status: 'ACTIVE',
    acceptingNewWork: true,
    serviceKeys: ['NO_WATER'],
    serviceAreaKeys: ['washington-county-md'],
    emergencyCapable: true,
    priorityBias: 0,
    ...overrides,
  }
}

function config(overrides: Partial<RoutingConfig> = {}): RoutingConfig {
  return {
    micrositeId: 'site-1',
    mode: 'PRACTICE',
    outboundEnabled: false,
    serviceAreaRules: [{ key: 'washington-county-md', zips: ['21740', '21742'] }],
    emergencyTimeoutSeconds: 300,
    routineTimeoutSeconds: 1800,
    ...overrides,
  }
}

function lead(overrides: Partial<RouterLead> = {}): RouterLead {
  return {
    id: 'lead-1',
    userId: 'user-1',
    micrositeId: 'site-1',
    state: 'NEW',
    metadata: { zip: '21740', issue: 'no water' },
    ...overrides,
  }
}

function route(overrides: Partial<RouterRoute> = {}): RouterRoute {
  return {
    id: 'route-1',
    leadId: 'lead-1',
    status: 'ACTIVE',
    practice: true,
    serviceKey: 'NO_WATER',
    serviceAreaKey: 'washington-county-md',
    urgency: 'EMERGENCY',
    ...overrides,
  }
}

function offer(overrides: Partial<RouterOffer> = {}): RouterOffer {
  return {
    id: 'offer-1',
    routeId: 'route-1',
    leadId: 'lead-1',
    providerId: 'provider-a',
    rank: 1,
    status: 'PENDING',
    score: 50,
    scoreReasons: {},
    expiresAt: '2026-10-09T18:59:00Z',
    ...overrides,
  }
}

function makeRepo(overrides: Partial<MicrositeRouterRepository> = {}) {
  const providers = [provider()]
  const offers: RouterOffer[] = []
  const routes = new Map<string, RouterRoute>()
  const base: MicrositeRouterRepository = {
    getLead: vi.fn(async () => lead()),
    getRoutingConfig: vi.fn(async () => config()),
    listProviders: vi.fn(async () => providers),
    getProvider: vi.fn(async (id) => providers.find((item) => item.id === id) ?? null),
    getProviderPerformance: vi.fn(async () => ({})),
    transitionLead: vi.fn(async () => undefined),
    startRoute: vi.fn(async (input) => {
      const value = route({
        id: 'route-1',
        leadId: input.leadId,
        practice: input.practice,
        serviceKey: input.serviceKey,
        serviceAreaKey: input.serviceAreaKey,
        urgency: input.urgency,
      })
      routes.set(value.id, value)
      return value
    }),
    getRoute: vi.fn(async (id) => routes.get(id) ?? route({ id })),
    listOffers: vi.fn(async () => [...offers]),
    createOffer: vi.fn(async (input) => {
      const value = offer({
        id: `offer-${offers.length + 1}`,
        routeId: input.routeId,
        leadId: input.leadId,
        providerId: input.providerId,
        rank: input.rank,
        score: input.score,
        scoreReasons: input.scoreReasons,
        expiresAt: input.expiresAt,
      })
      offers.push(value)
      return value
    }),
    recordOfferDelivery: vi.fn(async () => undefined),
    resolveOffer: vi.fn(async (offerId, outcome) => {
      const current = offers.find((item) => item.id === offerId)
      if (current) current.status = outcome
      return { status: outcome.toLowerCase() }
    }),
    exhaustRoute: vi.fn(async () => ({ status: 'exhausted' })),
    ...overrides,
  }
  return { repo: base, providers, offers, routes }
}

describe('microsite route orchestration', () => {
  it('starts an emergency practice route, classifies, ranks and creates a 300-second offer', async () => {
    const { repo, offers } = makeRepo()
    const result = await startMicrositeRouting(repo, 'lead-1', NOW)

    expect(result.status).toBe('OFFERED')
    expect(repo.transitionLead).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'lead-1', nextState: 'QUALIFIED', eventType: 'lead.qualified',
    }))
    expect(repo.startRoute).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 'lead-1', serviceKey: 'NO_WATER', serviceAreaKey: 'washington-county-md',
      urgency: 'EMERGENCY', practice: true,
    }))
    expect(offers).toHaveLength(1)
    expect(offers[0].expiresAt).toBe('2026-10-09T19:05:00.000Z')
    expect(repo.recordOfferDelivery).toHaveBeenCalledWith(offers[0].id, expect.objectContaining({ status: 'SIMULATED' }))
  })

  it('refuses duplicate/manual-review leads before route creation', async () => {
    const { repo } = makeRepo({ getLead: vi.fn(async () => lead({ state: 'MANUAL_REVIEW' })) })
    const result = await startMicrositeRouting(repo, 'lead-1', NOW)

    expect(result.status).toBe('REVIEW_REQUIRED')
    expect(repo.startRoute).not.toHaveBeenCalled()
  })

  it('moves out-of-area leads to UNQUALIFIED without creating a route', async () => {
    const { repo } = makeRepo({ getLead: vi.fn(async () => lead({ metadata: { zip: '20817', issue: 'no water' } })) })
    const result = await startMicrositeRouting(repo, 'lead-1', NOW)

    expect(result.status).toBe('UNQUALIFIED')
    expect(repo.transitionLead).toHaveBeenCalledWith(expect.objectContaining({ nextState: 'UNQUALIFIED' }))
    expect(repo.startRoute).not.toHaveBeenCalled()
  })

  it('fails ambiguous classification into MANUAL_REVIEW', async () => {
    const { repo } = makeRepo({
      getLead: vi.fn(async () => lead({ metadata: { zip: '21740', issue: 'low pressure and water treatment problem' } })),
    })
    const result = await startMicrositeRouting(repo, 'lead-1', NOW)

    expect(result.status).toBe('REVIEW_REQUIRED')
    expect(repo.transitionLead).toHaveBeenCalledWith(expect.objectContaining({ nextState: 'MANUAL_REVIEW' }))
    expect(repo.startRoute).not.toHaveBeenCalled()
  })

  it('re-checks provider eligibility immediately before creating an offer', async () => {
    const { repo } = makeRepo({
      getProvider: vi.fn(async () => provider({ status: 'PAUSED' })),
    })
    const result = await startMicrositeRouting(repo, 'lead-1', NOW)

    expect(result.status).toBe('EXHAUSTED')
    expect(repo.createOffer).not.toHaveBeenCalled()
    expect(repo.exhaustRoute).toHaveBeenCalledTimes(1)
  })

  it('uses the routine 1800-second timeout for low pressure', async () => {
    const routineProvider = provider({ serviceKeys: ['LOW_PRESSURE'], emergencyCapable: false })
    const { repo, offers } = makeRepo({
      getLead: vi.fn(async () => lead({ metadata: { zip: '21740', issue: 'low pressure throughout house' } })),
      listProviders: vi.fn(async () => [routineProvider]),
      getProvider: vi.fn(async () => routineProvider),
    })
    const result = await startMicrositeRouting(repo, 'lead-1', NOW)

    expect(result.status).toBe('OFFERED')
    expect(offers[0].expiresAt).toBe('2026-10-09T19:30:00.000Z')
  })

  it('does not create a route when no provider is initially eligible', async () => {
    const { repo } = makeRepo({ listProviders: vi.fn(async () => [provider({ status: 'DISABLED' })]) })
    const result = await startMicrositeRouting(repo, 'lead-1', NOW)

    expect(result.status).toBe('UNROUTABLE')
    expect(repo.transitionLead).toHaveBeenCalledWith(expect.objectContaining({ nextState: 'UNROUTABLE' }))
    expect(repo.startRoute).not.toHaveBeenCalled()
  })

  it('expires the current offer once and advances to the next provider', async () => {
    const p1 = provider({ id: 'provider-a', displayName: 'A' })
    const p2 = provider({ id: 'provider-b', displayName: 'B' })
    const existing = offer({ providerId: p1.id, expiresAt: '2026-10-09T18:59:59Z' })
    const { repo, offers } = makeRepo({
      getRoute: vi.fn(async () => route()),
      listProviders: vi.fn(async () => [p1, p2]),
      getProvider: vi.fn(async (id) => id === p1.id ? p1 : p2),
      listOffers: vi.fn(async () => [existing, ...offers]),
    })

    const result = await tickMicrositeRouting(repo, 'route-1', NOW)

    expect(repo.resolveOffer).toHaveBeenCalledWith('offer-1', 'EXPIRED', expect.any(String))
    expect(result.status).toBe('OFFERED')
    expect(repo.createOffer).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'provider-b' }))
  })

  it.each(['PASSED', 'DELIVERY_FAILED'] as const)('advances immediately after %s', async (status) => {
    const p1 = provider({ id: 'provider-a', displayName: 'A' })
    const p2 = provider({ id: 'provider-b', displayName: 'B' })
    const current = offer({ providerId: p1.id, status, expiresAt: '2026-10-09T19:05:00Z' })
    const { repo } = makeRepo({
      getRoute: vi.fn(async () => route()),
      listProviders: vi.fn(async () => [p1, p2]),
      getProvider: vi.fn(async (id) => id === p1.id ? p1 : p2),
      listOffers: vi.fn(async () => [current]),
    })

    const result = await tickMicrositeRouting(repo, 'route-1', NOW)

    expect(result.status).toBe('OFFERED')
    expect(repo.createOffer).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'provider-b' }))
  })

  it('exhausts when the provider queue has no unoffered eligible providers', async () => {
    const p1 = provider({ id: 'provider-a' })
    const current = offer({ providerId: p1.id, status: 'PASSED' })
    const { repo } = makeRepo({
      getRoute: vi.fn(async () => route()),
      listProviders: vi.fn(async () => [p1]),
      getProvider: vi.fn(async () => p1),
      listOffers: vi.fn(async () => [current]),
    })

    const result = await tickMicrositeRouting(repo, 'route-1', NOW)

    expect(result.status).toBe('EXHAUSTED')
    expect(repo.exhaustRoute).toHaveBeenCalledWith('route-1', expect.any(String))
  })

  it.each(['ACCEPTED', 'CANCELLED', 'EXHAUSTED'] as const)('is a no-op for %s routes', async (status) => {
    const { repo } = makeRepo({ getRoute: vi.fn(async () => route({ status })) })
    const result = await tickMicrositeRouting(repo, 'route-1', NOW)

    expect(result.status).toBe('NOOP')
    expect(repo.createOffer).not.toHaveBeenCalled()
    expect(repo.resolveOffer).not.toHaveBeenCalled()
  })

  it('blocks route starts outside PRACTICE until a verified live adapter exists', async () => {
    const { repo } = makeRepo({ getRoutingConfig: vi.fn(async () => config({ mode: 'LIVE', outboundEnabled: true })) })
    const result = await startMicrositeRouting(repo, 'lead-1', NOW)

    expect(result.status).toBe('LIVE_BLOCKED')
    expect(repo.startRoute).not.toHaveBeenCalled()
  })
})
