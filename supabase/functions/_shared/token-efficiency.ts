export type TokenBudgetTier = 'tiny' | 'normal' | 'deep' | 'max'
export type ModelLane = 'economy' | 'balanced' | 'deep'
export type ModelProvider = 'local' | 'openai' | 'openai_compatible'
export type ModelProtocol = 'responses' | 'chat_completions'

export type TokenDecision = {
  tier: TokenBudgetTier
  modelLane: ModelLane
  maxContextTokens: number
  maxOutputTokens: number
  estimatedInputTokens: number
  reasons: string[]
}

export type ModelPrice = {
  inputUsdPerMillion: number
  cachedInputUsdPerMillion: number
  outputUsdPerMillion: number
}

export type ModelTarget = {
  id: string
  provider: ModelProvider
  model: string
  lane: ModelLane
  protocol?: ModelProtocol
  enabled?: boolean
  baseUrl?: string
  apiKey?: string
  price?: ModelPrice
}

export type ModelRoute = {
  preferredLane: ModelLane
  candidates: ModelTarget[]
  hardBudgetStop: boolean
  reasons: string[]
}

const budgets: Record<TokenBudgetTier, Omit<TokenDecision, 'tier' | 'estimatedInputTokens' | 'reasons'>> = {
  tiny: { maxContextTokens: 1_000, maxOutputTokens: 240, modelLane: 'economy' },
  normal: { maxContextTokens: 4_000, maxOutputTokens: 700, modelLane: 'economy' },
  deep: { maxContextTokens: 12_000, maxOutputTokens: 1_800, modelLane: 'balanced' },
  max: { maxContextTokens: 32_000, maxOutputTokens: 4_000, modelLane: 'deep' },
}

const ranks: TokenBudgetTier[] = ['tiny', 'normal', 'deep', 'max']
const laneRank: Record<ModelLane, number> = { economy: 0, balanced: 1, deep: 2 }
const rankLane: ModelLane[] = ['economy', 'balanced', 'deep']

function estimateTokens(text: string) {
  const value = text.trim()
  return value ? Math.max(1, Math.ceil(value.length / 4)) : 0
}

function upgrade(tier: TokenBudgetTier, levels = 1): TokenBudgetTier {
  return ranks[Math.min(ranks.length - 1, ranks.indexOf(tier) + levels)]
}

export function governTask(input: {
  statement: string
  capability?: string
  risk?: 'low' | 'medium' | 'high'
}): TokenDecision {
  const capability = input.capability ?? 'reason'
  const estimatedInputTokens = estimateTokens(input.statement)
  const reasons: string[] = []
  let tier: TokenBudgetTier = 'tiny'

  if (['research', 'generate', 'edit', 'verify'].includes(capability)) {
    tier = 'normal'
    reasons.push(`${capability} receives a normal working budget`)
  }
  if (capability === 'code') {
    tier = 'deep'
    reasons.push('code work receives deeper context')
  }
  if (estimatedInputTokens > 900) {
    tier = upgrade(tier)
    reasons.push('input exceeds the tiny-context target')
  }
  if (estimatedInputTokens > 3_500) {
    tier = upgrade(tier)
    reasons.push('large input requires additional context room')
  }
  if (input.risk === 'medium') {
    tier = upgrade(tier)
    reasons.push('medium risk adds verification room')
  }
  if (input.risk === 'high') {
    tier = upgrade(tier, 2)
    reasons.push('high risk adds substantial verification room')
  }
  if (!reasons.length) reasons.push('routine task fits the smallest safe budget')

  return { tier, ...budgets[tier], estimatedInputTokens, reasons }
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
  options: {
    risk?: 'low' | 'medium' | 'high'
    mechanicallyVerifiable?: boolean
    costControlEnabled?: boolean
    budgetPressure?: number
    verificationFailures?: number
  } = {},
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
