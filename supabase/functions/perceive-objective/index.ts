import { createClient } from 'npm:@supabase/supabase-js@2'
import { governTask, routeModelTargets, type ModelPrice, type ModelProtocol, type ModelTarget } from '../_shared/token-efficiency.ts'
import { resolveObjectiveMeaning } from '../_shared/meaning-resolver.ts'
import { planInitialRealityRoute } from '../_shared/reality-planner.ts'

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

    const payload = await req.json().catch(() => null) as { statement?: unknown } | null
    const statement = typeof payload?.statement === 'string' ? payload.statement.trim() : ''
    if (statement.length < 3) return json({ error: 'Objective must contain at least 3 characters' }, 400)
    if (statement.length > 10000) return json({ error: 'Objective is too long' }, 413)

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

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

    const meaning = await resolveObjectiveMeaning(statement, {
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

    const routePlan = planInitialRealityRoute({
      desiredReality: meaning.desired_reality,
      currentReality: meaning.current_reality,
      constraints: meaning.constraints,
      successCriteria: meaning.success_criteria,
      deliverables: meaning.deliverables,
      knownUnknowns: meaning.known_unknowns,
    }, {
      availableCapabilities: availableCapabilities.filter((capability) =>
        ['reason', 'research', 'retrieve', 'generate', 'edit', 'code', 'communicate', 'schedule', 'calculate', 'verify']
          .includes(capability)
      ) as Array<'reason' | 'research' | 'retrieve' | 'generate' | 'edit' | 'code' | 'communicate' | 'schedule' | 'calculate' | 'verify'>,
    })

    let runtimeData: unknown
    let runtimeError: { code?: string; message?: string } | null = null

    const plannedCall = await admin.rpc('perception_submit_planned_objective_internal', {
      p_user_id: userData.user.id,
      p_statement: statement,
      p_semantics: meaning,
      p_plan: routePlan,
    })

    runtimeData = plannedCall.data
    runtimeError = plannedCall.error

    // Roll back one runtime generation at a time so previews remain functional before migrations land.
    if (runtimeError?.code === 'PGRST202' || runtimeError?.code === '42883') {
      const resolvedCall = await admin.rpc('perception_submit_resolved_objective_internal', {
        p_user_id: userData.user.id,
        p_statement: statement,
        p_semantics: meaning,
      })
      runtimeData = resolvedCall.data
      runtimeError = resolvedCall.error
    }

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

    const runtimeResult = runtimeData && typeof runtimeData === 'object' && !Array.isArray(runtimeData)
      ? runtimeData as Record<string, unknown>
      : {}
    const projectId = typeof runtimeResult.project_id === 'string' ? runtimeResult.project_id : null
    const objectiveId = typeof runtimeResult.objective_id === 'string' ? runtimeResult.objective_id : null
    const routeId = typeof runtimeResult.route_id === 'string' ? runtimeResult.route_id : null

    const usageEvidence: Array<Record<string, unknown>> = []

    if (projectId) {
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
      route_plan: routePlan,
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
