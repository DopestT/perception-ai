import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0'
import {
  isPrivateNetworkAddress,
  isSafeStudyUrl,
  parseStudyDocument,
  scoreStudyItem,
  type LearningSourceType,
} from '../_shared/continuous-mind.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

type AdminClient = SupabaseClient<any, any, any, any, any>

type StudyClaim = {
  run_id: string
  source_id: string
  user_id: string
  project_id: string
  label: string
  source_type: LearningSourceType
  url: string
  trust_weight: number
  etag: string | null
  last_modified: string | null
  max_items: number
  project_name: string
  desired_reality: string
  current_reality: string
}

type FetchResult = {
  unchanged: boolean
  body: string
  contentType: string
  etag: string | null
  lastModified: string | null
  finalUrl: string
  status: number
}

const MAX_DOCUMENT_BYTES = 1_000_000
const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

async function assertPublicDns(url: URL) {
  if (isPrivateNetworkAddress(url.hostname)) throw new Error('Private network sources are not allowed')

  const queries = await Promise.allSettled([
    Deno.resolveDns(url.hostname, 'A'),
    Deno.resolveDns(url.hostname, 'AAAA'),
  ])
  for (const query of queries) {
    if (query.status !== 'fulfilled') continue
    for (const address of query.value) {
      if (isPrivateNetworkAddress(address)) throw new Error('Source resolved to a private network')
    }
  }
}

async function fetchApprovedSource(claim: StudyClaim): Promise<FetchResult> {
  if (!isSafeStudyUrl(claim.url)) throw new Error('Source URL must be a public HTTPS URL')
  let currentUrl = new URL(claim.url)

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    if (!isSafeStudyUrl(currentUrl.href)) throw new Error('Unsafe source redirect')
    await assertPublicDns(currentUrl)

    const headers = new Headers({
      Accept: 'application/rss+xml, application/atom+xml, application/feed+json, application/json, text/html;q=0.9, text/plain;q=0.7',
      'User-Agent': 'Perception-Continuous-Mind/0.1 (+https://perception.app)',
    })
    if (claim.etag) headers.set('If-None-Match', claim.etag)
    if (claim.last_modified) headers.set('If-Modified-Since', claim.last_modified)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await fetch(currentUrl, { headers, redirect: 'manual', signal: controller.signal })

      if (response.status === 304) {
        return {
          unchanged: true,
          body: '',
          contentType: response.headers.get('content-type') ?? '',
          etag: response.headers.get('etag') ?? claim.etag,
          lastModified: response.headers.get('last-modified') ?? claim.last_modified,
          finalUrl: currentUrl.href,
          status: response.status,
        }
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location || redirect === MAX_REDIRECTS) throw new Error('Source redirect limit exceeded')
        currentUrl = new URL(location, currentUrl)
        continue
      }

      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`)
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType && !/(json|xml|rss|atom|html|text)/i.test(contentType)) {
        await response.body?.cancel()
        throw new Error('Source returned an unsupported document type')
      }
      const declaredLength = Number(response.headers.get('content-length') ?? 0)
      if (declaredLength > MAX_DOCUMENT_BYTES) {
        await response.body?.cancel()
        throw new Error('Source document is too large')
      }

      const buffer = await response.arrayBuffer()
      if (buffer.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Source document is too large')
      const body = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
      return {
        unchanged: false,
        body,
        contentType,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        finalUrl: currentUrl.href,
        status: response.status,
      }
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new Error('Source could not be fetched')
}

async function completeRun(
  admin: AdminClient,
  claim: StudyClaim,
  status: 'succeeded' | 'partial' | 'failed',
  fetched?: FetchResult,
  error?: string,
) {
  const { error: completionError } = await admin.rpc('perception_complete_study_run_internal', {
    p_run_id: claim.run_id,
    p_status: status,
    p_etag: fetched?.etag ?? null,
    p_last_modified: fetched?.lastModified ?? null,
    p_error: error ?? null,
  })
  if (completionError) throw new Error(`Could not complete study run: ${completionError.message}`)
}

async function studySource(admin: AdminClient, claim: StudyClaim) {
  let fetched: FetchResult | undefined
  try {
    fetched = await fetchApprovedSource(claim)
    if (fetched.unchanged) {
      await completeRun(admin, claim, 'succeeded', fetched)
      return { source_id: claim.source_id, status: 'unchanged', seen: 0, integrated: 0, proposed: 0 }
    }

    const items = parseStudyDocument({
      body: fetched.body,
      contentType: fetched.contentType,
      sourceType: claim.source_type,
      sourceUrl: fetched.finalUrl,
      maxItems: claim.max_items,
    })
    let integrated = 0
    let proposed = 0
    const itemErrors: string[] = []

    for (const item of items) {
      const metrics = scoreStudyItem(item, {
        projectName: claim.project_name,
        desiredReality: claim.desired_reality,
        currentReality: claim.current_reality,
      }, claim.trust_weight)
      const contentHash = await sha256([
        claim.source_id, item.id, item.url, item.title, item.summary,
      ].join('\u0000'))
      const fetchedAt = new Date().toISOString()
      const sourceRefs = [{
        kind: 'approved_learning_source',
        ref: item.url || fetched.finalUrl,
        source_id: claim.source_id,
        observed_at: fetchedAt,
        published_at: item.publishedAt,
      }]
      const verificationEvidence = [{
        kind: 'https_source_fetch',
        source_url: fetched.finalUrl,
        fetched_at: fetchedAt,
        http_status: fetched.status,
        content_type: fetched.contentType,
        etag: fetched.etag,
        last_modified: fetched.lastModified,
        content_hash: contentHash,
      }]

      const { data, error } = await admin.rpc('perception_record_study_observation_internal', {
        p_run_id: claim.run_id,
        p_source_id: claim.source_id,
        p_content_hash: contentHash,
        p_title: item.title,
        p_summary: item.summary,
        p_why_it_matters: metrics.whyItMatters,
        p_excerpt: item.excerpt,
        p_source_url: item.url || fetched.finalUrl,
        p_source_published_at: item.publishedAt,
        p_relevance: metrics.relevance,
        p_impact: metrics.impact,
        p_novelty: metrics.novelty,
        p_confidence: metrics.confidence,
        p_urgency: metrics.urgency,
        p_noise: metrics.noise,
        p_source_refs: sourceRefs,
        p_verification_evidence: verificationEvidence,
        p_affected_belief_ids: [],
        p_affected_route_node_ids: [],
      })
      if (error) {
        itemErrors.push(error.message)
        continue
      }
      const result = data as { status?: string } | null
      if (result?.status === 'accepted') integrated += 1
      if (result?.status === 'proposed') proposed += 1
    }

    const status = itemErrors.length ? 'partial' : 'succeeded'
    const detail = itemErrors.length ? `${itemErrors.length} item(s) could not be recorded` : undefined
    await completeRun(admin, claim, status, fetched, detail)
    return { source_id: claim.source_id, status, seen: items.length, integrated, proposed }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown study failure'
    await completeRun(admin, claim, 'failed', fetched, message).catch((completionError) => {
      console.error('Continuous Mind could not record failed run', {
        run_id: claim.run_id,
        message: completionError instanceof Error ? completionError.message : 'unknown',
      })
    })
    return { source_id: claim.source_id, status: 'failed', error: message }
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const publishableKey = publishableKeys.default
    const secretKey = secretKeys.default
    if (!url || !publishableKey || !secretKey) return json({ error: 'Runtime unavailable' }, 503)

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const cronToken = request.headers.get('x-perception-cron-token')?.trim() ?? ''
    const authHeader = request.headers.get('Authorization')
    let userId: string | null = null
    let scheduled = false

    if (cronToken) {
      const { data: secretHash, error: secretError } = await admin
        .from('perception_runtime_secret_hashes')
        .select('secret_hash')
        .eq('secret_name', 'continuous_mind_cron')
        .maybeSingle()
      if (secretError || !secretHash?.secret_hash) return json({ error: 'Scheduler unavailable' }, 503)
      if (!constantTimeEqual(await sha256(cronToken), secretHash.secret_hash)) {
        return json({ error: 'Invalid scheduler credential' }, 401)
      }
      scheduled = true
    } else {
      if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)
      const token = authHeader.slice(7).trim()
      const userClient = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userData, error: userError } = await userClient.auth.getUser(token)
      if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)
      userId = userData.user.id
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : 'study'

    if (action === 'review') {
      if (!userId || scheduled) return json({ error: 'User authentication required for review' }, 401)
      const candidateId = typeof body.candidate_id === 'string' ? body.candidate_id : ''
      const decision = body.decision === 'accepted' || body.decision === 'rejected' ? body.decision : ''
      if (!candidateId || !decision) return json({ error: 'candidate_id and a valid decision are required' }, 400)

      const { data: review, error: reviewError } = await admin.rpc('perception_review_learning_internal', {
        p_user_id: userId,
        p_candidate_id: candidateId,
        p_decision: decision,
        p_reason: typeof body.reason === 'string' ? body.reason : null,
      })
      if (reviewError) {
        console.error('Continuous Mind review failed', { code: reviewError.code, message: reviewError.message })
        return json({ error: 'Learning review failed' }, 500)
      }
      return json({ ok: true, action: 'review', result: review })
    }

    if (action !== 'study') return json({ error: 'Unsupported action' }, 400)
    const projectId = typeof body.project_id === 'string' ? body.project_id : null
    if (!scheduled && !projectId) return json({ error: 'project_id required' }, 400)

    const { data, error } = await admin.rpc('perception_claim_study_sources_internal', {
      p_user_id: userId,
      p_project_id: scheduled ? null : projectId,
      p_limit: scheduled ? 5 : 10,
      p_force: !scheduled,
    })
    if (error) {
      console.error('Continuous Mind source claim failed', { code: error.code, message: error.message })
      return json({ error: 'Study cycle could not start' }, 500)
    }

    const claims = Array.isArray(data) ? data as StudyClaim[] : []
    const results = await Promise.all(claims.map((claim) => studySource(admin, claim)))

    let scenarioForge: Record<string, unknown> = {
      source: scheduled ? 'scenario_forge_idle_v0_7' : 'scenario_forge_v0_6',
      refreshed: false,
    }

    if (scheduled) {
      const idleForge = await admin.rpc('perception_refresh_idle_scenarios_internal', {
        p_limit: 5,
      })
      if (!idleForge.error) {
        scenarioForge = {
          source: 'scenario_forge_idle_v0_7',
          refreshed: true,
          result: idleForge.data,
        }
      } else if (idleForge.error.code !== 'PGRST202' && idleForge.error.code !== '42883') {
        console.error('Continuous Mind idle Scenario Forge failed', {
          code: idleForge.error.code,
          message: idleForge.error.message,
        })
        scenarioForge = {
          source: 'scenario_forge_idle_v0_7',
          refreshed: false,
          error: 'idle_refresh_failed',
        }
      }
    } else if (userId && projectId) {
      const projectForge = await admin.rpc('perception_refresh_scenario_forge_internal', {
        p_user_id: userId,
        p_project_id: projectId,
      })
      if (!projectForge.error) {
        scenarioForge = {
          source: 'scenario_forge_v0_6',
          refreshed: true,
          result: projectForge.data,
        }
      } else if (projectForge.error.code !== 'PGRST202' && projectForge.error.code !== '42883') {
        console.error('Continuous Mind project Scenario Forge failed', {
          code: projectForge.error.code,
          message: projectForge.error.message,
          project_id: projectId,
        })
        scenarioForge = {
          source: 'scenario_forge_v0_6',
          refreshed: false,
          error: 'project_refresh_failed',
        }
      }
    }

    return json({
      ok: true,
      trigger: scheduled ? 'scheduled' : 'manual',
      claimed: claims.length,
      results,
      scenario_forge: scenarioForge,
      completed_at: new Date().toISOString(),
    })
  } catch (cause) {
    console.error('Continuous Mind failure', cause instanceof Error ? cause.message : 'unknown')
    return json({ error: 'Unexpected Continuous Mind failure' }, 500)
  }
})
