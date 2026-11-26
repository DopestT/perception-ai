import { normalizeWebQuery, normalizeWebSearchPage, type WebSearchPage } from './web-search-contract'

/** Conventional public search does NOT read Supabase sessions or project data. */
export async function fetchGuestWebResults(
  query: string,
  signal?: AbortSignal,
): Promise<WebSearchPage> {
  const normalized = normalizeWebQuery(query)
  const path = `/api/search?q=${encodeURIComponent(normalized)}`
  let response: Response
  try {
    response = await fetch(path, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal,
      cache: 'no-store',
    })
  } catch {
    throw new Error('Web search is temporarily unavailable. Try again later.')
  }
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    if (response.status === 503) throw new Error('Web search is not yet activated.')
    if (response.status === 429) throw new Error('Search limit reached. Please try again later.')
    if (response.status === 400) throw new Error('Please enter a valid search query.')
    throw new Error('Web search could not retrieve results. Try again later.')
  }
  if (!payload || !Array.isArray(payload.results) || typeof payload.retrievedAt !== 'string') {
    throw new Error('Web search returned an invalid response.')
  }
  // Same output invariant for both server and browser; never display untrusted links.
  return normalizeWebSearchPage({
    query: normalized,
    retrievedAt: payload.retrievedAt,
    providerHits: payload.results,
  })
}
