import { describe, expect, it } from 'vitest'
import {
  cacheRatio,
  estimateCostUsd,
  governTask,
  selectContext,
} from './token-efficiency'

describe('token efficiency governor', () => {
  it('keeps routine work on the tiny economy lane', () => {
    const decision = governTask({ statement: 'Format this result as JSON.', capability: 'communicate', risk: 'low' })
    expect(decision.tier).toBe('tiny')
    expect(decision.modelLane).toBe('economy')
    expect(decision.maxContextTokens).toBe(1_000)
  })

  it('upgrades code work without jumping straight to max', () => {
    const decision = governTask({ statement: 'Implement the worker queue.', capability: 'code', risk: 'low' })
    expect(decision.tier).toBe('deep')
    expect(decision.modelLane).toBe('balanced')
  })

  it('reserves larger budgets for high-risk work', () => {
    const decision = governTask({ statement: 'Verify this irreversible production change.', capability: 'verify', risk: 'high' })
    expect(decision.tier).toBe('max')
    expect(decision.modelLane).toBe('deep')
  })

  it('deduplicates context and drops lower value material first', () => {
    const result = selectContext(
      [
        { id: 'system', content: 'Permanent project rule', relevance: 1, mandatory: true },
        { id: 'duplicate', content: ' permanent   project rule ', relevance: 0.9 },
        { id: 'high', content: 'A'.repeat(800), relevance: 1, priority: 2 },
        { id: 'low', content: 'B'.repeat(800), relevance: 0.1 },
      ],
      250,
    )

    expect(result.items.map((item) => item.id)).toContain('system')
    expect(result.items.map((item) => item.id)).toContain('high')
    expect(result.duplicateIds).toContain('duplicate')
    expect(result.droppedIds).toContain('low')
  })

  it('prices cached tokens separately and reports cache ratio', () => {
    const usage = { inputTokens: 1_000_000, cachedInputTokens: 750_000, outputTokens: 100_000 }
    const price = { inputUsdPerMillion: 4, cachedInputUsdPerMillion: 0.4, outputUsdPerMillion: 20 }
    expect(estimateCostUsd(usage, price)).toBe(3.3)
    expect(cacheRatio(usage)).toBe(0.75)
  })
})
