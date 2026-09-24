export type TokenBudgetTier = 'tiny' | 'normal' | 'deep' | 'max'
export type ModelLane = 'economy' | 'balanced' | 'deep'
export type ModelProvider = 'local' | 'openai' | 'openai_compatible'
export type ModelProtocol = 'responses' | 'chat_completions'

export type TokenBudget = {
  tier: TokenBudgetTier
  maxContextTokens: number
  maxOutputTokens: number
  modelLane: ModelLane
}

export type TaskProfile = {
  statement: string
  capability?:
    | 'reason'
    | 'research'
    | 'retrieve'
    | 'generate'
    | 'edit'
    | 'code'
    | 'communicate'
    | 'schedule'
    | 'calculate'
    | 'verify'
  risk?: 'low' | 'medium' | 'high'
  requestedTier?: TokenBudgetTier
}

export type TokenDecision = TokenBudget & {
  estimatedInputTokens: number
  reasons: string[]
}

export type ContextItem = {
  id: string
  content: string
  relevance: number
  priority?: number
  mandatory?: boolean
  cacheable?: boolean
}

export type SelectedContext = {
  items: ContextItem[]
  estimatedTokens: number
  droppedIds: string[]
  duplicateIds: string[]
}

export type ModelPrice = {
  inputUsdPerMillion: number
  cachedInputUsdPerMillion: number
  outputUsdPerMillion: number
}

export type TokenUsage = {
  inputTokens: number
  cachedInputTokens?: number
  outputTokens: number
}

export type ModelTarget = {
  id: string
  provider: ModelProvider
  model: string
  lane: ModelLane
  protocol?: ModelProtocol
  enabled?: boolean
  baseUrl?: string
  price?: ModelPrice
}

export type ModelRoutingOptions = {
  risk?: 'low' | 'medium' | 'high'
  mechanicallyVerifiable?: boolean
  costControlEnabled?: boolean
  budgetPressure?: number
  verificationFailures?: number
}

export type ModelRoute = {
  preferredLane: ModelLane
  candidates: ModelTarget[]
  hardBudgetStop: boolean
  reasons: string[]
}

const budgets: Record<TokenBudgetTier, Omit<TokenBudget, 'tier'>> = {
  tiny: { maxContextTokens: 1_000, maxOutputTokens: 240, modelLane: 'economy' },
  normal: { maxContextTokens: 4_000, maxOutputTokens: 700, modelLane: 'economy' },
  deep: { maxContextTokens: 12_000, maxOutputTokens: 1_800, modelLane: 'balanced' },
  max: { maxContextTokens: 32_000, maxOutputTokens: 4_000, modelLane: 'deep' },
}

const tierRank: Record<TokenBudgetTier, number> = { tiny: 0, normal: 1, deep: 2, max: 3 }
const rankTier: TokenBudgetTier[] = ['tiny', 'normal', 'deep', 'max']
const laneRank: Record<ModelLane, number> = { economy: 0, balanced: 1, deep: 2 }
const rankLane: ModelLane[] = ['economy', 'balanced', 'deep']

export function estimateTokens(text: string): number {
  const normalized = text.trim()
  if (!normalized) return 0
  return Math.max(1, Math.ceil(normalized.length / 4))
}

function upgradeTier(tier: TokenBudgetTier, levels = 1): TokenBudgetTier {
  return rankTier[Math.min(rankTier.length - 1, tierRank[tier] + levels)]
}

export function governTask(profile: TaskProfile): TokenDecision {
  const statement = profile.statement.trim()
  const estimatedInputTokens = estimateTokens(statement)
  const reasons: string[] = []

  let tier: TokenBudgetTier = 'tiny'
  const capability = profile.capability ?? 'reason'

  if (['research', 'generate', 'edit', 'verify'].includes(capability)) {
    tier = 'normal'
    reasons.push(`${capability} usually needs more working context`)
  }
  if (['code'].includes(capability)) {
    tier = 'deep'
    reasons.push('code work benefits from deeper context and verification room')
  }

  if (estimatedInputTokens > 900) {
    tier = upgradeTier(tier)
    reasons.push('input is larger than the tiny-context target')
  }
  if (estimatedInputTokens > 3_500) {
    tier = upgradeTier(tier)
    reasons.push('input is large enough to justify deeper context')
  }

  if (profile.risk === 'medium') {
    tier = upgradeTier(tier)
    reasons.push('medium-risk work receives an additional verification budget')
  } else if (profile.risk === 'high') {
    tier = upgradeTier(tier, 2)
    reasons.push('high-risk work receives a substantially larger verification budget')
  }

  if (profile.requestedTier && tierRank[profile.requestedTier] > tierRank[tier]) {
    tier = profile.requestedTier
    reasons.push(`caller explicitly requested ${profile.requestedTier} depth`)
  }

  if (reasons.length === 0) reasons.push('routine task fits the smallest safe budget')

  return {
    tier,
    ...budgets[tier],
    estimatedInputTokens,
    reasons,
  }
}

function normalizeForDedupe(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function contextScore(item: ContextItem): number {
  const relevance = Math.max(0, Math.min(1, item.relevance))
  const priority = Math.max(0.05, item.priority ?? 1)
  return relevance * priority
}

export function selectContext(items: ContextItem[], maxTokens: number): SelectedContext {
  const duplicateIds: string[] = []
  const deduped: ContextItem[] = []
  const seen = new Set<string>()

  for (const item of items) {
    const key = normalizeForDedupe(item.content)
    if (!key) continue
    if (seen.has(key)) {
      duplicateIds.push(item.id)
      continue
    }
    seen.add(key)
    deduped.push(item)
  }

  const mandatory = deduped.filter((item) => item.mandatory)
  const optional = deduped
    .filter((item) => !item.mandatory)
    .sort((a, b) => contextScore(b) - contextScore(a))

  const selected: ContextItem[] = []
  const droppedIds: string[] = []
  let estimatedTokens = 0

  for (const item of mandatory) {
    const tokens = estimateTokens(item.content)
    if (estimatedTokens + tokens <= maxTokens) {
      selected.push(item)
      estimatedTokens += tokens
    } else {
      droppedIds.push(item.id)
    }
  }

  for (const item of optional) {
    const tokens = estimateTokens(item.content)
    if (estimatedTokens + tokens <= maxTokens) {
      selected.push(item)
      estimatedTokens += tokens
    } else {
      droppedIds.push(item.id)
    }
  }

  return { items: selected, estimatedTokens, droppedIds, duplicateIds }
}

function uniqueTargets(targets: ModelTarget[]): ModelTarget[] {
  const seen = new Set<string>()
  return targets.filter((target) => {
    if (target.enabled === false || !target.model.trim()) return false
    const key = `${target.provider}:${target.baseUrl ?? ''}:${target.model}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function routeModelTargets(
  decision: TokenDecision,
  targets: ModelTarget[],
  options: ModelRoutingOptions = {},
): ModelRoute {
  const risk = options.risk ?? 'low'
  const mechanicallyVerifiable = options.mechanicallyVerifiable ?? false
  const costControlEnabled = options.costControlEnabled ?? true
  const verificationFailures = Math.max(0, options.verificationFailures ?? 0)
  const budgetPressure = Math.max(0, options.budgetPressure ?? 0)
  const reasons: string[] = []

  let preferredRank = laneRank[decision.modelLane]

  if (!costControlEnabled) {
    preferredRank = 2
    reasons.push('automatic cost control is disabled; prefer the deepest configured model')
  } else if (verificationFailures > 0) {
    preferredRank = Math.min(2, preferredRank + verificationFailures)
    reasons.push(`verification failed ${verificationFailures} time(s); escalate model strength`)
  } else {
    if (mechanicallyVerifiable && risk === 'low' && preferredRank > 0) {
      preferredRank -= 1
      reasons.push('low-risk output can start one lane cheaper because it has mechanical verification')
    }
    if (budgetPressure >= 0.8 && budgetPressure < 1 && risk === 'low' && preferredRank > 0) {
      preferredRank -= 1
      reasons.push('daily budget is above 80%; prefer a cheaper lane where verification keeps risk bounded')
    }
  }

  const hardBudgetStop = costControlEnabled && budgetPressure >= 1 && risk === 'low'
  if (hardBudgetStop) reasons.push('daily budget is exhausted; paid models are blocked for low-risk work')

  const available = uniqueTargets(targets)
  let candidates: ModelTarget[]

  if (hardBudgetStop) {
    candidates = available.filter((target) => target.provider === 'local')
  } else if (!costControlEnabled) {
    candidates = [...available].sort((a, b) => laneRank[b.lane] - laneRank[a.lane])
  } else {
    candidates = available
      .filter((target) => {
        if (target.provider === 'local') {
          return preferredRank === 0 && mechanicallyVerifiable && risk === 'low' && verificationFailures === 0
        }
        return laneRank[target.lane] >= preferredRank
      })
      .sort((a, b) => {
        const aRank = a.provider === 'local' ? -1 : laneRank[a.lane]
        const bRank = b.provider === 'local' ? -1 : laneRank[b.lane]
        return aRank - bRank
      })
  }

  if (candidates.length === 0 && !hardBudgetStop && available.length > 0) {
    const strongest = [...available].sort((a, b) => laneRank[b.lane] - laneRank[a.lane])[0]
    candidates = strongest ? [strongest] : []
    reasons.push('preferred lane is unavailable; use the strongest configured fallback')
  }

  const preferredLane = rankLane[preferredRank]
  if (!reasons.length) reasons.push(`start on the ${preferredLane} lane and escalate only after verification failure`)

  return { preferredLane, candidates, hardBudgetStop, reasons }
}

export function estimateCostUsd(usage: TokenUsage, price: ModelPrice): number {
  const cached = Math.max(0, Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens))
  const uncached = Math.max(0, usage.inputTokens - cached)
  const cost =
    (uncached * price.inputUsdPerMillion +
      cached * price.cachedInputUsdPerMillion +
      usage.outputTokens * price.outputUsdPerMillion) /
    1_000_000
  return Number(cost.toFixed(8))
}

export function cacheRatio(usage: TokenUsage): number {
  if (usage.inputTokens <= 0) return 0
  return Math.max(0, Math.min(1, (usage.cachedInputTokens ?? 0) / usage.inputTokens))
}
