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
      // Allow the host's own preview-auth cookie without reading application sessions.
      // The API remains account-free; no cookies are sent to a third-party origin.
      credentials: 'same-origin',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
      signal,
      cache: 'no-store',
    })
  } catch {
    throw new Error('Web search is temporarily unavailable. Try again later.')
  }
  if (response.type === 'opaqueredirect' || response.redirected || (response.status >= 300 && response.status < 400)) {
    throw new Error('Web search is unavailable at this address. Open the authorized preview or try the public site.')
  }
  if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    throw new Error('Web search could not reach its service. Try again later.')
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
