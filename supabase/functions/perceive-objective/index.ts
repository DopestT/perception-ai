import { createClient } from 'npm:@supabase/supabase-js@2'
import { governTask, routeModelTargets, type ModelPrice, type ModelProtocol, type ModelTarget } from '../_shared/token-efficiency.ts'
import { deterministicMeaning, resolveObjectiveMeaning, type ResolvedObjectiveMeaning } from '../_shared/meaning-resolver.ts'
import { planDynamicRealityRoute } from '../_shared/reality-planner.ts'
import { mapProjectReality, type ProjectRealitySnapshot } from '../_shared/reality-mapper.ts'
import { routePlannedCapabilities } from '../_shared/capability-router.ts'
import { buildGitHubActionContract, repositoryFromGitHubLocator } from '../_shared/action-contract.ts'
import { materializeGitHubCodePlan, type GitHubCodePlanResult } from '../_shared/code-plan-materializer.ts'
import { materializeLocalArtifact, verifyLocalArtifact } from '../_shared/local-runtime.ts'

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

function leftText(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(0, limit)
}

type ResumeObjectiveRow = {
  id: string
  project_id: string
  statement: string
  desired_reality: string
  current_reality: string
  constraints: unknown
  success_criteria: unknown
  deliverables: unknown
  known_unknowns: unknown
  urgency: string
  meaning: unknown
  meaning_source: string | null
  meaning_confidence: number | null
}

function stringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit)
}

function storedObjectiveMeaning(row: ResumeObjectiveRow): ResolvedObjectiveMeaning {
  const fallback = deterministicMeaning(row.statement)
  const stored = row.meaning && typeof row.meaning === 'object' && !Array.isArray(row.meaning)
    ? row.meaning as Record<string, unknown>
    : {}
  const urgency = ['low', 'normal', 'high', 'critical'].includes(row.urgency)
    ? row.urgency as ResolvedObjectiveMeaning['urgency']
    : fallback.urgency
  const inferredClaims = Array.isArray(stored.inferred_claims)
    ? stored.inferred_claims
        .filter((claim): claim is Record<string, unknown> => Boolean(claim && typeof claim === 'object' && !Array.isArray(claim)))
        .map((claim) => ({
          claim_key: typeof claim.claim_key === 'string' ? claim.claim_key.trim().slice(0, 160) : '',
          statement: typeof claim.statement === 'string' ? claim.statement.trim().slice(0, 2000) : '',
          confidence: typeof claim.confidence === 'number' && Number.isFinite(claim.confidence)
            ? Math.max(0, Math.min(1, claim.confidence))
            : 0.5,
          route_impact: typeof claim.route_impact === 'string' ? claim.route_impact.trim().slice(0, 1000) : '',
        }))
        .filter((claim) => claim.claim_key && claim.statement)
        .slice(0, 12)
    : []

  return {
    ...fallback,
    desired_reality: row.desired_reality || fallback.desired_reality,
    current_reality: row.current_reality || fallback.current_reality,
    constraints: stringArray(row.constraints),
    success_criteria: stringArray(row.success_criteria),
    deliverables: stringArray(row.deliverables),
    urgency,
    known_unknowns: stringArray(row.known_unknowns),
    inferred_claims: inferredClaims,
    confidence: typeof row.meaning_confidence === 'number' && Number.isFinite(row.meaning_confidence)
      ? Math.max(0, Math.min(1, row.meaning_confidence))
      : fallback.confidence,
    source: row.meaning_source === 'openai' ? 'openai' : 'deterministic_fallback',
    provider: null,
    model: null,
    routing_attempts: [],
    usage: undefined,
  }
}

function numericEnv(name: string, fallback = 0): number {
  const value = Number(Deno.env.get(name) ?? '')
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function priceFromEnv(prefix: string): ModelPrice {
  return {
    inputUsdPerMillion: numericEnv(`${prefix}_INPUT_USD_PER_M`),
    cachedInputUsdPerMillion: numericEnv(`${prefix}_CACHED_INPUT_USD_PER_M`),
    outputUsdPerMillion: numericEnv(`${prefix}_OUTPUT_USD_PER_M`),
  }
}

function protocolEnv(name: string, fallback: ModelProtocol): ModelProtocol {
  return Deno.env.get(name) === 'responses' ? 'responses' : Deno.env.get(name) === 'chat_completions' ? 'chat_completions' : fallback
}

function buildModelTargets(): ModelTarget[] {
  const openaiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
  const legacyMeaningModel = Deno.env.get('PERCEPTION_MEANING_MODEL')?.trim()
  const economyModel = Deno.env.get('PERCEPTION_MODEL_ECONOMY')?.trim() || legacyMeaningModel
  const balancedModel = Deno.env.get('PERCEPTION_MODEL_BALANCED')?.trim()
  const deepModel = Deno.env.get('PERCEPTION_MODEL_DEEP')?.trim()
  const localModel = Deno.env.get('PERCEPTION_LOCAL_MODEL')?.trim()
  const localBaseUrl = Deno.env.get('PERCEPTION_LOCAL_BASE_URL')?.trim()
  const compatibleModel = Deno.env.get('PERCEPTION_COMPAT_MODEL')?.trim()
  const compatibleBaseUrl = Deno.env.get('PERCEPTION_COMPAT_BASE_URL')?.trim()

  return [
    ...(localModel && localBaseUrl ? [{
      id: 'local',
      provider: 'local' as const,
      model: localModel,
      lane: 'economy' as const,
      protocol: protocolEnv('PERCEPTION_LOCAL_PROTOCOL', 'chat_completions'),
      baseUrl: localBaseUrl,
      apiKey: Deno.env.get('PERCEPTION_LOCAL_API_KEY')?.trim(),
      price: { inputUsdPerMillion: 0, cachedInputUsdPerMillion: 0, outputUsdPerMillion: 0 },
    }] : []),
    ...(compatibleModel && compatibleBaseUrl ? [{
      id: 'compatible-economy',
      provider: 'openai_compatible' as const,
      model: compatibleModel,
      lane: 'economy' as const,
      protocol: protocolEnv('PERCEPTION_COMPAT_PROTOCOL', 'chat_completions'),
      baseUrl: compatibleBaseUrl,
      apiKey: Deno.env.get('PERCEPTION_COMPAT_API_KEY')?.trim(),
      price: priceFromEnv('PERCEPTION_COMPAT'),
    }] : []),
    ...(economyModel && openaiKey ? [{
      id: 'openai-economy',
      provider: 'openai' as const,
      model: economyModel,
      lane: 'economy' as const,
      protocol: 'responses' as const,
      apiKey: openaiKey,
      price: priceFromEnv('PERCEPTION_MODEL_ECONOMY'),
    }] : []),
    ...(balancedModel && openaiKey ? [{
      id: 'openai-balanced',
      provider: 'openai' as const,
      model: balancedModel,
      lane: 'balanced' as const,
      protocol: 'responses' as const,
      apiKey: openaiKey,
      price: priceFromEnv('PERCEPTION_MODEL_BALANCED'),
    }] : []),
    ...(deepModel && openaiKey ? [{
      id: 'openai-deep',
      provider: 'openai' as const,
      model: deepModel,
      lane: 'deep' as const,
      protocol: 'responses' as const,
      apiKey: openaiKey,
      price: priceFromEnv('PERCEPTION_MODEL_DEEP'),
    }] : []),
  ]
}

function estimateCost(
  usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number },
  price?: ModelPrice,
): number {
  if (!price) return 0
  const cached = Math.max(0, Math.min(usage.cachedInputTokens, usage.inputTokens))
  const uncached = Math.max(0, usage.inputTokens - cached)
  return Number(((
    uncached * price.inputUsdPerMillion +
    cached * price.cachedInputUsdPerMillion +
    usage.outputTokens * price.outputUsdPerMillion
  ) / 1_000_000).toFixed(8))
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
      console.error('Perception runtime environment is incomplete')
      return json({ error: 'Runtime unavailable' }, 503)
    }

    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)

    const payload = await req.json().catch(() => null) as {
      statement?: unknown
      action?: unknown
      project_id?: unknown
      objective_id?: unknown
    } | null
    const action = payload?.action === 'resume' ? 'resume' : 'submit'
    const requestedProjectId = typeof payload?.project_id === 'string' ? payload.project_id.trim() : ''
    const requestedObjectiveId = typeof payload?.objective_id === 'string' ? payload.objective_id.trim() : ''
    let statement = typeof payload?.statement === 'string' ? payload.statement.trim() : ''

    if (action === 'submit') {
      if (statement.length < 3) return json({ error: 'Objective must contain at least 3 characters' }, 400)
      if (statement.length > 10000) return json({ error: 'Objective is too long' }, 413)
    } else if (!requestedProjectId && !requestedObjectiveId) {
      return json({ error: 'Resume requires project_id or objective_id' }, 400)
    }

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const failLocalWorker = async (
      workerRunId: string,
      leaseToken: string,
      failureCode: string,
      failureText: string,
      retryDelaySeconds = 30,
    ) => {
      const failureCall = await admin.rpc('perception_fail_local_worker_internal', {
        p_worker_run_id: workerRunId,
        p_lease_token: leaseToken,
        p_failure_code: failureCode,
        p_failure_text: leftText(failureText, 2000),
        p_retry_delay_seconds: retryDelaySeconds,
      })
      if (failureCall.error) {
        console.error('Perception local worker failure persistence failed', {
          code: failureCall.error.code,
          message: failureCall.error.message,
          worker_run_id: workerRunId,
        })
      }
    }

    let resumeObjective: ResumeObjectiveRow | null = null
    if (action === 'resume') {
      const objectiveColumns = [
        'id',
        'project_id',
        'statement',
        'desired_reality',
        'current_reality',
        'constraints',
        'success_criteria',
        'deliverables',
        'known_unknowns',
        'urgency',
        'meaning',
        'meaning_source',
        'meaning_confidence',
      ].join(',')

      const objectiveResult = requestedObjectiveId
        ? await admin
            .from('perception_objectives')
            .select(objectiveColumns)
            .eq('id', requestedObjectiveId)
            .eq('user_id', userData.user.id)
            .maybeSingle()
        : await admin
            .from('perception_objectives')
            .select(objectiveColumns)
            .eq('project_id', requestedProjectId)
            .eq('user_id', userData.user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

      if (objectiveResult.error) {
        console.error('Perception resume objective lookup failed', {
          code: objectiveResult.error.code,
          message: objectiveResult.error.message,
        })
        return json({ error: 'Could not load the objective to resume' }, 500)
      }

      if (!objectiveResult.data) return json({ error: 'Objective to resume was not found' }, 404)

      resumeObjective = objectiveResult.data as unknown as ResumeObjectiveRow
      if (requestedProjectId && resumeObjective.project_id !== requestedProjectId) {
        return json({ error: 'Objective does not belong to the requested project' }, 400)
      }

      statement = resumeObjective.statement.trim()
      if (statement.length < 3) return json({ error: 'Stored objective is not resumable' }, 409)
    }

    const { data: policy } = await admin
      .from('perception_token_policies')
      .select('enabled, default_tier, daily_budget_usd')
      .eq('user_id', userData.user.id)
      .is('project_id', null)
      .maybeSingle()

    const costControlEnabled = policy?.enabled ?? true
    const dailyBudgetUsd = Number(policy?.daily_budget_usd ?? 0) || 0

    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const { data: todayUsage } = await admin
      .from('perception_token_usage')
      .select('estimated_cost_usd')
      .eq('user_id', userData.user.id)
      .gte('created_at', today.toISOString())

    const spentTodayUsd = (todayUsage ?? []).reduce(
      (sum, row) => sum + (Number(row.estimated_cost_usd ?? 0) || 0),
      0,
    )
    const budgetPressure = dailyBudgetUsd > 0 ? spentTodayUsd / dailyBudgetUsd : 0

    const governedDecision = governTask({ statement, capability: 'generate', risk: 'low' })
    const tokenDecision = costControlEnabled
      ? governedDecision
      : {
          ...governedDecision,
          tier: 'max' as const,
          modelLane: 'deep' as const,
          maxContextTokens: 32_000,
          maxOutputTokens: 4_000,
          reasons: ['Automatic cost control is disabled by the user policy'],
        }

    const configuredTargets = buildModelTargets()
    const modelRoute = routeModelTargets(tokenDecision, configuredTargets, {
      risk: 'low',
      mechanicallyVerifiable: true,
      costControlEnabled,
      budgetPressure,
    })

    const meaning = resumeObjective
      ? storedObjectiveMeaning(resumeObjective)
      : await resolveObjectiveMeaning(statement, {
          candidates: modelRoute.candidates,
          maxOutputTokens: tokenDecision.maxOutputTokens,
        })

    const runtimeCapabilities = ['reason', 'generate', 'verify'] as const
    const operatorCapabilities = ((Deno.env.get('PERCEPTION_OPERATOR_CAPABILITIES') || Deno.env.get('PERCEPTION_OPERATOR_CAPIBILITIES')) ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)

    const availableCapabilities = Array.from(new Set([
      ...runtimeCapabilities,
      ...operatorCapabilities,
    ]))

    const plannerMeaning = {
      desiredReality: meaning.desired_reality,
      currentReality: meaning.current_reality,
      constraints: meaning.constraints,
      successCriteria: meaning.success_criteria,
      deliverables: meaning.deliverables,
      knownUnknowns: meaning.known_unknowns,
    }

    const plannerCapabilities = availableCapabilities.filter((capability) =>
      ['reason', 'research', 'retrieve', 'generate', 'edit', 'code', 'communicate', 'schedule', 'calculate', 'verify']
        .includes(capability)
    ) as Array<'reason' | 'research' | 'retrieve' | 'generate' | 'edit' | 'code' | 'communicate' | 'schedule' | 'calculate' | 'verify'>

    let runtimeResult: Record<string, unknown> = {}

    if (resumeObjective) {
      const { data: resumeRoute, error: resumeRouteError } = await admin
        .from('perception_routes')
        .select('id, version, active')
        .eq('user_id', userData.user.id)
        .eq('project_id', resumeObjective.project_id)
        .eq('objective_id', resumeObjective.id)
        .order('active', { ascending: false })
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (resumeRouteError) {
        console.error('Perception resume route lookup failed', {
          code: resumeRouteError.code,
          message: resumeRouteError.message,
        })
        return json({ error: 'Could not load the route to resume' }, 500)
      }

      if (!resumeRoute?.id) return json({ error: 'Stored objective has no resumable route' }, 409)

      runtimeResult = {
        ok: true,
        stages: ['UNDERSTOOD', 'PROJECT WORLD CREATED', 'REALITY ROUTE CREATED'],
        project_id: resumeObjective.project_id,
        objective_id: resumeObjective.id,
        route_id: resumeRoute.id,
        resumed: true,
      }
    } else {
      let runtimeData: unknown
      let runtimeError: { code?: string; message?: string } | null = null

      // Establish a verified first Project World state before mapping the continuation route.
      // This prevents pre-Project heuristics from being mistaken for observed reality.
      const resolvedCall = await admin.rpc('perception_submit_resolved_objective_internal', {
        p_user_id: userData.user.id,
        p_statement: statement,
        p_semantics: meaning,
      })

      runtimeData = resolvedCall.data
      runtimeError = resolvedCall.error

      if (runtimeError?.code === 'PGRST202' || runtimeError?.code === '42883') {
        const fallbackCall = await admin.rpc('perception_submit_objective_internal', {
          p_user_id: userData.user.id,
          p_statement: statement,
        })
        runtimeData = fallbackCall.data
        runtimeError = fallbackCall.error
      }

      if (runtimeError) {
        console.error('Perception objective runtime failed', {
          code: runtimeError.code,
          message: runtimeError.message,
        })
        return json({ error: 'Objective runtime failed' }, 500)
      }

      runtimeResult = runtimeData && typeof runtimeData === 'object' && !Array.isArray(runtimeData)
        ? runtimeData as Record<string, unknown>
        : {}
    }

    const projectId = typeof runtimeResult.project_id === 'string' ? runtimeResult.project_id : null
    const objectiveId = typeof runtimeResult.objective_id === 'string' ? runtimeResult.objective_id : null
    const routeId = typeof runtimeResult.route_id === 'string' ? runtimeResult.route_id : null

    let realitySnapshot: ProjectRealitySnapshot = {
      currentReality: meaning.current_reality,
      desiredReality: meaning.desired_reality,
      artifacts: [],
      verifications: [],
      epistemic: [],
      execution: [],
      blockers: [],
    }

    if (projectId) {
      const [projectState, artifactsState, verificationsState, epistemicState, executionState, nodesState] = await Promise.all([
        admin
          .from('perception_projects')
          .select('current_reality, desired_reality')
          .eq('id', projectId)
          .eq('user_id', userData.user.id)
          .maybeSingle(),
        admin
          .from('perception_artifacts')
          .select('title, content, artifact_type')
          .eq('project_id', projectId)
          .eq('user_id', userData.user.id)
          .order('created_at', { ascending: false })
          .limit(100),
        admin
          .from('perception_verification_runs')
          .select('passed, details')
          .eq('project_id', projectId)
          .eq('user_id', userData.user.id)
          .order('checked_at', { ascending: false })
          .limit(100),
        admin
          .from('perception_epistemic_ledger')
          .select('statement, state, confidence, route_impact')
          .eq('project_id', projectId)
          .eq('user_id', userData.user.id)
          .order('created_at', { ascending: false })
          .limit(200),
        admin
          .from('perception_execution_ledger')
          .select('action_key, phase, details')
          .eq('project_id', projectId)
          .eq('user_id', userData.user.id)
          .order('created_at', { ascending: false })
          .limit(200),
        admin
          .from('perception_route_nodes')
          .select('blocker')
          .eq('project_id', projectId)
          .eq('user_id', userData.user.id)
          .order('created_at', { ascending: false })
          .limit(200),
      ])

      realitySnapshot = {
        currentReality: projectState.data?.current_reality || meaning.current_reality,
        desiredReality: projectState.data?.desired_reality || meaning.desired_reality,
        artifacts: (artifactsState.data ?? []).map((artifact) => ({
          title: artifact.title || '',
          content: artifact.content,
          artifactType: artifact.artifact_type,
        })),
        verifications: (verificationsState.data ?? []).map((verification) => ({
          passed: Boolean(verification.passed),
          details: verification.details as Record<string, unknown> | null,
        })),
        epistemic: (epistemicState.data ?? []).map((claim) => ({
          statement: claim.statement || '',
          state: claim.state,
          confidence: Number(claim.confidence ?? 0),
          routeImpact: claim.route_impact,
        })) as ProjectRealitySnapshot['epistemic'],
        execution: (executionState.data ?? []).map((entry) => ({
          actionKey: entry.action_key || '',
          phase: entry.phase,
          details: entry.details as Record<string, unknown> | null,
        })) as ProjectRealitySnapshot['execution'],
        blockers: (nodesState.data ?? [])
          .map((node) => node.blocker)
          .filter((blocker): blocker is string => typeof blocker === 'string' && blocker.trim().length > 0),
      }
    }

    let realityMap = mapProjectReality(plannerMeaning, realitySnapshot)
    let routePlan = planDynamicRealityRoute(plannerMeaning, realityMap, {
      availableCapabilities: plannerCapabilities,
    })

    if (!resumeObjective && projectId && objectiveId && routeId) {
      const dynamicRouteCall = await admin.rpc('perception_apply_dynamic_route_internal', {
        p_user_id: userData.user.id,
        p_project_id: projectId,
        p_objective_id: objectiveId,
        p_previous_route_id: routeId,
        p_plan: routePlan,
      })

      if (!dynamicRouteCall.error && dynamicRouteCall.data && typeof dynamicRouteCall.data === 'object') {
        runtimeResult = {
          ...runtimeResult,
          ...(dynamicRouteCall.data as Record<string, unknown>),
        }
      } else if (
        dynamicRouteCall.error?.code !== 'PGRST202'
        && dynamicRouteCall.error?.code !== '42883'
      ) {
        console.error('Perception dynamic route persistence failed', {
          code: dynamicRouteCall.error?.code,
          message: dynamicRouteCall.error?.message,
        })
      }
    }

    const continuationRouteId = typeof runtimeResult.continuation_route_id === 'string'
      ? runtimeResult.continuation_route_id
      : null
    let activeRouteId = continuationRouteId ?? routeId
    const localExecutions: Array<Record<string, unknown>> = []

    if (projectId && objectiveId && activeRouteId) {
      const readyLocalNodes = routePlan.nodes
        .filter((node) =>
          node.status === 'ready'
          && (node.permissionLevel === 'P0' || node.permissionLevel === 'P1')
          && node.capability === 'generate'
        )
        .slice(0, 4)

      if (readyLocalNodes.length > 0) {
        const { data: persistedLocalNodes, error: persistedLocalNodesError } = await admin
          .from('perception_route_nodes')
          .select('id, label, outcome, capability, permission_level, status')
          .eq('project_id', projectId)
          .eq('route_id', activeRouteId)
          .in('capability', ['generate', 'verify'])
          .order('sort_order', { ascending: true })

        if (persistedLocalNodesError) {
          console.error('Perception local execution route-node lookup failed', {
            code: persistedLocalNodesError.code,
            message: persistedLocalNodesError.message,
          })
        } else {
          for (const plannedNode of readyLocalNodes) {
            const persistedNode = (persistedLocalNodes ?? []).find((candidate) =>
              candidate.capability === plannedNode.capability
              && candidate.label === plannedNode.label
              && candidate.outcome === plannedNode.outcome
            ) ?? (persistedLocalNodes ?? []).find((candidate) =>
              candidate.capability === plannedNode.capability
              && candidate.label === plannedNode.label
            )

            if (!persistedNode?.id) {
              localExecutions.push({
                node_key: plannedNode.key,
                ok: false,
                phase: 'blocked',
                failures: ['Persisted local route node could not be resolved.'],
              })
              continue
            }

            const leaseToken = crypto.randomUUID()
            const workerInput = {
              objective_id: objectiveId,
              objective: statement,
              desired_reality: meaning.desired_reality,
              current_reality: realityMap.currentReality,
              planned_outcome: plannedNode.outcome,
              route_id: activeRouteId,
            }
            const claimCall = await admin.rpc('perception_claim_local_node_internal', {
              p_user_id: userData.user.id,
              p_project_id: projectId,
              p_objective_id: objectiveId,
              p_route_id: activeRouteId,
              p_route_node_id: persistedNode.id,
              p_worker_key: 'local_generate_worker_v1',
              p_input: workerInput,
              p_lease_token: leaseToken,
              p_lease_seconds: 600,
              p_max_attempts: 3,
            })

            if (claimCall.error || !claimCall.data || typeof claimCall.data !== 'object') {
              localExecutions.push({
                node_key: plannedNode.key,
                ok: false,
                phase: 'blocked',
                failures: [claimCall.error?.message || 'Local worker claim failed.'],
              })
              continue
            }

            const claim = claimCall.data as Record<string, unknown>
            if (claim.claimed !== true) {
              const reason = typeof claim.reason === 'string' ? claim.reason : 'not_claimed'
              localExecutions.push({
                node_key: plannedNode.key,
                worker_run_id: typeof claim.worker_run_id === 'string' ? claim.worker_run_id : undefined,
                artifact_id: typeof claim.output_artifact_id === 'string' ? claim.output_artifact_id : undefined,
                ok: reason === 'already_succeeded' || reason === 'already_completed',
                phase: reason,
                retry_after: claim.retry_after,
                lease_expires_at: claim.lease_expires_at,
              })
              continue
            }

            const workerId = typeof claim.worker_run_id === 'string' ? claim.worker_run_id : ''
            if (!workerId) {
              localExecutions.push({
                node_key: plannedNode.key,
                ok: false,
                phase: 'blocked',
                failures: ['Local worker claim returned no worker id.'],
              })
              continue
            }
            const worker = { id: workerId }

            const localDecision = governTask({
              statement: plannedNode.outcome,
              capability: 'generate',
              risk: plannedNode.risk,
            })
            const localModelRoute = routeModelTargets(localDecision, configuredTargets, {
              risk: plannedNode.risk,
              mechanicallyVerifiable: true,
              costControlEnabled,
              budgetPressure,
            })

            const materialized = await materializeLocalArtifact({
              objective: statement,
              desiredReality: meaning.desired_reality,
              currentReality: realityMap.currentReality,
              outcome: plannedNode.outcome,
              constraints: meaning.constraints,
              successCriteria: [
                ...meaning.success_criteria,
                ...plannedNode.completionTests.map((test) => test.description),
              ],
              verifiedEvidence: realityMap.verifiedEvidence.slice(0, 20),
              candidates: localModelRoute.candidates,
              maxOutputTokens: localDecision.maxOutputTokens,
            })
            const verification = verifyLocalArtifact(materialized, plannedNode.outcome)

            for (const attempt of materialized.attempts) {
              if (!attempt.usage) continue
              const matchedTarget = configuredTargets.find(
                (target) => target.provider === attempt.provider && target.model === attempt.model,
              )
              const estimatedCostUsd = estimateCost(attempt.usage, matchedTarget?.price)
              const deepestPrice = configuredTargets
                .filter((target) => target.lane === 'deep' && target.price)
                .map((target) => target.price)[0]
              const baselineCostUsd = estimateCost(attempt.usage, deepestPrice) || estimatedCostUsd

              const usageCall = await admin.rpc('perception_record_token_usage_internal', {
                p_user_id: userData.user.id,
                p_project_id: projectId,
                p_objective_id: objectiveId,
                p_worker_run_id: worker.id,
                p_capability: 'generate',
                p_task_kind: 'local_generate_worker',
                p_provider: attempt.provider,
                p_model: attempt.model,
                p_budget_tier: localDecision.tier,
                p_input_tokens: attempt.usage.inputTokens,
                p_cached_input_tokens: attempt.usage.cachedInputTokens,
                p_output_tokens: attempt.usage.outputTokens,
                p_reasoning_tokens: attempt.usage.reasoningTokens,
                p_max_output_tokens: localDecision.maxOutputTokens,
                p_estimated_cost_usd: estimatedCostUsd,
                p_baseline_cost_usd: baselineCostUsd,
                p_request_id: null,
                p_metadata: {
                  ok: attempt.ok,
                  reason: attempt.reason ?? null,
                  protocol: attempt.protocol,
                  routing_strategy: 'verified-cheapest-first',
                  runtime: 'local_generate_worker_v1',
                },
              })

              if (usageCall.error) {
                console.error('Perception local worker token telemetry failed', {
                  code: usageCall.error.code,
                  message: usageCall.error.message,
                })
              }
            }

            if (!materialized.ok || !verification.passed) {
              const failures = Array.from(new Set([
                ...materialized.failures,
                ...verification.failures,
              ]))

              await admin
                .from('perception_verification_runs')
                .insert({
                  user_id: userData.user.id,
                  project_id: projectId,
                  route_node_id: persistedNode.id,
                  worker_run_id: worker.id,
                  passed: false,
                  evidence: [...materialized.evidence, ...verification.evidence],
                  details: {
                    kind: 'local_artifact_verification_v1',
                    node_key: plannedNode.key,
                    failures,
                  },
                })

              await failLocalWorker(
                worker.id,
                leaseToken,
                'verification_failed',
                failures.join(' '),
                30,
              )

              localExecutions.push({
                node_key: plannedNode.key,
                worker_run_id: worker.id,
                ok: false,
                phase: 'failed',
                failures,
              })
              continue
            }

            const { data: artifact, error: artifactError } = await admin
              .from('perception_artifacts')
              .insert({
                user_id: userData.user.id,
                project_id: projectId,
                objective_id: objectiveId,
                route_node_id: persistedNode.id,
                artifact_type: 'dynamic_local_artifact',
                title: plannedNode.outcome.slice(0, 500),
                content: materialized.content,
                metadata: {
                  worker_key: 'local_generate_worker_v1',
                  generated_title: materialized.title,
                  planned_outcome: plannedNode.outcome,
                  confidence: materialized.confidence,
                  completion_evidence: materialized.completionEvidence,
                  model_attempts: materialized.attempts,
                },
              })
              .select('id')
              .single()

            if (artifactError || !artifact?.id) {
              await failLocalWorker(
                worker.id,
                leaseToken,
                'artifact_persistence_failed',
                artifactError?.message || 'Artifact persistence failed.',
                30,
              )
              localExecutions.push({
                node_key: plannedNode.key,
                worker_run_id: worker.id,
                ok: false,
                phase: 'failed',
                failures: [artifactError?.message || 'Artifact persistence failed.'],
              })
              continue
            }

            const verificationEvidence = [
              ...materialized.evidence,
              ...verification.evidence,
              {
                kind: 'planned_completion_tests',
                tests: plannedNode.completionTests,
              },
            ]

            const { data: verificationRun, error: verificationError } = await admin
              .from('perception_verification_runs')
              .insert({
                user_id: userData.user.id,
                project_id: projectId,
                route_node_id: persistedNode.id,
                worker_run_id: worker.id,
                passed: true,
                evidence: verificationEvidence,
                details: {
                  kind: 'local_artifact_verification_v1',
                  node_key: plannedNode.key,
                  planned_outcome: plannedNode.outcome,
                  confidence: materialized.confidence,
                },
              })
              .select('id')
              .single()

            if (verificationError || !verificationRun?.id) {
              await failLocalWorker(
                worker.id,
                leaseToken,
                'verification_persistence_failed',
                verificationError?.message || 'Verification persistence failed.',
                30,
              )
              localExecutions.push({
                node_key: plannedNode.key,
                worker_run_id: worker.id,
                artifact_id: artifact.id,
                ok: false,
                phase: 'failed',
                failures: [verificationError?.message || 'Verification persistence failed.'],
              })
              continue
            }

            const verifiedSummary = `Verified bounded artifact created for: ${plannedNode.outcome}`
            const applyCall = await admin.rpc('perception_apply_verified_local_effect_leased_internal', {
              p_user_id: userData.user.id,
              p_project_id: projectId,
              p_objective_id: objectiveId,
              p_route_node_id: persistedNode.id,
              p_worker_run_id: worker.id,
              p_lease_token: leaseToken,
              p_artifact_id: artifact.id,
              p_summary: verifiedSummary,
              p_evidence: verificationEvidence,
            })

            if (applyCall.error) {
              await failLocalWorker(
                worker.id,
                leaseToken,
                'verified_effect_apply_failed',
                applyCall.error.message,
                30,
              )
              localExecutions.push({
                node_key: plannedNode.key,
                worker_run_id: worker.id,
                artifact_id: artifact.id,
                verification_id: verificationRun.id,
                ok: false,
                phase: 'failed',
                failures: [applyCall.error.message],
              })
              continue
            }

            const companionVerifyNodes = routePlan.nodes.filter((candidate) =>
              candidate.capability === 'verify'
              && candidate.dependencies.includes(plannedNode.key)
            )

            for (const verifyNode of companionVerifyNodes) {
              const persistedVerifyNode = (persistedLocalNodes ?? []).find((candidate) =>
                candidate.capability === 'verify'
                && candidate.label === verifyNode.label
                && candidate.outcome === verifyNode.outcome
              ) ?? (persistedLocalNodes ?? []).find((candidate) =>
                candidate.capability === 'verify'
                && candidate.label === verifyNode.label
              )

              if (persistedVerifyNode?.id) {
                await admin
                  .from('perception_route_nodes')
                  .update({ status: 'completed', blocker: null, updated_at: new Date().toISOString() })
                  .eq('id', persistedVerifyNode.id)

                await admin
                  .from('perception_model_events')
                  .insert({
                    user_id: userData.user.id,
                    project_id: projectId,
                    event_type: 'route_node.completed',
                    payload: {
                      objective_id: objectiveId,
                      route_node_id: persistedVerifyNode.id,
                      verified_route_node_id: persistedNode.id,
                      verification_id: verificationRun.id,
                      source: 'companion_verification_v0_4',
                    },
                  })
              }
            }

            localExecutions.push({
              node_key: plannedNode.key,
              worker_run_id: worker.id,
              artifact_id: artifact.id,
              verification_id: verificationRun.id,
              ok: true,
              phase: 'verified',
              confidence: materialized.confidence,
            })
          }
        }
      }

      if (localExecutions.length > 0) {
        const [
          refreshedProject,
          refreshedArtifacts,
          refreshedVerifications,
          refreshedEpistemic,
          refreshedExecution,
          refreshedNodes,
        ] = await Promise.all([
          admin
            .from('perception_projects')
            .select('current_reality, desired_reality')
            .eq('id', projectId)
            .eq('user_id', userData.user.id)
            .maybeSingle(),
          admin
            .from('perception_artifacts')
            .select('title, content, artifact_type')
            .eq('project_id', projectId)
            .eq('user_id', userData.user.id)
            .order('created_at', { ascending: false })
            .limit(100),
          admin
            .from('perception_verification_runs')
            .select('passed, details')
            .eq('project_id', projectId)
            .eq('user_id', userData.user.id)
            .order('checked_at', { ascending: false })
            .limit(100),
          admin
            .from('perception_epistemic_ledger')
            .select('statement, state, confidence, route_impact')
            .eq('project_id', projectId)
            .eq('user_id', userData.user.id)
            .order('created_at', { ascending: false })
            .limit(200),
          admin
            .from('perception_execution_ledger')
            .select('action_key, phase, details')
            .eq('project_id', projectId)
            .eq('user_id', userData.user.id)
            .order('created_at', { ascending: false })
            .limit(200),
          admin
            .from('perception_route_nodes')
            .select('blocker')
            .eq('project_id', projectId)
            .eq('route_id', activeRouteId)
            .eq('user_id', userData.user.id)
            .order('created_at', { ascending: false })
            .limit(200),
        ])

        realitySnapshot = {
          currentReality: refreshedProject.data?.current_reality || realitySnapshot.currentReality,
          desiredReality: refreshedProject.data?.desired_reality || realitySnapshot.desiredReality,
          artifacts: (refreshedArtifacts.data ?? []).map((artifact) => ({
            title: artifact.title || '',
            content: artifact.content,
            artifactType: artifact.artifact_type,
          })),
          verifications: (refreshedVerifications.data ?? []).map((verificationRow) => ({
            passed: Boolean(verificationRow.passed),
            details: verificationRow.details as Record<string, unknown> | null,
          })),
          epistemic: (refreshedEpistemic.data ?? []).map((claim) => ({
            statement: claim.statement || '',
            state: claim.state,
            confidence: Number(claim.confidence ?? 0),
            routeImpact: claim.route_impact,
          })) as ProjectRealitySnapshot['epistemic'],
          execution: (refreshedExecution.data ?? []).map((entry) => ({
            actionKey: entry.action_key || '',
            phase: entry.phase,
            details: entry.details as Record<string, unknown> | null,
          })) as ProjectRealitySnapshot['execution'],
          blockers: (refreshedNodes.data ?? [])
            .map((node) => node.blocker)
            .filter((blocker): blocker is string => typeof blocker === 'string' && blocker.trim().length > 0),
        }

        realityMap = mapProjectReality(plannerMeaning, realitySnapshot)
        const adaptedRoutePlan = planDynamicRealityRoute(plannerMeaning, realityMap, {
          availableCapabilities: plannerCapabilities,
        })

        const adaptationCall = await admin.rpc('perception_apply_dynamic_route_internal', {
          p_user_id: userData.user.id,
          p_project_id: projectId,
          p_objective_id: objectiveId,
          p_previous_route_id: activeRouteId,
          p_plan: adaptedRoutePlan,
        })

        if (!adaptationCall.error && adaptationCall.data && typeof adaptationCall.data === 'object') {
          runtimeResult = {
            ...runtimeResult,
            ...(adaptationCall.data as Record<string, unknown>),
          }
          const adaptedRouteId = (adaptationCall.data as Record<string, unknown>).continuation_route_id
          if (typeof adaptedRouteId === 'string') activeRouteId = adaptedRouteId
          routePlan = adaptedRoutePlan
        } else if (
          adaptationCall.error?.code !== 'PGRST202'
          && adaptationCall.error?.code !== '42883'
        ) {
          console.error('Perception adaptation route persistence failed', {
            code: adaptationCall.error?.code,
            message: adaptationCall.error?.message,
          })
        }
      }
    }

    const capabilityRouting = routePlannedCapabilities(routePlan.nodes, {
      githubOperatorAttached: operatorCapabilities.includes('code'),
    })

    const hasGitHubCodeRoute = capabilityRouting.some((decision) => decision.adapter === 'github-operator')
    const githubReadToken = (
      Deno.env.get('PERCEPTION_GITHUB_TOKEN')
      || Deno.env.get('PERCEPTION_OPERATOR_TOKEN')
      || ''
    ).trim()
    const codePlanDecision = hasGitHubCodeRoute
      ? governTask({ statement: meaning.desired_reality, capability: 'code', risk: 'medium' })
      : null
    const codePlanModelRoute = codePlanDecision
      ? routeModelTargets(codePlanDecision, configuredTargets, {
          risk: 'medium',
          mechanicallyVerifiable: true,
          costControlEnabled,
          budgetPressure,
        })
      : null

    let boundGitHubRepository: string | null = null
    if (projectId && capabilityRouting.some((decision) => decision.adapter === 'github-operator')) {
      const { data: bindings, error: bindingError } = await admin
        .from('perception_project_source_bindings')
        .select('source_id, relationship')
        .eq('user_id', userData.user.id)
        .eq('project_id', projectId)
        .eq('active', true)

      if (bindingError) {
        console.error('Perception GitHub source binding lookup failed', {
          code: bindingError.code,
          message: bindingError.message,
        })
      } else {
        const prioritizedBindings = [...(bindings ?? [])].sort((left, right) =>
          Number(right.relationship === 'primary') - Number(left.relationship === 'primary')
        )
        const sourceIds = prioritizedBindings
          .map((binding) => binding.source_id)
          .filter((sourceId): sourceId is string => typeof sourceId === 'string')

        if (sourceIds.length > 0) {
          const { data: sources, error: sourceError } = await admin
            .from('perception_sources')
            .select('id, locator')
            .in('id', sourceIds)
            .eq('provider', 'github')
            .eq('source_type', 'github_repo')
            .eq('enabled', true)

          if (sourceError) {
            console.error('Perception GitHub source lookup failed', {
              code: sourceError.code,
              message: sourceError.message,
            })
          } else {
            const sourceById = new Map((sources ?? []).map((source) => [source.id, source]))
            for (const binding of prioritizedBindings) {
              const source = sourceById.get(binding.source_id)
              const repository = repositoryFromGitHubLocator(source?.locator)
              if (repository) {
                boundGitHubRepository = repository
                break
              }
            }
          }
        }
      }
    }

    let persistedCodeRouteNodes: Array<{
      id: string
      label: string
      outcome: string
      permission_level: string
    }> = []

    if (projectId && activeRouteId && hasGitHubCodeRoute) {
      const { data: codeNodes, error: codeNodesError } = await admin
        .from('perception_route_nodes')
        .select('id, label, outcome, permission_level')
        .eq('project_id', projectId)
        .eq('route_id', activeRouteId)
        .eq('capability', 'code')

      if (codeNodesError) {
        console.error('Perception code-plan route-node lookup failed', {
          code: codeNodesError.code,
          message: codeNodesError.message,
        })
      } else {
        persistedCodeRouteNodes = (codeNodes ?? []) as typeof persistedCodeRouteNodes
      }
    }

    const actionContracts: Array<ReturnType<typeof buildGitHubActionContract>> = []
    const codePlanMaterializations: Array<Record<string, unknown>> = []
    const usageEvidence: Array<Record<string, unknown>> = []

    if (projectId) {
      for (const decision of capabilityRouting.filter((candidate) => candidate.executionMode === 'external')) {
        const routeNode = routePlan.nodes.find((node) => node.key === decision.nodeKey)
        let actionContract: ReturnType<typeof buildGitHubActionContract> | null = null

        if (decision.adapter === 'github-operator' && routeNode) {
          const draftContract = buildGitHubActionContract({
            decision,
            node: routeNode,
            projectId,
            objectiveId,
            routeId: activeRouteId,
            repository: boundGitHubRepository,
          })

          let filesOrPatch: Parameters<typeof buildGitHubActionContract>[0]['filesOrPatch'] = null
          let materializedTests: string[] = []
          let materializerResult: GitHubCodePlanResult | null = null
          const persistedRouteNode = persistedCodeRouteNodes.find((candidate) =>
            candidate.label === routeNode.label && candidate.outcome === routeNode.outcome
          ) ?? persistedCodeRouteNodes.find((candidate) => candidate.label === routeNode.label)
            ?? persistedCodeRouteNodes[0]
            ?? null

          const prerequisiteFailures = [
            ...(!boundGitHubRepository ? ['No bound GitHub repository is available in Project World.'] : []),
            ...(!persistedRouteNode ? ['The persisted code route node could not be resolved.'] : []),
            ...(!githubReadToken ? ['The server-side GitHub read credential is unavailable.'] : []),
            ...(!codePlanDecision || !codePlanModelRoute?.candidates.length
              ? ['No code-planning model route is available.']
              : []),
          ]

          if (prerequisiteFailures.length === 0 && boundGitHubRepository && persistedRouteNode && codePlanDecision && codePlanModelRoute) {
            const startedAt = new Date().toISOString()
            const { data: worker, error: workerError } = await admin
              .from('perception_worker_runs')
              .insert({
                user_id: userData.user.id,
                project_id: projectId,
                route_node_id: persistedRouteNode.id,
                worker_key: 'github_code_plan_materializer_v1',
                capability: 'code',
                permission_level: 'P1',
                status: 'running',
                input: {
                  repository: boundGitHubRepository,
                  base_branch: draftContract.base_branch,
                  desired_changes: routeNode.outcome,
                  completion_tests: routeNode.completionTests,
                },
                evidence: [],
                started_at: startedAt,
              })
              .select('id')
              .single()

            if (workerError || !worker?.id) {
              prerequisiteFailures.push(
                `Could not persist the P1 code-plan worker: ${workerError?.message || 'unknown error'}`,
              )
            } else {
              materializerResult = await materializeGitHubCodePlan({
                repository: boundGitHubRepository,
                baseBranch: draftContract.base_branch,
                desiredChanges: routeNode.outcome,
                completionTests: routeNode.completionTests.map((test) => test.description),
                githubToken: githubReadToken,
                candidates: codePlanModelRoute.candidates,
                maxOutputTokens: codePlanDecision.maxOutputTokens,
              })

              codePlanMaterializations.push({
                node_key: decision.nodeKey,
                worker_run_id: worker.id,
                ...materializerResult,
              })

              const deepestPrice = configuredTargets
                .filter((target) => target.lane === 'deep' && target.price)
                .map((target) => target.price)[0]

              for (const attempt of materializerResult.attempts) {
                if (!attempt.usage) continue
                const matchedTarget = configuredTargets.find(
                  (target) => target.provider === attempt.provider && target.model === attempt.model,
                )
                const estimatedCostUsd = estimateCost(attempt.usage, matchedTarget?.price)
                const baselineCostUsd = estimateCost(attempt.usage, deepestPrice) || estimatedCostUsd

                const usageCall = await admin.rpc('perception_record_token_usage_internal', {
                  p_user_id: userData.user.id,
                  p_project_id: projectId,
                  p_objective_id: objectiveId,
                  p_worker_run_id: worker.id,
                  p_capability: 'code',
                  p_task_kind: `code_plan_${attempt.stage}`,
                  p_provider: attempt.provider,
                  p_model: attempt.model,
                  p_budget_tier: codePlanDecision.tier,
                  p_input_tokens: attempt.usage.inputTokens,
                  p_cached_input_tokens: attempt.usage.cachedInputTokens,
                  p_output_tokens: attempt.usage.outputTokens,
                  p_reasoning_tokens: attempt.usage.reasoningTokens,
                  p_max_output_tokens: codePlanDecision.maxOutputTokens,
                  p_estimated_cost_usd: estimatedCostUsd,
                  p_baseline_cost_usd: baselineCostUsd,
                  p_request_id: null,
                  p_metadata: {
                    ok: attempt.ok,
                    reason: attempt.reason ?? null,
                    stage: attempt.stage,
                    protocol: attempt.protocol,
                    routing_strategy: 'verified-cheapest-first',
                  },
                })

                if (usageCall.error) {
                  console.error('Perception code-plan token telemetry failed', {
                    code: usageCall.error.code,
                    message: usageCall.error.message,
                  })
                }
              }

              if (materializerResult.ok) {
                const artifactPayload = {
                  version: 'github.code-plan.v1',
                  repository: materializerResult.repository,
                  base_branch: materializerResult.base_branch,
                  base_sha: materializerResult.base_sha,
                  tree_sha: materializerResult.tree_sha,
                  read_paths: materializerResult.read_paths,
                  write_paths: materializerResult.write_paths,
                  files: materializerResult.files,
                  tests: materializerResult.tests,
                  rationale: materializerResult.rationale,
                  confidence: materializerResult.confidence,
                }

                const { data: artifact, error: artifactError } = await admin
                  .from('perception_artifacts')
                  .insert({
                    user_id: userData.user.id,
                    project_id: projectId,
                    objective_id: objectiveId,
                    route_node_id: persistedRouteNode.id,
                    artifact_type: 'github_code_plan',
                    title: `Code plan: ${routeNode.label}`,
                    content: JSON.stringify(artifactPayload, null, 2),
                    metadata: {
                      worker_key: 'github_code_plan_materializer_v1',
                      repository: materializerResult.repository,
                      base_sha: materializerResult.base_sha,
                      tree_sha: materializerResult.tree_sha,
                      read_paths: materializerResult.read_paths,
                      write_paths: materializerResult.write_paths,
                      confidence: materializerResult.confidence,
                    },
                  })
                  .select('id')
                  .single()

                if (!artifactError && artifact?.id) {
                  const verificationEvidence = [
                    ...materializerResult.evidence,
                    {
                      kind: 'scope_verification',
                      expected_write_paths: materializerResult.write_paths,
                      generated_write_paths: materializerResult.files.map((file) => file.path),
                    },
                  ]

                  const { error: verificationError } = await admin
                    .from('perception_verification_runs')
                    .insert({
                      user_id: userData.user.id,
                      project_id: projectId,
                      route_node_id: persistedRouteNode.id,
                      worker_run_id: worker.id,
                      passed: true,
                      evidence: verificationEvidence,
                      details: {
                        kind: 'github_code_plan_materialization',
                        repository: materializerResult.repository,
                        base_sha: materializerResult.base_sha,
                        file_count: materializerResult.files.length,
                        tests: materializerResult.tests,
                      },
                    })

                  if (!verificationError) {
                    await admin
                      .from('perception_worker_runs')
                      .update({
                        status: 'succeeded',
                        output_artifact_id: artifact.id,
                        evidence: verificationEvidence,
                        finished_at: new Date().toISOString(),
                      })
                      .eq('id', worker.id)

                    filesOrPatch = {
                      kind: 'files',
                      files: materializerResult.files.map((file) => ({
                        path: file.path,
                        content: file.content,
                      })),
                    }
                    materializedTests = materializerResult.tests
                  } else {
                    prerequisiteFailures.push(
                      `Code-plan verification could not be persisted: ${verificationError.message}`,
                    )
                  }
                } else {
                  prerequisiteFailures.push(
                    `Code-plan artifact could not be persisted: ${artifactError?.message || 'unknown error'}`,
                  )
                }
              } else {
                const verificationEvidence = [
                  ...materializerResult.evidence,
                  ...materializerResult.failures.map((failure) => ({ kind: 'failure', failure })),
                ]
                await admin
                  .from('perception_verification_runs')
                  .insert({
                    user_id: userData.user.id,
                    project_id: projectId,
                    route_node_id: persistedRouteNode.id,
                    worker_run_id: worker.id,
                    passed: false,
                    evidence: verificationEvidence,
                    details: {
                      kind: 'github_code_plan_materialization',
                      failures: materializerResult.failures,
                    },
                  })
                prerequisiteFailures.push(...materializerResult.failures)
              }

              if (!filesOrPatch) {
                await admin
                  .from('perception_worker_runs')
                  .update({
                    status: 'failed',
                    evidence: [
                      ...(materializerResult?.evidence ?? []),
                      ...prerequisiteFailures.map((failure) => ({ kind: 'failure', failure })),
                    ],
                    finished_at: new Date().toISOString(),
                  })
                  .eq('id', worker.id)
              }
            }
          }

          if (prerequisiteFailures.length > 0 && !materializerResult) {
            codePlanMaterializations.push({
              node_key: decision.nodeKey,
              ok: false,
              phase: 'blocked',
              failures: prerequisiteFailures,
            })
          }

          let permissionGrantId: string | null = null
          if (draftContract.target && decision.permissionRequired) {
            const { data: grants, error: grantError } = await admin
              .from('perception_permission_grants')
              .select('id, permission_level, expires_at')
              .eq('user_id', userData.user.id)
              .eq('project_id', projectId)
              .eq('capability', 'code')
              .eq('target', draftContract.target)
              .is('revoked_at', null)

            if (grantError) {
              console.error('Perception action-contract permission lookup failed', {
                code: grantError.code,
                message: grantError.message,
              })
            } else {
              const rank: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
              const requestedRank = rank[decision.permissionLevel] ?? Number.POSITIVE_INFINITY
              const now = Date.now()
              const grant = (grants ?? []).find((candidate) => {
                const expiry = candidate.expires_at ? new Date(candidate.expires_at).getTime() : null
                return (rank[candidate.permission_level] ?? -1) >= requestedRank
                  && (expiry === null || expiry > now)
              })
              permissionGrantId = grant?.id ?? null
            }
          }

          actionContract = buildGitHubActionContract({
            decision,
            node: routeNode,
            projectId,
            objectiveId,
            routeId: activeRouteId,
            repository: boundGitHubRepository,
            baseSha: materializerResult?.base_sha ?? null,
            filesOrPatch,
            tests: materializedTests,
            permissionGrantId,
          })
          actionContracts.push(actionContract)
        }

        const { error: intentError } = await admin.from('perception_execution_ledger').insert({
          user_id: userData.user.id,
          project_id: projectId,
          objective_id: objectiveId,
          route_id: activeRouteId,
          route_node_id: null,
          worker_run_id: null,
          action_key: actionContract?.action_key
            ?? `capability_route:${objectiveId ?? crypto.randomUUID()}:${decision.nodeKey}`,
          phase: decision.status === 'blocked' ? 'blocked' : 'intended',
          permission_level: decision.permissionLevel,
          capability: decision.capability,
          target: actionContract?.target ?? null,
          details: {
            adapter: decision.adapter,
            routing_status: decision.status,
            execution_mode: decision.executionMode,
            permission_required: decision.permissionRequired,
            required_input_fields: decision.requiredInputFields,
            blockers: decision.blockers,
            action_contract: actionContract,
          },
          evidence: [],
        })

        if (intentError) {
          console.error('Perception capability-routing ledger telemetry failed', {
            code: intentError.code,
            message: intentError.message,
            node_key: decision.nodeKey,
          })
        }
      }

      const baseDecision = {
        user_id: userData.user.id,
        project_id: projectId,
        objective_id: objectiveId,
        capability: 'reason',
        budget_tier: tokenDecision.tier,
        model_lane: tokenDecision.modelLane,
        max_context_tokens: tokenDecision.maxContextTokens,
        max_output_tokens: tokenDecision.maxOutputTokens,
        estimated_input_tokens: tokenDecision.estimatedInputTokens,
        reasons: [...tokenDecision.reasons, ...modelRoute.reasons],
      }

      const extendedDecision = {
        ...baseDecision,
        selected_provider: meaning.provider,
        selected_model: meaning.model,
        routing_strategy: 'verified-cheapest-first',
        route_attempts: meaning.routing_attempts,
        daily_budget_usd: dailyBudgetUsd || null,
        spent_today_usd: spentTodayUsd,
        budget_pressure: budgetPressure,
      }

      let decisionInsert = await admin.from('perception_token_decisions').insert(extendedDecision)
      if (decisionInsert.error) {
        // Migration compatibility: old deployments do not yet have credit-aware telemetry columns.
        decisionInsert = await admin.from('perception_token_decisions').insert(baseDecision)
      }
      if (decisionInsert.error) {
        console.error('Perception token decision telemetry failed', {
          code: decisionInsert.error.code,
          message: decisionInsert.error.message,
        })
      }

      const deepestPrice = configuredTargets
        .filter((target) => target.lane === 'deep' && target.price)
        .map((target) => target.price)[0]

      for (const attempt of meaning.routing_attempts) {
        if (!attempt.usage) continue
        const matchedTarget = configuredTargets.find(
          (target) => target.provider === attempt.provider && target.model === attempt.model,
        )
        const estimatedCostUsd = estimateCost(attempt.usage, matchedTarget?.price)
        const baselineCostUsd = estimateCost(attempt.usage, deepestPrice) || estimatedCostUsd

        const usageCall = await admin.rpc('perception_record_token_usage_internal', {
          p_user_id: userData.user.id,
          p_project_id: projectId,
          p_objective_id: objectiveId,
          p_worker_run_id: null,
          p_capability: 'reason',
          p_task_kind: 'meaning_resolver',
          p_provider: attempt.provider,
          p_model: attempt.model,
          p_budget_tier: tokenDecision.tier,
          p_input_tokens: attempt.usage.inputTokens,
          p_cached_input_tokens: attempt.usage.cachedInputTokens,
          p_output_tokens: attempt.usage.outputTokens,
          p_reasoning_tokens: attempt.usage.reasoningTokens,
          p_max_output_tokens: tokenDecision.maxOutputTokens,
          p_estimated_cost_usd: estimatedCostUsd,
          p_baseline_cost_usd: baselineCostUsd,
          p_request_id: null,
          p_metadata: {
            ok: attempt.ok,
            reason: attempt.reason ?? null,
            lane: attempt.lane,
            protocol: attempt.protocol,
            routing_strategy: 'verified-cheapest-first',
          },
        })

        if (!usageCall.error && usageCall.data) {
          usageEvidence.push({ kind: 'token_usage', id: usageCall.data, model: attempt.model, provider: attempt.provider })
        }
      }

      const { error: ledgerError } = await admin.from('perception_execution_ledger').insert({
        user_id: userData.user.id,
        project_id: projectId,
        objective_id: objectiveId,
        route_id: routeId,
        route_node_id: null,
        worker_run_id: null,
        action_key: `model_route:meaning_resolver:${objectiveId ?? crypto.randomUUID()}`,
        phase: 'observed',
        permission_level: 'P0',
        capability: 'reason',
        target: 'meaning_resolver',
        details: {
          strategy: 'verified-cheapest-first',
          selected_provider: meaning.provider,
          selected_model: meaning.model,
          budget_tier: tokenDecision.tier,
          model_lane: tokenDecision.modelLane,
          hard_budget_stop: modelRoute.hardBudgetStop,
          daily_budget_usd: dailyBudgetUsd || null,
          spent_today_usd: spentTodayUsd,
          budget_pressure: budgetPressure,
          attempts: meaning.routing_attempts,
        },
        evidence: usageEvidence,
      })

      if (ledgerError) {
        console.error('Perception model-route ledger telemetry failed', {
          code: ledgerError.code,
          message: ledgerError.message,
        })
      }
    }

    return json({
      ...runtimeResult,
      meaning,
      reality_map: realityMap,
      route_plan: routePlan,
      capability_routing: capabilityRouting,
      action_contracts: actionContracts,
      local_executions: localExecutions,
      adaptation: {
        remapped_after_local_execution: localExecutions.length > 0,
        active_route_id: activeRouteId,
      },
      code_plan_materializations: codePlanMaterializations,
      continuation: {
        resumed: Boolean(resumeObjective),
        reused_existing_route: Boolean(resumeObjective && routeId),
        active_route_id: activeRouteId,
      },
      token_control: {
        enabled: costControlEnabled,
        budget_tier: tokenDecision.tier,
        model_lane: tokenDecision.modelLane,
        max_context_tokens: tokenDecision.maxContextTokens,
        max_output_tokens: tokenDecision.maxOutputTokens,
        estimated_input_tokens: tokenDecision.estimatedInputTokens,
        selected_provider: meaning.provider,
        selected_model: meaning.model,
        routing_strategy: 'verified-cheapest-first',
        hard_budget_stop: modelRoute.hardBudgetStop,
        daily_budget_usd: dailyBudgetUsd || null,
        spent_today_usd: spentTodayUsd,
        budget_pressure: budgetPressure,
        attempts: meaning.routing_attempts,
      },
    })
  } catch (error) {
    console.error('Perception edge failure', error instanceof Error ? error.message : 'unknown error')
    return json({ error: 'Unexpected runtime failure' }, 500)
  }
})
