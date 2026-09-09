export type TokenBudgetTier = 'tiny' | 'normal' | 'deep' | 'max'
export type ModelLane = 'economy' | 'balanced' | 'deep'

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

const budgets: Record<TokenBudgetTier, Omit<TokenBudget, 'tier'>> = {
  tiny: { maxContextTokens: 1_000, maxOutputTokens: 240, modelLane: 'economy' },
  normal: { maxContextTokens: 4_000, maxOutputTokens: 700, modelLane: 'economy' },
  deep: { maxContextTokens: 12_000, maxOutputTokens: 1_800, modelLane: 'balanced' },
  max: { maxContextTokens: 32_000, maxOutputTokens: 4_000, modelLane: 'deep' },
}

const tierRank: Record<TokenBudgetTier, number> = { tiny: 0, normal: 1, deep: 2, max: 3 }
const rankTier: TokenBudgetTier[] = ['tiny', 'normal', 'deep', 'max']

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
