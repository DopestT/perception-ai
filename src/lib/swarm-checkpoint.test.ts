import { describe, expect, it } from 'vitest'
import {
  createSwarmCheckpoint,
  restoreSwarmCheckpoint,
  type CheckpointState,
  type SwarmCheckpoint,
} from './swarm-checkpoint'
import type { WorkforceTaskContract } from './workforce-task-contract'

const now = Date.parse('2026-11-13T07:00:00.000Z')
const task: WorkforceTaskContract = {
  taskId: 'code-001',
  projectId: 'perception-project',
  objectiveId: 'objective-001',
  routeNodeId: 'node-001',
  ownerAgentId: 'backend-worker',
  reviewerAgentId: 'qa-reviewer',
  goal: 'Draft the typed task checkpoint format',
  inputEvidenceRefs: ['github://DopestT/perception-ai@main'],
  allowedFiles: ['src/lib/swarm-checkpoint.ts'],
  forbiddenFiles: ['.env', 'supabase/migrations'],
  completionTests: ['typescript build passes', 'independent reviewer checks artifact'],
  dependencyIds: [],
  permissionLevel: 'P1',
  deadlineAt: '2026-11-24T07:00:00.000Z',
  maxAttempts: 2,
  maxTokens: 0,
  maxCostUsd: 0,
}
const state: CheckpointState = {
  stage: 'in_progress',
  nextSafeAction: 'Inspect test results before editing more files',
  notes: [
    {
      topic: 'code-map',
      summary: 'Checkpoint module lives in src/lib and must remain pure TypeScript',
      sourceRef: 'github://DopestT/perception-ai/src/lib/swarm-checkpoint.ts',
      verified: false,
    },
  ],
  artifactRefs: ['github://DopestT/perception-ai/pull/107'],
}

describe('temporary PERCEPTION bots: recover task context only', () => {
  it('serializes a checkpoint for a disposable coding worker and restores to a fresh instance', () => {
    const initial = createSwarmCheckpoint(task, state, now)
    const encoded = JSON.stringify(initial)
    const savedByTrustedSystem = JSON.parse(encoded) as unknown
    const restored = restoreSwarmCheckpoint(task, savedByTrustedSystem, now + 5 * 60 * 1000)
    expect(restored.ready).toBe(true)
    if (!restored.ready) return
    expect(restored.brief.taskId).toBe(task.taskId)
    expect(restored.brief.agentId).toBe(task.ownerAgentId)
    expect(restored.brief.nextSafeAction).toBe(state.nextSafeAction)
    expect(restored.brief.contextNotes[0].verified).toBe(false)
    expect(restored.brief.instruction).toContain('untrusted task context')
    expect('credential' in restored.brief).toBe(false)
    expect('modelSessionId' in restored.brief).toBe(false)
  })

  it('supports a subsequent checkpoint revision when no worker remains alive', () => {
    const first = createSwarmCheckpoint(task, state, now)
    const next = createSwarmCheckpoint(task, {
      ...state,
      expectedRevision: first.revision,
      nextSafeAction: 'Review the draft patch, then produce a handoff',
      stage: 'awaiting_review',
    }, now + 60_000, first)
    expect(next.revision).toBe(2)
    const restored = restoreSwarmCheckpoint(task, next, now + 120_000)
    expect(restored.ready).toBe(true)
    if (restored.ready) expect(restored.brief.stage).toBe('awaiting_review')
  })

  it('rejects attempts to resume a different project, task, owner, or objective', () => {
    const saved = createSwarmCheckpoint(task, state, now)
    for (const changed of [
      { projectId: 'foreign-project' },
      { taskId: 'another-task' },
      { ownerAgentId: 'other-worker' },
      { objectiveId: 'another-goal' },
      { routeNodeId: 'another-node' },
      { permissionLevel: 'P0' as const },
      { allowedFiles: ['src/lib/other.ts'] },
      { maxTokens: 10 },
    ]) {
      const result = restoreSwarmCheckpoint({ ...task, ...changed }, saved, now + 1000)
      expect(result.ready).toBe(false)
    }
  })

  it('rejects expired checkpoints and expired work contracts', () => {
    const saved = createSwarmCheckpoint(task, state, now, undefined, 5 * 60 * 1000)
    expect(restoreSwarmCheckpoint(task, saved, now + 5 * 60 * 1000)).toEqual({
      ready: false, reason: 'checkpoint_expired_or_invalid_time',
    })
    expect(restoreSwarmCheckpoint(task, saved, Date.parse(task.deadlineAt))).toEqual({
      ready: false, reason: 'invalid_or_expired_task_contract',
    })
  })

  it('enforces limits, malformed payload rejection, and no permission upgrades', () => {
    expect(() => createSwarmCheckpoint(task, state, now, undefined, 31 * 24 * 60 * 60 * 1000))
      .toThrow('checkpoint_ttl_invalid')
    expect(() => createSwarmCheckpoint({ ...task, permissionLevel: 'P3' }, state, now))
      .toThrow('checkpoint_task_not_authorized')
    expect(restoreSwarmCheckpoint(task, null, now + 1000).ready).toBe(false)
    expect(() => createSwarmCheckpoint(task, {
      ...state,
      notes: Array.from({ length: 13 }, (_, i) => ({
        topic: 'experiment' as const,
        summary: 'Unverified observation ' + i,
        sourceRef: 'fixture://note',
        verified: false as const,
      })),
    }, now)).toThrow('checkpoint_payload_invalid')
  })

  it('blocks leaked secrets from both new and imported checkpoints', () => {
    const secret = 'Authorization: Bearer abcdefghijklmnopqrstuv'
    expect(() => createSwarmCheckpoint(task, {
      ...state,
      notes: [{ topic: 'code-map', summary: secret, sourceRef: 'fixture://test', verified: false }],
    }, now)).toThrow('checkpoint_payload_invalid')

    const saved = createSwarmCheckpoint(task, state, now)
    const imported = {
      ...saved,
      notes: [{ ...saved.notes[0], summary: 'password=hunter2secret' }],
    }
    expect(restoreSwarmCheckpoint(task, imported, now + 1000)).toEqual({
      ready: false,
      reason: 'checkpoint_contains_invalid_or_sensitive_data',
    })
  })

  it('rejects external claims of verified truth within scratch context', () => {
    const saved = createSwarmCheckpoint(task, state, now)
    const tampered = {
      ...saved,
      notes: [{ ...saved.notes[0], verified: true }],
    }
    expect(restoreSwarmCheckpoint(task, tampered, now + 1000).ready).toBe(false)
    expect(() => createSwarmCheckpoint(task, { ...state, stage: 'verified' as 'in_progress' }, now))
      .toThrow('checkpoint_payload_invalid')
  })

  it('detects stale revision on a new worker checkpoint write', () => {
    const first = createSwarmCheckpoint(task, state, now)
    expect(() => createSwarmCheckpoint(task, {
      ...state, expectedRevision: 0,
    }, now + 1000, first)).toThrow('checkpoint_revision_conflict')
    expect(() => createSwarmCheckpoint(task, {
      ...state, expectedRevision: 1,
    }, now + 1000)).toThrow('checkpoint_revision_conflict')
  })

  it('is data-only: no runtime dispatch, storage, approval or self-spawning properties', () => {
    const saved = createSwarmCheckpoint(task, state, now)
    for (const forbidden of ['grant', 'permissionGrant', 'scheduler', 'provider', 'dispatch', 'authenticatedUser']) {
      expect(forbidden in saved).toBe(false)
    }
    expect(saved.permissionLevel).toBe('P1')
    expect(saved.notes.every(note => note.verified === false)).toBe(true)
  })

  it('rejects a malformed runtime snapshot even when it claims a valid type', () => {
    const saved = createSwarmCheckpoint(task, state, now)
    const claimed: SwarmCheckpoint = {
      ...saved, createdAt: 'not-a-date', expiresAt: '2030-01-01T00:00:00Z',
    }
    expect(restoreSwarmCheckpoint(task, claimed, now + 1000).ready).toBe(false)
  })
})
