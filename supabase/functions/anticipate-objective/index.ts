import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

type SearchResult = {
  title?: unknown
  url?: unknown
  content?: unknown
  score?: unknown
  published_date?: unknown
}

function runtimeKeys() {
  const publishableKeys = JSON.parse(
    Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}',
  ) as Record<string, string>
  const secretKeys = JSON.parse(
    Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}',
  ) as Record<string, string>

  return {
    url: Deno.env.get('SUPABASE_URL')?.trim() || '',
    publishableKey:
      publishableKeys.default
      || Deno.env.get('SUPABASE_ANON_KEY')
      || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
      || '',
    secretKey:
      secretKeys.default
      || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      || Deno.env.get('SUPABASE_SECRET_KEY')
      || '',
  }
}

function providerState() {
  const tavilyKey = Deno.env.get('TAVILY_API_KEY')?.trim() || ''
  return {
    provider: 'tavily' as const,
    configured: Boolean(tavilyKey),
    key: tavilyKey,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Authentication required' }, 401)
  }

  const { url, publishableKey, secretKey } = runtimeKeys()
  if (!url || !publishableKey || !secretKey) {
    return json({
      ok: false,
      error: 'Supabase runtime credentials are incomplete.',
      diagnostic: 'supabase_runtime_credentials_missing',
    }, 503)
  }

  const userClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })
  const jwt = authHeader.slice('Bearer '.length).trim()
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt)
  if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: preference, error: preferenceError } = await admin
    .from('perception_runtime_preferences')
    .select(
      'external_anticipatory_search_enabled, external_search_consent_version, external_search_consented_at',
    )
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (preferenceError) {
    console.error('Perception external pre-search preference lookup failed', {
      code: preferenceError.code,
      message: preferenceError.message,
    })
    return json({ ok: false, error: 'Preference lookup failed.' }, 500)
  }

  const enabled = preference?.external_anticipatory_search_enabled === true
  const consentVersion = Number(preference?.external_search_consent_version ?? 1)
  const provider = providerState()
  const ready = enabled && provider.configured

  let body: Record<string, unknown> = {}
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    body = {}
  }

  const action = typeof body.action === 'string' ? body.action : 'status'

  if (action === 'status') {
    return json({
      ok: true,
      source: 'external_presearch_control_v0_11',
      enabled,
      consent_version: consentVersion,
      consented_at: preference?.external_search_consented_at ?? null,
      provider: provider.provider,
      provider_configured: provider.configured,
      ready,
      external_attempted: false,
      stores_draft_text: false,
    })
  }

  if (action !== 'preview') return json({ error: 'Unsupported action' }, 400)

  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 500) : ''
  const mode = typeof body.mode === 'string' ? body.mode : 'perceive'
  const stableDwellMs = Number(body.stable_dwell_ms ?? 0)

  if (!enabled) {
    return json({
      ok: true,
      source: 'external_presearch_control_v0_11',
      ready: false,
      external_attempted: false,
      reason: 'disabled_by_user',
      stores_draft_text: false,
    })
  }

  if (!provider.configured) {
    return json({
      ok: true,
      source: 'external_presearch_control_v0_11',
      ready: false,
      external_attempted: false,
      reason: 'provider_not_configured',
      provider: provider.provider,
      stores_draft_text: false,
    })
  }

  if (query.length < 24 || stableDwellMs < 900) {
    return json({
      ok: true,
      source: 'external_presearch_control_v0_11',
      ready: true,
      external_attempted: false,
      reason: 'intent_not_stable',
      stores_draft_text: false,
    })
  }

  if (!['discover', 'perceive', 'search'].includes(mode)) {
    return json({
      ok: true,
      source: 'external_presearch_control_v0_11',
      ready: true,
      external_attempted: false,
      reason: 'mode_not_eligible',
      stores_draft_text: false,
    })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6_000)

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        search_depth: 'basic',
        max_results: 5,
        topic: 'general',
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_usage: false,
        safe_search: true,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.error('Perception external pre-search provider failed', {
        provider: provider.provider,
        status: response.status,
      })
      return json({
        ok: true,
        source: 'external_presearch_control_v0_11',
        ready: true,
        external_attempted: true,
        provider: provider.provider,
        reason: 'provider_error',
        provider_status: response.status,
        results: [],
        stores_draft_text: false,
      }, 200)
    }

    const payload = await response.json() as {
      results?: SearchResult[]
      response_time?: unknown
    }

    const results = (payload.results ?? []).slice(0, 5).map((result) => ({
      title: typeof result.title === 'string' ? result.title.slice(0, 300) : '',
      url: typeof result.url === 'string' ? result.url.slice(0, 2_000) : '',
      snippet: typeof result.content === 'string' ? result.content.slice(0, 1_000) : '',
      score: typeof result.score === 'number' ? result.score : Number(result.score ?? 0),
      published_at:
        typeof result.published_date === 'string'
          ? result.published_date.slice(0, 100)
          : null,
    }))

    return json({
      ok: true,
      source: 'external_presearch_control_v0_11',
      ready: true,
      external_attempted: true,
      provider: provider.provider,
      result_count: results.length,
      results,
      ephemeral: true,
      prepared_at: new Date().toISOString(),
      valid_for_ms: 120_000,
      must_revalidate: true,
      stores_draft_text: false,
    })
  } catch (cause) {
    const aborted = cause instanceof DOMException && cause.name === 'AbortError'
    if (!aborted) {
      console.error('Perception external pre-search request failed', {
        provider: provider.provider,
        message: cause instanceof Error ? cause.message : 'unknown error',
      })
    }
    return json({
      ok: true,
      source: 'external_presearch_control_v0_11',
      ready: true,
      external_attempted: true,
      provider: provider.provider,
      reason: aborted ? 'provider_timeout' : 'provider_unavailable',
      results: [],
      stores_draft_text: false,
    })
  } finally {
    clearTimeout(timeout)
  }
})
