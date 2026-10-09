import { describe, expect, it, vi } from 'vitest'
import { signOfferToken } from '../../supabase/functions/_shared/microsite-offer-token'
import {
  handleMicrositeProviderResponse,
  type ProviderResponseRepository,
} from '../../supabase/functions/_shared/microsite-provider-response'

const SECRET = '0123456789abcdef0123456789abcdef'
const NOW = new Date('2026-10-09T19:00:00.000Z')

async function token(overrides: Partial<{ offerId: string; routeId: string; expiresAt: string }> = {}) {
  return await signOfferToken({
    offerId: 'offer-1',
    routeId: 'route-1',
    expiresAt: '2026-10-09T20:00:00.000Z',
    ...overrides,
  }, SECRET)
}

function makeRepo(overrides: Partial<ProviderResponseRepository> = {}): ProviderResponseRepository {
  return {
    getOffer: vi.fn(async () => ({
      id: 'offer-1',
      routeId: 'route-1',
      status: 'PENDING',
      expiresAt: '2026-10-09T19:30:00.000Z',
    })),
    resolvePass: vi.fn(async () => ({ status: 'passed' })),
    acceptOffer: vi.fn(async () => ({ status: 'accepted', provider_id: 'provider-a' })),
    ...overrides,
  }
}

describe('microsite provider response', () => {
  it('rejects a missing token without DB mutation', async () => {
    const repo = makeRepo()
    const result = await handleMicrositeProviderResponse({ token: '', response: 'ACCEPT' }, repo, SECRET, NOW)
    expect(result.statusCode).toBe(401)
    expect(repo.getOffer).not.toHaveBeenCalled()
    expect(repo.acceptOffer).not.toHaveBeenCalled()
  })

  it('rejects an invalid token without DB mutation', async () => {
    const repo = makeRepo()
    const result = await handleMicrositeProviderResponse({ token: 'bad.token', response: 'ACCEPT' }, repo, SECRET, NOW)
    expect(result.statusCode).toBe(403)
    expect(repo.getOffer).not.toHaveBeenCalled()
    expect(repo.acceptOffer).not.toHaveBeenCalled()
  })

  it('PASS resolves only the token-scoped offer', async () => {
    const repo = makeRepo()
    const result = await handleMicrositeProviderResponse({ token: await token(), response: 'PASS' }, repo, SECRET, NOW)
    expect(result).toEqual({ statusCode: 200, body: { ok: true, status: 'passed' } })
    expect(repo.resolvePass).toHaveBeenCalledWith('offer-1', expect.stringContaining('pass:offer-1'))
    expect(repo.acceptOffer).not.toHaveBeenCalled()
  })

  it('ACCEPT invokes the atomic one-winner RPC', async () => {
    const repo = makeRepo()
    const result = await handleMicrositeProviderResponse({ token: await token(), response: 'ACCEPT' }, repo, SECRET, NOW)
    expect(result.statusCode).toBe(200)
    expect(result.body.status).toBe('accepted')
    expect(repo.acceptOffer).toHaveBeenCalledWith('offer-1', expect.stringContaining('accept:offer-1'))
  })

  it('repeated ACCEPT returns the prior accepted result', async () => {
    const repo = makeRepo()
    const signed = await token()
    const first = await handleMicrositeProviderResponse({ token: signed, response: 'ACCEPT' }, repo, SECRET, NOW)
    const second = await handleMicrositeProviderResponse({ token: signed, response: 'ACCEPT' }, repo, SECRET, NOW)
    expect(first.body.status).toBe('accepted')
    expect(second.body.status).toBe('accepted')
    expect(repo.acceptOffer).toHaveBeenCalledTimes(2)
  })

  it('returns expired for a late offer even when the response token is still valid', async () => {
    const repo = makeRepo({
      getOffer: vi.fn(async () => ({
        id: 'offer-1', routeId: 'route-1', status: 'PENDING', expiresAt: '2026-10-09T18:59:59.000Z',
      })),
    })
    const result = await handleMicrositeProviderResponse({ token: await token(), response: 'ACCEPT' }, repo, SECRET, NOW)
    expect(result).toEqual({ statusCode: 200, body: { ok: true, status: 'expired' } })
    expect(repo.acceptOffer).not.toHaveBeenCalled()
  })

  it('rejects a valid token whose route does not match the stored offer', async () => {
    const repo = makeRepo()
    const result = await handleMicrositeProviderResponse({
      token: await token({ routeId: 'route-other' }), response: 'ACCEPT',
    }, repo, SECRET, NOW)
    expect(result.statusCode).toBe(403)
    expect(repo.acceptOffer).not.toHaveBeenCalled()
  })

  it('returns already_assigned when another provider already won', async () => {
    const repo = makeRepo({ acceptOffer: vi.fn(async () => ({ status: 'already_assigned', provider_id: 'provider-b' })) })
    const result = await handleMicrositeProviderResponse({ token: await token(), response: 'ACCEPT' }, repo, SECRET, NOW)
    expect(result).toEqual({ statusCode: 200, body: { ok: true, status: 'already_assigned' } })
  })

  it('rejects unsupported responses before mutation', async () => {
    const repo = makeRepo()
    const result = await handleMicrositeProviderResponse({ token: await token(), response: 'MAYBE' }, repo, SECRET, NOW)
    expect(result.statusCode).toBe(400)
    expect(repo.getOffer).not.toHaveBeenCalled()
  })
})
