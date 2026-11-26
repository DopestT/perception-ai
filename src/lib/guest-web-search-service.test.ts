import { describe, expect, it, vi } from 'vitest'
import { GuestSearchFailure, retrieveGuestWebSearch } from './guest-web-search-service'

const results = [
  { title: 'Original research paper', url: 'https://www.nature.com/articles/example', description: 'Published findings', page_age: '2026-11-23' },
  { title: 'Second source', url: 'https://example.org/explainer', description: 'A short description' },
]

const mockFetch = (result: Response) =>
  vi.fn(async () => result) as unknown as typeof fetch

const base = () => ({
  braveApiKey: 'TEST_ONLY_NON_SECRET',
  reserveQuota: vi.fn(async () => true),
  fetcher: mockFetch(Response.json({ web: { results } })),
  now: () => new Date('2026-11-26T18:59:00.000Z'),
})

describe('guest search service is budget-gated and provider-grounded', () => {
  it('reserves shared quota before sending any provider query', async () => {
    const deps = base()
    const page = await retrieveGuestWebSearch('oceans', deps)
    expect(deps.reserveQuota).toHaveBeenCalledWith('oceans')
    expect(deps.fetcher).toHaveBeenCalledOnce()
    expect(page.results.map((hit) => hit.title)).toEqual([
      'Original research paper', 'Second source',
    ])
    expect(page.results[0].publishedAt).toBe('2026-11-23T00:00:00.000Z')
    const [url, options] = vi.mocked(deps.fetcher).mock.calls[0]
    expect(new URL(url.toString()).searchParams.get('q')).toBe('oceans')
    expect((options?.headers as Record<string, string>)['X-Subscription-Token']).toBe('TEST_ONLY_NON_SECRET')
    expect(JSON.stringify(page)).not.toContain('TEST_ONLY_NON_SECRET')
  })

  it('fails closed when key or quota gate is unavailable', async () => {
    const missing = base()
    missing.braveApiKey = ''
    await expect(retrieveGuestWebSearch('query', missing)).rejects.toMatchObject({ code: 'not_ready', httpStatus: 503 })
    expect(missing.reserveQuota).not.toHaveBeenCalled()
    expect(missing.fetcher).not.toHaveBeenCalled()
    const denied = base()
    denied.reserveQuota = vi.fn(async () => false)
    await expect(retrieveGuestWebSearch('query', denied)).rejects.toMatchObject({ code: 'quota_exceeded', httpStatus: 429 })
    expect(denied.fetcher).not.toHaveBeenCalled()
    const broken = base()
    broken.reserveQuota = vi.fn(async () => { throw new Error('RPC unavailable') })
    await expect(retrieveGuestWebSearch('query', broken)).rejects.toMatchObject({ code: 'not_ready', httpStatus: 503 })
    expect(broken.fetcher).not.toHaveBeenCalled()
  })

  it('rejects malformed query before quota or provider calls', async () => {
    const deps = base()
    await expect(retrieveGuestWebSearch(' ', deps)).rejects.toMatchObject({ code: 'invalid_request', httpStatus: 400 })
    expect(deps.reserveQuota).not.toHaveBeenCalled()
    expect(deps.fetcher).not.toHaveBeenCalled()
  })

  it('does not treat provider outages as empty search results', async () => {
    const deps = base()
    deps.fetcher = mockFetch(new Response('failure', { status: 429 }))
    await expect(retrieveGuestWebSearch('query', deps)).rejects.toMatchObject({ code: 'upstream_unavailable', httpStatus: 502 })
    deps.fetcher = mockFetch(Response.json({ web: {} }))
    await expect(retrieveGuestWebSearch('query', deps)).rejects.toMatchObject({ code: 'upstream_unavailable', httpStatus: 502 })
  })

  it('returns honest empty results if the provider returns none', async () => {
    const deps = base()
    deps.fetcher = mockFetch(Response.json({ web: { results: [] } }))
    const page = await retrieveGuestWebSearch('unmatched', deps)
    expect(page.results).toEqual([])
    expect(page.status).toBe('empty')
  })

  it('converts provider network failures to a typed error', async () => {
    const deps = base()
    deps.fetcher = vi.fn(async () => { throw new Error('network') }) as unknown as typeof fetch
    await expect(retrieveGuestWebSearch('ocean', deps)).rejects.toBeInstanceOf(GuestSearchFailure)
  })
})
