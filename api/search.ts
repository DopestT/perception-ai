import { GuestSearchFailure, retrieveGuestWebSearch } from '../src/lib/guest-web-search-service.js'

// Vercel Node Function; no secrets or server keys are ever included in Vite output.
declare const process: { env: Record<string, string | undefined> }
const json = (data: unknown, status: number) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  })

/**
 * Reserve a query slot atomically in a *shared server-side Postgres quota*.
 * Missing SQL function, security configuration, IP, salt or service key
 * always denies the request BEFORE a paid provider call is possible.
 * Required quota SQL is a separate, approval-gated migration.
 */
async function reserveServerQuota(request: Request): Promise<boolean | null> {
  const base = process.env.PERCEPTION_SEARCH_SUPABASE_URL
  const key = process.env.PERCEPTION_SEARCH_SERVICE_KEY
  const salt = process.env.PERCEPTION_SEARCH_IP_HASH_SECRET
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (!base || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base) ||
      !key || !salt || salt.length < 32 || !forwardedFor || forwardedFor.length > 64 ||
      !/^[a-f0-9:.]+$/i.test(forwardedFor)) return null

  // HMAC makes visitor buckets unlinkable without this independent server secret.
  const encoder = new TextEncoder()
  const hmac = await crypto.subtle.importKey(
    'raw', encoder.encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', hmac, encoder.encode(`${new Date().toISOString().slice(0, 10)}:${forwardedFor}`))
  const hash = Array.from(new Uint8Array(signature)).map((x) => x.toString(16).padStart(2, '0')).join('')

  const response = await fetch(`${base}/rest/v1/rpc/perception_reserve_guest_search_quota`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_ip_hash: hash }),
    signal: AbortSignal.timeout(3000),
    cache: 'no-store',
  })
  // Fail closed on RPC absent, denied, non-2xx, error or malformed return.
  if (!response.ok) return null
  const value = await response.json()
  return typeof value === 'boolean' ? value : null
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return json({ error: 'invalid_request', message: 'Cross-site searches are not supported.' }, 403)
  }
  if (url.searchParams.getAll('q').length !== 1 ||
      [...url.searchParams.keys()].some((key) => key !== 'q')) {
    return json({ error: 'invalid_request', message: 'Enter one search query.' }, 400)
  }
  // Guest link lookup is a different feature from Project World / AI routing.
  // No session, JWT, browser credential, external context or model call here.
  if (process.env.PERCEPTION_SEARCH_PUBLIC_ENABLED !== 'true' ||
      process.env.PERCEPTION_SEARCH_BRAVE_USAGE_RIGHTS_CONFIRMED !== 'true') {
    // Provider terms must explicitly permit the intended public-search use.
    // This is a separate gate from authorization to spend included API credits.
    return json({ error: 'not_ready', message: 'Web search is not available yet.' }, 503)
  }

  try {
    const result = await retrieveGuestWebSearch(url.searchParams.get('q'), {
      braveApiKey: process.env.PERCEPTION_SEARCH_BRAVE_API_KEY,
      reserveQuota: async () => reserveServerQuota(request),
      fetcher: fetch,
      now: () => new Date(),
      timeoutMs: 5000,
    })
    return json(result, 200)
  } catch (error) {
    if (error instanceof GuestSearchFailure) {
      return json({ error: error.code, message: error.message }, error.httpStatus)
    }
    return json({ error: 'upstream_unavailable', message: 'Web search could not be completed.' }, 502)
  }
}
