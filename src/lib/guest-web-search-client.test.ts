import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchGuestWebResults } from './guest-web-search-client'

afterEach(() => vi.unstubAllGlobals())

const query = 'NASA Artemis'
function mockResponse(response: Response) {
  const fetcher = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}
describe('guest SEARCH client transport', () => {
  it('uses a same-origin request without application authorization or redirect following', async () => {
    const fetcher = mockResponse(Response.json({ retrievedAt: '2026-11-26T19:00:00Z', results: [{ url: 'https://www.nasa.gov/', title: 'NASA', snippet: 'Test fixture only' }] }))
    const result = await fetchGuestWebResults(query)
    expect(result.results[0]?.url).toBe('https://www.nasa.gov/')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/api/search?q=NASA%20Artemis', expect.objectContaining({
      credentials: 'same-origin', redirect: 'manual', headers: { Accept: 'application/json' },
    }))
  })
  it('distinguishes a browser-hidden authentication redirect', async () => {
    mockResponse({ type: 'opaqueredirect', status: 0 } as Response)
    await expect(fetchGuestWebResults(query)).rejects.toThrow('unavailable at this address')
  })
  it('does not follow an explicit redirect', async () => {
    mockResponse(new Response('login', { status: 302 }))
    await expect(fetchGuestWebResults(query)).rejects.toThrow('unavailable at this address')
  })
  it('does not misreport an HTML hosting error as provider activation', async () => {
    mockResponse(new Response('<html>Unavailable</html>', { status: 503, headers: { 'Content-Type': 'text/html' } }))
    await expect(fetchGuestWebResults(query)).rejects.toThrow('could not reach its service')
  })
  it('preserves the truthful disabled-provider message', async () => {
    mockResponse(Response.json({ error: 'not_ready' }, { status: 503 }))
    await expect(fetchGuestWebResults(query)).rejects.toThrow('not yet activated')
  })
  it('preserves quota exhaustion messaging', async () => {
    mockResponse(Response.json({ error: 'quota_exceeded' }, { status: 429 }))
    await expect(fetchGuestWebResults(query)).rejects.toThrow('limit reached')
  })
})
