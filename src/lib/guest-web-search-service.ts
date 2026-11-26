import { normalizeWebQuery, normalizeWebSearchPage, type WebSearchPage } from './web-search-contract'

export class GuestSearchFailure extends Error {
  constructor(
    public readonly code: 'not_ready' | 'quota_exceeded' | 'upstream_unavailable' | 'invalid_request',
    public readonly httpStatus: 400 | 429 | 502 | 503,
  ) {
    const messages = {
      not_ready: 'Web search is not available yet. Please try again later.',
      quota_exceeded: 'Search is temporarily at capacity. Please try again later.',
      upstream_unavailable: 'Web search is temporarily unavailable. Please retry.',
      invalid_request: 'Enter a shorter, valid search query.',
    }
    super(messages[code])
    this.name = 'GuestSearchFailure'
  }
}

/** This is not a budget limiter. Callers must enforce an atomic, shared quota. */
export type GuestSearchGate = (query: string) => Promise<boolean | null>
export type GuestSearchDependencies = Readonly<{
  braveApiKey: string | undefined
  reserveQuota: GuestSearchGate
  fetcher: typeof fetch
  now: () => Date
  timeoutMs?: number
}>

/**
 * Fetches public ranked links without requiring an account, Project World or AI.
 * Only call after hard, shared per-IP + global spending limits are in force.
 * The server (never the browser) owns API keys and the quota gate.
 */
export async function retrieveGuestWebSearch(
  rawQuery: unknown,
  deps: GuestSearchDependencies,
): Promise<WebSearchPage> {
  let query: string
  try { query = normalizeWebQuery(rawQuery) }
  catch { throw new GuestSearchFailure('invalid_request', 400) }

  if (!deps.braveApiKey) throw new GuestSearchFailure('not_ready', 503)
  let allowed: boolean | null = null
  try { allowed = await deps.reserveQuota(query) }
  catch { throw new GuestSearchFailure('not_ready', 503) }
  if (allowed === null) throw new GuestSearchFailure('not_ready', 503)
  if (!allowed) throw new GuestSearchFailure('quota_exceeded', 429)

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', '10')
  url.searchParams.set('safesearch', 'moderate')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.min(7000, Math.max(1000, deps.timeoutMs ?? 5000)))
  try {
    const response = await deps.fetcher(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Subscription-Token': deps.braveApiKey },
      signal: controller.signal,
    })
    if (!response.ok) throw new GuestSearchFailure('upstream_unavailable', 502)
    const payload = await response.json() as { web?: { results?: unknown } }
    const hits = payload?.web?.results
    if (!Array.isArray(hits)) throw new GuestSearchFailure('upstream_unavailable', 502)
    const providerHits = hits.map((entry) => {
      const hit = entry && typeof entry === 'object' && !Array.isArray(entry)
        ? entry as Record<string, unknown>
        : {}
      return {
        url: hit.url,
        title: hit.title,
        snippet: hit.description,
        // Brave's age text isn't a publication date. Use only ISO page_age.
        publishedAt: hit.page_age,
      }
    })
    return normalizeWebSearchPage({
      query,
      retrievedAt: deps.now().toISOString(),
      providerHits,
    })
  } catch (cause) {
    if (cause instanceof GuestSearchFailure) throw cause
    throw new GuestSearchFailure('upstream_unavailable', 502)
  } finally {
    clearTimeout(timeout)
  }
}
