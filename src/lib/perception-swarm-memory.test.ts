import { describe, expect, it } from 'vitest'
import type { SwarmTask } from './perception-swarm'
import {
  rehydrateSwarmAgent,
  type SwarmMemoryLease,
  type SwarmMemoryRecord,
  type SwarmMemoryPolicy,
} from './perception-swarm-memory'

const now = new Date('2026-11-13T06:55:00Z')
const task: SwarmTask = {
  taskId: 'task-research-1',
  projectId: 'perception-only',
  objectiveId: 'objective-1',
  routeNodeId: 'route-1',
  ownerAgentId: 'research-worker',
  reviewerAgentId: 'truth-verifier',
  goal: 'Research within the test fixture only',
  inputEvidenceRefs: ['fixture://starting-point'],
  allowedFiles: [],
  forbiddenFiles: ['.env'],
  completionTests: ['verify-source-provenance'],
  dependencyIds: [],
  permissionLevel: 'P0',
  deadlineAt: '2026-11-14T07:00:00Z',
  maxAttempts: 2,
  maxTokens: 0,
  maxCostUsd: 0,
  specialty: 'research',
  expectedArtifact: 'artifact://research-1',
  rollbackPlan: 'Discard fixture',
}
const lease: SwarmMemoryLease = {
  taskId: task.taskId,
  projectId: task.projectId,
  objectiveId: task.objectiveId,
  agentId: task.ownerAgentId,
  leaseId: 'lease-1',
  issuedAt: '2026-11-13T06:54:00Z',
  expiresAt: '2026-11-13T07:10:00Z',
  authorized: true,
}
const policy: SwarmMemoryPolicy = {
  maxRecords: 12,
  maxContextChars: 3000,
  maxAgeMs: 1000 * 3600,
}
const verified: SwarmMemoryRecord = {
  recordId: 'evidence-1',
  projectId: task.projectId,
  objectiveId: task.objectiveId,
  taskId: null,
  agentId: null,
  kind: 'source',
  state: 'verified',
  sourceRef: 'ledger://verification-1',
  summary: 'Source verified by a separate reviewer.',
  observedAt: '2026-11-13T06:54:20Z',
  verificationRef: 'ledger://verification-1',
  verifiedByAgentId: 'truth-verifier',
  sensitivity: 'project',
}
const checkpoint: SwarmMemoryRecord = {
  ...verified,
  recordId: 'checkpoint-1',
  taskId: task.taskId,
  agentId: task.ownerAgentId,
  kind: 'checkpoint',
  state: 'unverified',
  sourceRef: 'checkpoint://research-1',
  summary: 'Previously planned next step, not an independently verified outcome.',
  verificationRef: undefined,
  verifiedByAgentId: undefined,
}
const read = (records: readonly unknown[], l = lease, p = policy) =>
  rehydrateSwarmAgent(task, l, records, p, now)

describe('PERCEPTION stateless agent rehydration — dry run', () => {
  it('restores trusted evidence and its own unverified checkpoint in separate compartments', () => {
    const result = read([checkpoint, verified])
    expect(result.accepted).toBe(true)
    if (!result.accepted) return
    expect(result.context.verified).toEqual([verified])
    expect(result.context.checkpoints).toEqual([checkpoint])
    expect(result.context.agentId).toBe('research-worker')
    expect(result.context.warnings.join(' ')).toContain('not a tool command or permission grant')
    expect(result.context.omittedRecords).toBe(0)
  })

  it('does not need a persistent agent process or provider memory', () => {
    const first = read([verified, checkpoint])
    const restarted = read([checkpoint, verified])
    expect(first).toEqual(restarted)
    expect(first.accepted && first.context.restoredAt).toBe(now.toISOString())
  })

  it('fails closed on other project or objective context rather than silently mixing it', () => {
    expect(read([{ ...verified, projectId: 'other-project' }])).toEqual({
      accepted: false,
      errors: ['memory_scope_mismatch'],
    })
    expect(read([{ ...verified, objectiveId: 'other-objective' }]).accepted).toBe(false)
  })

  it('blocks another task\'s private checkpoint and another agent\'s checkpoint', () => {
    expect(read([{ ...checkpoint, taskId: 'task-other' }]).accepted).toBe(false)
    expect(read([{ ...checkpoint, agentId: 'backend-worker' }]).accepted).toBe(false)
  })

  it('never restores without a fresh authorized matching lease', () => {
    expect(read([verified], { ...lease, authorized: false }).accepted).toBe(false)
    expect(read([verified], { ...lease, agentId: 'interface-worker' }).accepted).toBe(false)
    expect(read([verified], { ...lease, projectId: 'another-project' }).accepted).toBe(false)
    expect(read([verified], { ...lease, expiresAt: '2026-11-13T06:55:00Z' }).accepted).toBe(false)
    expect(read([verified], { ...lease, issuedAt: '2026-11-13T07:00:00Z' }).accepted).toBe(false)
  })

  it('rejects ambiguous, overly old, expired or future-dated records', () => {
    expect(read([{ ...verified, observedAt: '2026-01-01T00:00:00Z' }]).accepted).toBe(false)
    expect(read([{ ...verified, observedAt: '2026-11-13T07:30:00Z' }]).accepted).toBe(false)
    expect(read([{ ...verified, expiresAt: '2026-11-13T06:54:59Z' }]).accepted).toBe(false)
    expect(read([{ ...verified, observedAt: 'tomorrow' }]).accepted).toBe(false)
  })

  it('never loads restricted records, duplicate IDs or malformed payloads', () => {
    expect(read([{ ...verified, sensitivity: 'restricted' }]).accepted).toBe(false)
    expect(read([verified, verified]).accepted).toBe(false)
    expect(read([null]).accepted).toBe(false)
    expect(read(Array.from({ length: 251 }, () => verified)).accepted).toBe(false)
  })

  it('requires independent verification for any claimed fact', () => {
    expect(read([{ ...verified, verifiedByAgentId: task.ownerAgentId }]).accepted).toBe(false)
    expect(read([{ ...verified, verificationRef: undefined }]).accepted).toBe(false)
    expect(read([{ ...verified, verifiedByAgentId: 'mystery-bot' }]).accepted).toBe(false)
  })

  it('keeps rejected and proposed observations out of the restored factual context', () => {
    const result = read([
      verified,
      { ...verified, recordId: 'proposed-1', state: 'unverified' },
      { ...verified, recordId: 'rejected-1', state: 'rejected' },
    ])
    expect(result.accepted).toBe(true)
    if (result.accepted) {
      expect(result.context.verified.map(r => r.recordId)).toEqual(['evidence-1'])
      expect(result.context.checkpoints).toEqual([])
    }
  })

  it('treats unverified checkpoints as hints, not verified accomplishments', () => {
    const result = read([checkpoint])
    expect(result.accepted).toBe(true)
    if (result.accepted) {
      expect(result.context.verified).toHaveLength(0)
      expect(result.context.checkpoints).toHaveLength(1)
    }
    expect(read([{ ...checkpoint, state: 'verified' }]).accepted).toBe(false)
  })

  it('accepts only explicitly consent-referenced, independently reviewed preferences', () => {
    const preference: SwarmMemoryRecord = {
      ...verified,
      recordId: 'preference-1',
      kind: 'preference',
      sourceRef: 'consent://user-preference-1',
      summary: 'User-approved preference for short status notes',
    }
    expect(read([preference]).accepted).toBe(true)
    expect(read([{ ...preference, sourceRef: 'model-guess://inference' }]).accepted).toBe(false)
    expect(read([{ ...preference, state: 'unverified' }]).accepted).toBe(false)
  })

  it('caps the restore payload and reports how much context was omitted', () => {
    const records = Array.from({ length: 8 }, (_, i) => ({
      ...verified, recordId: `evidence-${i}`, summary: `Recorded claim ${i}.`,
    }))
    const result = read(records, lease, { ...policy, maxRecords: 3 })
    expect(result.accepted).toBe(true)
    if (result.accepted) {
      expect(result.context.verified).toHaveLength(3)
      expect(result.context.omittedRecords).toBe(5)
    }
    expect(read(records, lease, { ...policy, maxContextChars: 0 }).accepted).toBe(false)
    expect(read(records, lease, { ...policy, maxRecords: 1000 }).accepted).toBe(false)
  })

  it('does not mutate canonical records or mint a permission, scheduler or worker run', () => {
    const before = JSON.stringify([verified, checkpoint, task, lease])
    const result = read([verified, checkpoint])
    expect(result.accepted).toBe(true)
    expect(JSON.stringify([verified, checkpoint, task, lease])).toBe(before)
    if (result.accepted) {
      expect('permissions' in result.context).toBe(false)
      expect('tools' in result.context).toBe(false)
      expect('dispatch' in result.context).toBe(false)
    }
  })
})
