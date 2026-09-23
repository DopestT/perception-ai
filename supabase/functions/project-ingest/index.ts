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

const sourceTypes = new Set([
  'github_repo',
  'vercel_project',
  'supabase_project',
  'railway_service',
  'notion_page',
  'drive_file',
  'gmail_thread',
  'website',
  'api',
  'manual',
  'other',
])

const syncModes = new Set(['manual', 'poll', 'webhook', 'push'])

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

type IngestPayload = {
  project_id?: unknown
  source?: {
    provider?: unknown
    source_type?: unknown
    external_id?: unknown
    label?: unknown
    locator?: unknown
    sync_mode?: unknown
    metadata?: unknown
  }
  observation?: {
    kind?: unknown
    external_version?: unknown
    summary?: unknown
    payload?: unknown
    source_ref?: unknown
    observed_at?: unknown
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

    const token = authHeader.slice('Bearer '.length).trim()
    if (!token) return json({ error: 'Authentication required' }, 401)

    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const url = Deno.env.get('SUPABASE_URL')
    const publishableKey = publishableKeys.default
    const secretKey = secretKeys.default

    if (!url || !publishableKey || !secretKey) {
      console.error('Perception ingestion environment is incomplete')
      return json({ error: 'Runtime unavailable' }, 503)
    }

    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)

    const body = await req.json().catch(() => null) as IngestPayload | null
    if (!body?.source || !body.observation) return json({ error: 'Source and observation are required' }, 400)

    const projectId = typeof body.project_id === 'string' && body.project_id.trim() ? body.project_id.trim() : null
    const provider = typeof body.source.provider === 'string' ? body.source.provider.trim() : ''
    const sourceType = typeof body.source.source_type === 'string' ? body.source.source_type.trim() : ''
    const externalId = typeof body.source.external_id === 'string' ? body.source.external_id.trim() : ''
    const label = typeof body.source.label === 'string' ? body.source.label.trim() : ''
    const locator = typeof body.source.locator === 'string' && body.source.locator.trim() ? body.source.locator.trim() : null
    const syncMode = typeof body.source.sync_mode === 'string' ? body.source.sync_mode.trim() : 'manual'
    const metadata = body.source.metadata && typeof body.source.metadata === 'object' && !Array.isArray(body.source.metadata)
      ? body.source.metadata as Record<string, unknown>
      : {}

    const observationKind = typeof body.observation.kind === 'string' ? body.observation.kind.trim() : ''
    const externalVersion = typeof body.observation.external_version === 'string' && body.observation.external_version.trim()
      ? body.observation.external_version.trim()
      : null
    const summary = typeof body.observation.summary === 'string' ? body.observation.summary.trim() : ''
    const observationPayload = body.observation.payload && typeof body.observation.payload === 'object'
      ? body.observation.payload
      : {}
    const sourceRef = typeof body.observation.source_ref === 'string' && body.observation.source_ref.trim()
      ? body.observation.source_ref.trim()
      : null
    const observedAt = typeof body.observation.observed_at === 'string' && !Number.isNaN(Date.parse(body.observation.observed_at))
      ? new Date(body.observation.observed_at).toISOString()
      : new Date().toISOString()

    if (!provider || provider.length > 80) return json({ error: 'Invalid provider' }, 400)
    if (!sourceTypes.has(sourceType)) return json({ error: 'Invalid source type' }, 400)
    if (!externalId || externalId.length > 500) return json({ error: 'Invalid external id' }, 400)
    if (!syncModes.has(syncMode)) return json({ error: 'Invalid sync mode' }, 400)
    if (!observationKind || observationKind.length > 80) return json({ error: 'Invalid observation kind' }, 400)
    if (label.length > 500 || (locator?.length ?? 0) > 2000) return json({ error: 'Source metadata is too long' }, 413)
    if (summary.length > 5000) return json({ error: 'Observation summary is too long' }, 413)

    const normalizedPayload = stableStringify(observationPayload)
    if (normalizedPayload.length > 250_000) return json({ error: 'Observation payload is too large' }, 413)

    const contentHash = await sha256Hex(stableStringify({
      provider,
      sourceType,
      externalId,
      observationKind,
      externalVersion,
      summary,
      payload: observationPayload,
    }))

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await admin.rpc('perception_ingest_project_observation_internal', {
      p_user_id: userData.user.id,
      p_project_id: projectId,
      p_provider: provider,
      p_source_type: sourceType,
      p_external_id: externalId,
      p_label: label,
      p_locator: locator,
      p_sync_mode: syncMode,
      p_source_metadata: metadata,
      p_observation_kind: observationKind,
      p_external_version: externalVersion,
      p_content_hash: contentHash,
      p_summary: summary,
      p_payload: observationPayload,
      p_source_ref: sourceRef,
      p_observed_at: observedAt,
    })

    if (error) {
      console.error('Perception project ingestion failed', { code: error.code, message: error.message })
      if (error.code === 'P0002') return json({ error: 'Project World not found' }, 404)
      if (error.code === '23514' || error.code === '22023') return json({ error: 'Invalid ingestion payload' }, 400)
      return json({ error: 'Project ingestion failed' }, 500)
    }

    return json(data ?? { ok: true })
  } catch (error) {
    console.error('Perception ingestion edge failure', error instanceof Error ? error.message : 'unknown error')
    return json({ error: 'Unexpected runtime failure' }, 500)
  }
})
