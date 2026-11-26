/**
 * Guest-first web SEARCH response contract.
 *
 * Pure and provider-neutral: no network calls, credentials, model inference,
 * database writes, account/session checks, or pretend search results.
 * Only a reviewed, rate-limited server adapter may fetch public web results.
 */
export const MAX_WEB_QUERY_LENGTH = 256
export const MAX_WEB_RESULTS = 10

export type WebSearchLink = Readonly<{
  rank: number
  title: string
  url: string
  source: string
  snippet: string
  publishedAt: string | null
}>

export type WebSearchPage = Readonly<{
  query: string
  retrievedAt: string
  results: readonly WebSearchLink[]
  status: 'results' | 'empty'
}>

function safeText(value: unknown, limit: number): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
    : ''
}

export function normalizeWebQuery(value: unknown): string {
  const query = safeText(value, MAX_WEB_QUERY_LENGTH + 1)
  if (!query) throw new Error('Enter a search query.')
  if (query.length > MAX_WEB_QUERY_LENGTH) throw new Error('Search query is too long.')
  return query
}

/** Reject non-web, local, direct-IP and credential-bearing URLs from untrusted providers. */
export function safePublicResultUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (
      url.protocol !== 'https:' ||
      url.username || url.password ||
      !hostname.includes('.') ||
      hostname.startsWith('[') ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) ||
      /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(hostname) ||
      url.port
    ) return null
    url.hash = ''
    // Remove marketing noise without destroying legitimate search parameters.
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key)
    }
    return url.toString()
  } catch {
    return null
  }
}

function optionalPublishedDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
}

/**
 * Normalize untrusted provider results for a conventional, clickable search
 * results page. Never generate an answer, an unreturned source, a guessed
 * publication date or fake latency metrics. Provider order is retained.
 */
export function normalizeWebSearchPage(
  input: Readonly<{
    query: unknown
    retrievedAt: string
    providerHits: readonly unknown[]
    limit?: number
  }>,
): WebSearchPage {
  const query = normalizeWebQuery(input.query)
  if (!Number.isFinite(Date.parse(input.retrievedAt))) {
    throw new Error('A valid retrieval timestamp is required.')
  }
  const retrievedAt = new Date(input.retrievedAt).toISOString()
  const limit = Number.isInteger(input.limit)
    ? Math.max(1, Math.min(MAX_WEB_RESULTS, input.limit!))
    : MAX_WEB_RESULTS
  const unique = new Set<string>()
  const results: WebSearchLink[] = []
  for (const raw of input.providerHits) {
    if (results.length >= limit) break
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const hit = raw as Record<string, unknown>
    const url = safePublicResultUrl(hit.url)
    const title = safeText(hit.title, 240)
    if (!url || !title || unique.has(url)) continue
    unique.add(url)
    results.push({
      rank: results.length + 1,
      title,
      url,
      source: new URL(url).hostname,
      snippet: safeText(hit.snippet ?? hit.description ?? hit.content, 500),
      publishedAt: optionalPublishedDate(hit.publishedAt ?? hit.published_at ?? hit.published_date),
    })
  }
  return { query, retrievedAt, results, status: results.length ? 'results' : 'empty' }
}
