import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dispatchHomeownerNotice,
  dispatchProviderOffer,
} from '../../supabase/functions/_shared/microsite-delivery'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('microsite delivery boundary', () => {
  it('simulates provider offers in PRACTICE with zero network calls', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await dispatchProviderOffer({
      offerId: 'offer-1',
      leadId: 'lead-1',
      providerId: 'provider-1',
      serviceKey: 'NO_WATER',
      serviceAreaKey: 'washington-county-md',
      urgency: 'EMERGENCY',
      expiresAt: '2026-10-09T20:00:00Z',
    }, 'PRACTICE')

    expect(result.status).toBe('SIMULATED')
    expect(result.simulated).toBe(true)
    expect(result.metadata).toEqual(expect.objectContaining({
      offerId: 'offer-1',
      providerId: 'provider-1',
      serviceKey: 'NO_WATER',
    }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each(['LIVE_DISABLED', 'LIVE'] as const)('blocks provider delivery in %s', async (mode) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await dispatchProviderOffer({
      offerId: 'offer-1', leadId: 'lead-1', providerId: 'provider-1',
      serviceKey: 'NO_WATER', serviceAreaKey: 'washington-county-md', urgency: 'EMERGENCY',
      expiresAt: '2026-10-09T20:00:00Z',
    }, mode)

    expect(result.status).toBe('BLOCKED')
    expect(result.simulated).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each(['PRACTICE', 'LIVE_DISABLED'] as const)('simulates homeowner notices in %s without a network call', async (mode) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await dispatchHomeownerNotice({
      leadId: 'lead-1',
      type: 'REQUEST_RECEIVED',
      rendered: { subject: 'Request received', body: 'We received your request.' },
    }, mode)

    expect(result.status).toBe('SIMULATED')
    expect(result.simulated).toBe(true)
    expect(result.metadata).toEqual(expect.objectContaining({ type: 'REQUEST_RECEIVED' }))
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('blocks homeowner notice delivery in LIVE until an adapter is installed', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await dispatchHomeownerNotice({
      leadId: 'lead-1',
      type: 'REQUEST_RECEIVED',
      rendered: { subject: 'Request received', body: 'We received your request.' },
    }, 'LIVE')

    expect(result.status).toBe('BLOCKED')
    expect(result.simulated).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
