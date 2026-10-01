import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import { isPrivateNetworkAddress, isSafeStudyUrl } from '../_shared/continuous-mind.ts'
import {
  canonicalSiteUrl,
  extractPageSignals,
  opportunitiesForPage,
  parseSitemapUrls,
  rankGrowthOpportunities,
  siteLevelOpportunity,
  type GrowthOpportunity,
  type GrowthPageSignals,
} from '../_shared/growth-operator.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const FETCH_TIMEOUT_MS = 10_000
const MAX_DOCUMENT_BYTES = 1_200_000
const MAX_SCAN_PAGES = 50

type SiteRow = {
  id: string
  user_id: string
  project_id: string
  site_url: string
  canonical_host: string
  repository: string | null
  primary_goal: string
  conversion_event: string
  publishing_mode: 'draft' | 'approval' | 'autopilot'
  enabled: boolean
}

async function assertPublicDns(url: URL) {
  if (!isSafeStudyUrl(url.href) || isPrivateNetworkAddress(url.hostname)) {
    throw new Error('Only public HTTPS sites may be scanned')
  }

  const resolved = await Promise.allSettled([
    Deno.resolveDns(url.hostname, 'A'),
    Deno.resolveDns(url.hostname, 'AAAA'),
  ])
  for (const answer of resolved) {
    if (answer.status !== 'fulfilled') continue
    for (const address of answer.value) {
      if (isPrivateNetworkAddress(address)) throw new Error('Site resolved to a private network')
    }
  }
}

async function fetchDocument(rawUrl: string, accept: string) {
  const url = new URL(rawUrl)
  await assertPublicDns(url)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: accept,
        'User-Agent': 'Perception-Growth-Operator/0.1 (+https://perceptionai.io)',
      },
    })
    const finalUrl = new URL(response.url || url.href)
    await assertPublicDns(finalUrl)
    if (finalUrl.host !== url.host) throw new Error('Cross-host redirects are not allowed for growth scans')

    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > MAX_DOCUMENT_BYTES) {
      await response.body?.cancel()
      throw new Error('Document exceeded scan size limit')
    }

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Document exceeded scan size limit')
    return {
      ok: response.ok,
      status: response.status,
      body: new TextDecoder().decode(buffer),
      contentType: response.headers.get('content-type') ?? '',
      url: finalUrl.href,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function endpointExists(url: string) {
  try {
    const result = await fetchDocument(url, 'text/plain,text/xml,text/html;q=0.8,*/*;q=0.1')
    return result.ok
  } catch {
    return false
  }
}

function safeText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

async function requireOwnedProject(admin: ReturnType<typeof createClient>, userId: string, projectId: string) {
  const { data, error } = await admin
    .from('perception_projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`Project lookup failed: ${error.message}`)
  if (!data) throw new Error('Project World not found')
}

async function loadSite(admin: ReturnType<typeof createClient>, userId: string, projectId: string): Promise<SiteRow> {
  const { data, error } = await admin
    .from('perception_growth_sites')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('enabled', true)
    .maybeSingle()
  if (error) throw new Error(`Growth site lookup failed: ${error.message}`)
  if (!data) throw new Error('Growth site is not configured')
  return data as SiteRow
}

async function recordQueueIntent(
  admin: ReturnType<typeof createClient>,
  site: SiteRow,
  opportunity: { id: string; opportunity_key: string; bounded_job: Record<string, unknown> },
) {
  const { error } = await admin.rpc('perception_record_execution_entry_internal', {
    p_user_id: site.user_id,
    p_project_id: site.project_id,
    p_action_key: `growth:${opportunity.opportunity_key}`,
    p_phase: 'intended',
    p_permission_level: 'P1',
    p_objective_id: null,
    p_route_id: null,
    p_route_node_id: null,
    p_worker_run_id: null,
    p_capability: 'growth',
    p_target: site.site_url,
    p_details: {
      growth_opportunity_id: opportunity.id,
      bounded_job: opportunity.bounded_job,
      publishing_mode: site.publishing_mode,
    },
    p_evidence: [],
  })
  if (error) throw new Error(`Execution ledger write failed: ${error.message}`)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return json({ error: 'Authentication required' }, 401)

  try {
    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const url = Deno.env.get('SUPABASE_URL')
    const publishableKey = publishableKeys.default || Deno.env.get('SUPABASE_ANON_KEY')
    const secretKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY')
    if (!url || !publishableKey || !secretKey) return json({ error: 'Growth runtime unavailable' }, 503)

    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)

    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const action = safeText(body?.action, 40) || 'status'
    const projectId = safeText(body?.project_id, 80)
    if (!projectId) return json({ error: 'project_id is required' }, 400)
    await requireOwnedProject(admin, userData.user.id, projectId)

    if (action === 'configure') {
      const rawSiteUrl = safeText(body?.site_url, 500)
      const repository = safeText(body?.repository, 240) || null
      const primaryGoal = safeText(body?.primary_goal, 1000)
      const conversionEvent = safeText(body?.conversion_event, 240)
      if (!rawSiteUrl || !primaryGoal) return json({ error: 'site_url and primary_goal are required' }, 400)

      const siteUrl = canonicalSiteUrl(rawSiteUrl)
      await assertPublicDns(new URL(siteUrl))
      if (repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
        return json({ error: 'repository must be owner/name' }, 400)
      }

      const publishingMode = body?.publishing_mode === 'draft' || body?.publishing_mode === 'autopilot'
        ? body.publishing_mode
        : 'approval'
      const payload = {
        user_id: userData.user.id,
        project_id: projectId,
        site_url: siteUrl,
        canonical_host: new URL(siteUrl).host,
        repository,
        primary_goal: primaryGoal,
        conversion_event: conversionEvent,
        publishing_mode: publishingMode,
        enabled: true,
        updated_at: new Date().toISOString(),
      }
      const { data, error } = await admin
        .from('perception_growth_sites')
        .upsert(payload, { onConflict: 'user_id,project_id' })
        .select('*')
        .single()
      if (error) throw new Error(`Could not configure growth site: ${error.message}`)
      return json({ ok: true, site: data })
    }

    if (action === 'status') {
      const { data, error } = await userClient.rpc('perception_get_growth_dashboard', { p_project_id: projectId })
      if (error) throw new Error(`Growth dashboard unavailable: ${error.message}`)
      return json({ ok: true, dashboard: data })
    }

    const site = await loadSite(admin, userData.user.id, projectId)

    if (action === 'queue_top') {
      const requestedLimit = Number(body?.limit ?? 10)
      const limit = Math.min(10, Math.max(1, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 10))
      const { data: latestRun, error: runError } = await admin
        .from('perception_growth_runs')
        .select('id')
        .eq('site_id', site.id)
        .eq('user_id', site.user_id)
        .in('status', ['succeeded', 'partial'])
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (runError) throw new Error(`Growth run lookup failed: ${runError.message}`)
      if (!latestRun) return json({ error: 'No completed growth scan is available' }, 409)

      const { data: opportunities, error } = await admin
        .from('perception_growth_opportunities')
        .select('id, opportunity_key, bounded_job, score, title, target_path')
        .eq('run_id', latestRun.id)
        .eq('status', 'proposed')
        .order('score', { ascending: false })
        .limit(limit)
      if (error) throw new Error(`Opportunity queue lookup failed: ${error.message}`)

      const queued: unknown[] = []
      for (const opportunity of opportunities ?? []) {
        await recordQueueIntent(admin, site, opportunity as { id: string; opportunity_key: string; bounded_job: Record<string, unknown> })
        const { error: updateError } = await admin
          .from('perception_growth_opportunities')
          .update({ status: 'queued', updated_at: new Date().toISOString() })
          .eq('id', opportunity.id)
          .eq('user_id', site.user_id)
        if (updateError) throw new Error(`Could not queue opportunity: ${updateError.message}`)
        queued.push(opportunity)
      }
      return json({ ok: true, queued })
    }

    if (action !== 'scan') return json({ error: 'Unknown action' }, 400)

    const rawMaxPages = Number(body?.max_pages ?? 24)
    const maxPages = Math.min(MAX_SCAN_PAGES, Math.max(1, Number.isFinite(rawMaxPages) ? Math.floor(rawMaxPages) : 24))
    const { data: run, error: startError } = await admin
      .from('perception_growth_runs')
      .insert({
        user_id: site.user_id,
        project_id: site.project_id,
        site_id: site.id,
        status: 'running',
        trigger: safeText(body?.trigger, 40) || 'manual',
      })
      .select('id')
      .single()
    if (startError || !run) throw new Error(`Could not start growth scan: ${startError?.message ?? 'unknown error'}`)

    try {
      const rootUrl = site.site_url
      const sitemapUrl = new URL('/sitemap.xml', rootUrl).href
      const robotsUrl = new URL('/robots.txt', rootUrl).href
      const llmsUrl = new URL('/llms.txt', rootUrl).href

      const [root, sitemap, robotsExists, llmsExists] = await Promise.all([
        fetchDocument(rootUrl, 'text/html'),
        fetchDocument(sitemapUrl, 'application/xml,text/xml,text/plain;q=0.8').catch(() => null),
        endpointExists(robotsUrl),
        endpointExists(llmsUrl),
      ])

      const sitemapUsable = Boolean(sitemap?.ok && sitemap.body)
      const discovered = sitemapUsable ? parseSitemapUrls(sitemap!.body, rootUrl, 100) : []
      if (!discovered.includes(rootUrl)) discovered.unshift(rootUrl)
      const urls = discovered.slice(0, maxPages)
      const pages: GrowthPageSignals[] = []

      for (const pageUrl of urls) {
        try {
          const fetched = pageUrl === rootUrl
            ? root
            : await fetchDocument(pageUrl, 'text/html,application/xhtml+xml;q=0.9')
          if (!fetched.contentType.toLowerCase().includes('html') && pageUrl !== rootUrl) continue
          pages.push(extractPageSignals({
            html: fetched.body,
            url: fetched.url,
            status: fetched.status,
            primaryGoal: site.primary_goal,
          }))
        } catch {
          pages.push(extractPageSignals({
            html: '',
            url: pageUrl,
            status: 599,
            primaryGoal: site.primary_goal,
          }))
        }
      }

      const opportunities: GrowthOpportunity[] = pages.flatMap((page) => opportunitiesForPage({
        page,
        primaryGoal: site.primary_goal,
        repository: site.repository,
      }))
      if (!sitemapUsable) opportunities.push(siteLevelOpportunity({
        kind: 'missing_sitemap', siteUrl: rootUrl, primaryGoal: site.primary_goal, repository: site.repository,
      }))
      if (!robotsExists) opportunities.push(siteLevelOpportunity({
        kind: 'missing_robots', siteUrl: rootUrl, primaryGoal: site.primary_goal, repository: site.repository,
      }))
      if (!llmsExists) opportunities.push(siteLevelOpportunity({
        kind: 'missing_llms', siteUrl: rootUrl, primaryGoal: site.primary_goal, repository: site.repository,
      }))

      const ranked = rankGrowthOpportunities(opportunities, Math.max(10, opportunities.length))
      const baseline = {
        site_url: rootUrl,
        pages_discovered: discovered.length,
        pages_scanned: pages.length,
        indexable_pages: pages.filter((page) => !page.noindex && page.status < 400).length,
        missing_titles: pages.filter((page) => !page.title).length,
        missing_meta_descriptions: pages.filter((page) => !page.metaDescription).length,
        missing_h1: pages.filter((page) => page.h1Count === 0).length,
        thin_pages: pages.filter((page) => page.wordCount < 250).length,
        pages_with_conversion_cta: pages.filter((page) => page.hasConversionCta).length,
        sitemap: sitemapUsable,
        robots: robotsExists,
        llms_txt: llmsExists,
        primary_goal: site.primary_goal,
        conversion_event: site.conversion_event,
      }

      if (pages.length) {
        const { error: pageError } = await admin.from('perception_growth_pages').insert(pages.map((page) => ({
          run_id: run.id,
          user_id: site.user_id,
          project_id: site.project_id,
          url: page.url,
          path: page.path,
          http_status: page.status,
          title: page.title,
          meta_description: page.metaDescription,
          h1: page.h1,
          word_count: page.wordCount,
          internal_links: page.internalLinks,
          external_links: page.externalLinks,
          noindex: page.noindex,
          signals: {
            canonical: page.canonical,
            h1_count: page.h1Count,
            has_conversion_cta: page.hasConversionCta,
          },
        })))
        if (pageError) throw new Error(`Could not persist growth pages: ${pageError.message}`)
      }

      if (ranked.length) {
        const { error: opportunityError } = await admin.from('perception_growth_opportunities').insert(ranked.map((opportunity) => ({
          run_id: run.id,
          site_id: site.id,
          user_id: site.user_id,
          project_id: site.project_id,
          opportunity_key: opportunity.key,
          kind: opportunity.kind,
          target_url: opportunity.targetUrl,
          target_path: opportunity.targetPath,
          title: opportunity.title,
          rationale: opportunity.rationale,
          score: opportunity.score,
          bounded_job: opportunity.boundedJob,
        })))
        if (opportunityError) throw new Error(`Could not persist growth opportunities: ${opportunityError.message}`)
      }

      const { error: completionError } = await admin
        .from('perception_growth_runs')
        .update({
          status: pages.length ? 'succeeded' : 'partial',
          pages_discovered: discovered.length,
          pages_scanned: pages.length,
          baseline,
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id)
        .eq('user_id', site.user_id)
      if (completionError) throw new Error(`Could not complete growth run: ${completionError.message}`)

      return json({
        ok: true,
        run_id: run.id,
        baseline,
        top_opportunities: rankGrowthOpportunities(ranked, 10),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown scan failure'
      await admin
        .from('perception_growth_runs')
        .update({ status: 'failed', error: message.slice(0, 2000), finished_at: new Date().toISOString() })
        .eq('id', run.id)
        .eq('user_id', site.user_id)
      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Growth Operator failed'
    console.error('Growth Operator error', { message })
    return json({ error: message }, /not found|not configured/i.test(message) ? 404 : 500)
  }
})
