import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

const validDate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)
    const token = authHeader.slice(7).trim()

    const url = Deno.env.get('SUPABASE_URL')
    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const publishableKey = publishableKeys.default
    const secretKey = secretKeys.default
    if (!url || !publishableKey || !secretKey) return json({ error: 'Runtime unavailable' }, 503)

    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)

    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const action = typeof body?.action === 'string' ? body.action : ''
    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const userId = userData.user.id

    if (action === 'lmtyai_revenue_status') {
      let projectId = typeof body?.project_id === 'string' ? body.project_id : ''
      if (!projectId) {
        const { data: project, error: projectError } = await admin
          .from('perception_projects')
          .select('id')
          .eq('user_id', userId)
          .eq('name', 'LMTYAI Growth Sniffer')
          .eq('active', true)
          .maybeSingle()
        if (projectError || !project) return json({ error: 'LMTYAI project unavailable' }, 404)
        projectId = project.id
      }

      const { data: ownedProject } = await admin
        .from('perception_projects')
        .select('id')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle()
      if (!ownedProject) return json({ error: 'Project unavailable' }, 404)

      const to = validDate(body?.to) ?? new Date().toISOString()
      const from = validDate(body?.from) ?? new Date(Date.parse(to) - 86_400_000).toISOString()
      if (Date.parse(from) >= Date.parse(to)) return json({ error: 'Invalid revenue window' }, 400)

      const { data, error } = await userClient.rpc('lmtyai_get_revenue_dashboard', {
        p_project_id: projectId,
        p_from: from,
        p_to: to,
      })
      if (error) {
        console.error('Perception revenue status RPC failed', { code: error.code })
        return json({ error: 'Revenue status unavailable' }, 500)
      }
      return json({ ok: true, action, result: data })
    }

    let rpc: string
    let args: Record<string, unknown>

    if (action === 'dispatch_next') {
      if (typeof body?.project_id !== 'string') return json({ error: 'project_id required' }, 400)
      rpc = 'perception_dispatch_next_internal'
      args = { p_user_id: userId, p_project_id: body.project_id }
    } else if (action === 'complete_worker') {
      if (typeof body?.worker_run_id !== 'string' || typeof body?.content !== 'string') return json({ error: 'worker_run_id and content required' }, 400)
      rpc = 'perception_complete_worker_internal'
      args = {
        p_user_id: userId,
        p_worker_run_id: body.worker_run_id,
        p_artifact_type: typeof body.artifact_type === 'string' ? body.artifact_type : 'worker_output',
        p_title: typeof body.title === 'string' ? body.title : 'Worker Output',
        p_content: body.content,
        p_evidence: Array.isArray(body.evidence) ? body.evidence : [],
      }
    } else if (action === 'ingest_verified_signal') {
      if (typeof body?.project_id !== 'string' || typeof body?.summary !== 'string') return json({ error: 'project_id and summary required' }, 400)
      rpc = 'perception_ingest_verified_signal_internal'
      const metric = (key: string, fallback: number) => typeof body?.[key] === 'number' ? body[key] as number : fallback
      args = {
        p_user_id: userId,
        p_project_id: body.project_id,
        p_summary: body.summary,
        p_relevance: metric('relevance', 0.5),
        p_impact: metric('impact', 0.5),
        p_novelty: metric('novelty', 0.5),
        p_confidence: metric('confidence', 0.5),
        p_urgency: metric('urgency', 0.5),
        p_noise: metric('noise', 0),
        p_source_refs: Array.isArray(body.source_refs) ? body.source_refs : [],
      }
    } else if (action === 'append_route_action') {
      if (typeof body?.project_id !== 'string' || typeof body?.source_worker_run_id !== 'string' || typeof body?.label !== 'string' || typeof body?.outcome !== 'string' || typeof body?.capability !== 'string') {
        return json({ error: 'project_id, source_worker_run_id, label, outcome, capability required' }, 400)
      }
      rpc = 'perception_append_route_action_internal'
      args = {
        p_user_id: userId,
        p_project_id: body.project_id,
        p_source_worker_run_id: body.source_worker_run_id,
        p_label: body.label,
        p_outcome: body.outcome,
        p_capability: body.capability,
        p_permission_level: typeof body.permission_level === 'string' ? body.permission_level : 'P1',
        p_risk: typeof body.risk === 'string' ? body.risk : 'low',
        p_completion_tests: Array.isArray(body.completion_tests) ? body.completion_tests : [],
      }
    } else {
      return json({ error: 'Unsupported action' }, 400)
    }

    const { data, error } = await admin.rpc(rpc, args)
    if (error) {
      console.error('Perception runtime RPC failed', { action, code: error.code, message: error.message })
      return json({ error: 'Runtime action failed' }, 500)
    }
    return json({ ok: true, action, result: data })
  } catch (error) {
    console.error('Perception runtime failure', error instanceof Error ? error.message : 'unknown')
    return json({ error: 'Unexpected runtime failure' }, 500)
  }
})
