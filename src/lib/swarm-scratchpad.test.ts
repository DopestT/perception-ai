import { describe, expect, it } from 'vitest'
import { SwarmScratchpad, type ScratchScope } from './swarm-scratchpad'

const time = 1_800_000_000_000
const owner: ScratchScope = {
  projectId: 'perception-project',
  objectiveId: 'objective-1',
  taskId: 'task-code-1',
  agentId: 'backend-worker',
}
const otherProject = { ...owner, projectId: 'unrelated-project' }
const otherTask = { ...owner, taskId: 'task-code-2' }
const otherAgent = { ...owner, agentId: 'interface-worker' }

const note = {
  key: 'compile-check',
  kind: 'test-result' as const,
  summary: 'TypeScript reported a missing import at line 42; inspect module boundary',
  sourceRef: 'github://DopestT/perception-ai/src/App.tsx',
}

describe('PERCEPTION short-lived coding scratchpad', () => {
  it('keeps a coding note only in the owner task and project', () => {
    const cache = new SwarmScratchpad()
    cache.put(owner, note, time)
    expect(cache.read(owner, time)).toHaveLength(1)
    for (const scope of [otherProject, otherTask, otherAgent]) {
      expect(cache.read(scope, time)).toEqual([])
    }
  })

  it('expires notes automatically at their TTL and does not restore them', () => {
    const cache = new SwarmScratchpad()
    const saved = cache.put(owner, { ...note, ttlMs: 1_000 }, time)
    expect(saved.expiresAt).toBe(time + 1_000)
    expect(cache.read(owner, time + 999)).toHaveLength(1)
    expect(cache.read(owner, time + 1_000)).toEqual([])
    expect(cache.read(owner, time + 1_500)).toEqual([])
  })

  it('does not expose an ordinary working note to reviewers', () => {
    const cache = new SwarmScratchpad()
    cache.put(owner, { ...note, kind: 'code-context' }, time)
    expect(cache.readForReview(owner, 'qa-reviewer', time)).toEqual([])
  })

  it('shares only explicitly marked handoffs with independent reviewers', () => {
    const cache = new SwarmScratchpad()
    cache.put(owner, { ...note, key: 'private', kind: 'code-context' }, time)
    cache.put(owner, { ...note, key: 'handoff', kind: 'handoff', sharedForReview: true }, time)
    const handoff = cache.readForReview(owner, 'qa-reviewer', time)
    expect(handoff.map(item => item.key)).toEqual(['handoff'])
    expect(() => cache.readForReview(owner, owner.agentId, time)).toThrow('review_access_denied')
    expect(() => cache.readForReview(owner, 'interface-worker', time)).toThrow('review_access_denied')
  })

  it('rejects sharing arbitrary code context without an explicit reviewed handoff', () => {
    const cache = new SwarmScratchpad()
    expect(() => cache.put(owner, { ...note, kind: 'code-context', sharedForReview: true }, time))
      .toThrow('review_share_requires_handoff_or_test_result')
  })

  it('rejects credentials and likely sensitive strings without persisting them', () => {
    const cache = new SwarmScratchpad()
    for (const summary of [
      'password=supersecretnumber',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      'api_key: example-leak-value',
      '-----BEGIN PRIVATE KEY-----',
      'ghp_0123456789abcdefghijklmnop',
    ]) {
      expect(() => cache.put(owner, { ...note, summary }, time)).toThrow('invalid_or_sensitive_scratch_content')
    }
    expect(cache.read(owner, time)).toEqual([])
  })

  it('enforces strict size, lifetime, and invalid-scope bounds', () => {
    const cache = new SwarmScratchpad()
    expect(() => cache.put(owner, { ...note, ttlMs: 60 * 60 * 1000 + 1 }, time))
      .toThrow('invalid_scratch_ttl')
    expect(() => cache.put(owner, { ...note, ttlMs: 0 }, time)).toThrow('invalid_scratch_ttl')
    expect(() => cache.put(owner, { ...note, summary: 'x'.repeat(1601) }, time))
      .toThrow('invalid_or_sensitive_scratch_content')
    expect(() => cache.put({ ...owner, projectId: '../other' }, note, time))
      .toThrow('invalid_scratch_scope')
    expect(cache.read(owner, time)).toEqual([])
  })

  it('cannot grow without bounds or silently evict another worker task', () => {
    const cache = new SwarmScratchpad()
    for (let i = 0; i < 24; i++) cache.put(owner, { ...note, key: 'memo-' + i }, time)
    expect(cache.read(owner, time)).toHaveLength(24)
    expect(() => cache.put(owner, { ...note, key: 'overflow' }, time)).toThrow('scratch_budget_exceeded')
    // Other scopes are still isolated and have independent quota.
    cache.put(otherTask, { ...note, key: 'new-task' }, time)
    expect(cache.read(otherTask, time)).toHaveLength(1)
  })

  it('supports explicit clearing of one task or all memory', () => {
    const cache = new SwarmScratchpad()
    cache.put(owner, note, time)
    cache.put(otherTask, { ...note, key: 'different' }, time)
    expect(cache.clearTask(owner)).toBe(1)
    expect(cache.read(owner, time)).toEqual([])
    expect(cache.read(otherTask, time)).toHaveLength(1)
    cache.clearAll()
    expect(cache.read(otherTask, time)).toEqual([])
  })

  it('never provides verification or authority based on cached statements', () => {
    const cache = new SwarmScratchpad()
    const saved = cache.put(owner, {
      ...note,
      key: 'claimed-success',
      summary: 'Worker says task finished; must independently verify',
    }, time)
    expect('verified' in saved).toBe(false)
    expect('permissionLevel' in saved).toBe(false)
  })
})
