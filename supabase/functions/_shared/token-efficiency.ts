export type TokenBudgetTier = 'tiny' | 'normal' | 'deep' | 'max'
export type ModelLane = 'economy' | 'balanced' | 'deep'

export type TokenDecision = {
  tier: TokenBudgetTier
  modelLane: ModelLane
  maxContextTokens: number
  maxOutputTokens: number
  estimatedInputTokens: number
  reasons: string[]
}

const budgets: Record<TokenBudgetTier, Omit<TokenDecision, 'tier' | 'estimatedInputTokens' | 'reasons'>> = {
  tiny: { maxContextTokens: 1_000, maxOutputTokens: 240, modelLane: 'economy' },
  normal: { maxContextTokens: 4_000, maxOutputTokens: 700, modelLane: 'economy' },
  deep: { maxContextTokens: 12_000, maxOutputTokens: 1_800, modelLane: 'balanced' },
  max: { maxContextTokens: 32_000, maxOutputTokens: 4_000, modelLane: 'deep' },
}

const ranks: TokenBudgetTier[] = ['tiny', 'normal', 'deep', 'max']

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
