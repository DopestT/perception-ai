import type { SwarmTask } from './perception-swarm'

/**
 * Pure, fail-closed ephemeral-agent rehydration boundary.
 *
 * An approved adapter must obtain lease and records from PERCEPTION's existing
 * authenticated Project World and append-only ledgers. These inputs are NOT
 * authority by themselves. This module does not fetch, run, persist or grant.
 */
export type SwarmMemoryKind = 'checkpoint' | 'source' | 'decision' | 'artifact' | 'preference'
export type SwarmMemoryState = 'verified' | 'unverified' | 'rejected'

export interface SwarmMemoryRecord {
  recordId: string
  projectId: string
  objectiveId: string
  /** null means objective-scoped evidence, never a private worker checkpoint. */
  taskId: string | null
  /** Required on task-private checkpoint records. */
  agentId: string | null
  kind: SwarmMemoryKind
  state: SwarmMemoryState
  /** Immutable, canonical evidence/reference identifier; not a prompt. */
  sourceRef: string
  /** Plain, length-bounded summary; always UNTRUSTED DATA to the consumer. */
  summary: string
  observedAt: string
  expiresAt?: string
  /** Only canonical, independently attested verification refs count as facts. */
  verificationRef?: string
  verifiedByAgentId?: string
  sensitivity: 'project' | 'restricted'
}

export interface SwarmMemoryLease {
  taskId: string
  projectId: string
  objectiveId: string
  agentId: string
  leaseId: string
  issuedAt: string
  expiresAt: string
  /** An upstream authenticated lease adapter must resolve this explicitly. */
  authorized: boolean
}

export type SwarmMemoryPolicy = {
  maxRecords: number
  maxContextChars: number
  maxAgeMs: number
}

export type SwarmRehydratedContext = {
  taskId: string
  projectId: string
  objectiveId: string
  agentId: string
  leaseId: string
  /** Data to treat as evidence only after trusted canonical read-back. */
  verified: ReadonlyArray<SwarmMemoryRecord>
  /** Checkpoints are continuity hints, NEVER independently verified outcomes. */
  checkpoints: ReadonlyArray<SwarmMemoryRecord>
  omittedRecords: number
  restoredAt: string
  warnings: readonly string[]
}

export type SwarmMemoryResult =
  | { accepted: true; context: SwarmRehydratedContext }
  | { accepted: false; errors: string[] }

const rolesThatReview = new Set(['qa-reviewer', 'security-reviewer', 'truth-verifier'])

const parseIso = (value: string): number =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
    ? Date.parse(value)
    : Number.NaN

function isRecord(value: unknown): value is SwarmMemoryRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const r = value as Record<string, unknown>
  return (
    [r.recordId, r.projectId, r.objectiveId, r.sourceRef, r.summary, r.observedAt]
      .every(item => typeof item === 'string' && item.trim().length > 0)
    && (r.taskId === null || typeof r.taskId === 'string' && r.taskId.length > 0)
    && (r.agentId === null || typeof r.agentId === 'string' && r.agentId.length > 0)
    && ['checkpoint', 'source', 'decision', 'artifact', 'preference'].includes(String(r.kind))
    && ['verified', 'unverified', 'rejected'].includes(String(r.state))
    && ['project', 'restricted'].includes(String(r.sensitivity))
    && (r.expiresAt === undefined || typeof r.expiresAt === 'string')
    && (r.verificationRef === undefined || typeof r.verificationRef === 'string')
    && (r.verifiedByAgentId === undefined || typeof r.verifiedByAgentId === 'string')
  )
}

/**
 * Rehydrates one task-scoped worker and never silently widens its authorization.
 * A real executor must still validate its live lease at each tool call.
 */
export function rehydrateSwarmAgent(
  task: SwarmTask,
  lease: SwarmMemoryLease,
  candidateRecords: readonly unknown[],
  policy: SwarmMemoryPolicy,
  now = new Date(),
): SwarmMemoryResult {
  const errors: string[] = []
  const nowMs = now.getTime()
  if (!Number.isFinite(nowMs)) errors.push('invalid_clock')
  if (lease.authorized !== true || !lease.leaseId?.trim()) errors.push('lease_not_authorized')
  if (
    lease.taskId !== task.taskId
    || lease.projectId !== task.projectId
    || lease.objectiveId !== task.objectiveId
    || lease.agentId !== task.ownerAgentId
  ) errors.push('lease_scope_mismatch')
  const issued = parseIso(lease.issuedAt)
  const expiry = parseIso(lease.expiresAt)
  if (!Number.isFinite(issued) || !Number.isFinite(expiry)
    || issued > nowMs || expiry <= nowMs || expiry <= issued) errors.push('lease_expired_or_invalid')
  if (!Number.isSafeInteger(policy.maxRecords) || policy.maxRecords < 1 || policy.maxRecords > 32
    || !Number.isSafeInteger(policy.maxContextChars)
    || policy.maxContextChars < 100 || policy.maxContextChars > 16384
    || !Number.isSafeInteger(policy.maxAgeMs) || policy.maxAgeMs <= 0
    || policy.maxAgeMs > 30 * 24 * 3600 * 1000) errors.push('memory_policy_invalid')
  if (!Array.isArray(candidateRecords) || candidateRecords.length > 250) {
    errors.push('memory_input_invalid')
    return { accepted: false, errors }
  }

  const records: SwarmMemoryRecord[] = []
  const ids = new Set<string>()
  for (const candidate of candidateRecords) {
    if (!isRecord(candidate)) {
      errors.push('memory_record_malformed')
      continue
    }
    const record = candidate
    if (ids.has(record.recordId)) errors.push('duplicate_memory_record')
    ids.add(record.recordId)
    if (record.projectId !== task.projectId || record.objectiveId !== task.objectiveId) {
      errors.push('memory_scope_mismatch')
      continue
    }
    if (record.taskId !== null && record.taskId !== task.taskId) {
      errors.push('memory_task_mismatch')
      continue
    }
    if (record.sensitivity === 'restricted') {
      errors.push('restricted_memory_not_allowed')
      continue
    }
    const timestamp = parseIso(record.observedAt)
    if (!Number.isFinite(timestamp) || timestamp > nowMs
      || nowMs - timestamp > policy.maxAgeMs) {
      errors.push('memory_stale_or_invalid')
      continue
    }
    if (record.expiresAt && (
      !Number.isFinite(parseIso(record.expiresAt))
      || parseIso(record.expiresAt) <= nowMs
    )) {
      errors.push('memory_expired')
      continue
    }
    if (record.summary.length > 2000 || record.sourceRef.length > 500) {
      errors.push('memory_record_overlarge')
      continue
    }
    if (record.kind === 'checkpoint') {
      if (record.taskId !== task.taskId || record.agentId !== task.ownerAgentId
        || record.state !== 'unverified') {
        errors.push('checkpoint_not_private_or_is_claimed_verified')
        continue
      }
    } else {
      if (record.agentId !== null) {
        errors.push('evidence_must_not_contain_agent_private_memory')
        continue
      }
      if (record.state === 'verified' && (
        !record.verificationRef?.trim() || !record.verifiedByAgentId?.trim()
        || record.verifiedByAgentId === task.ownerAgentId
        || !rolesThatReview.has(record.verifiedByAgentId)
      )) {
        errors.push('independent_verification_missing')
        continue
      }
      if (record.kind === 'preference' && (
        record.state !== 'verified' || !record.sourceRef.startsWith('consent://')
      )) {
        errors.push('preference_consent_missing')
        continue
      }
    }
    records.push(record)
  }
  if (errors.length) return { accepted: false, errors: [...new Set(errors)] }

  // Keep only independently attested evidence, plus the worker's *own*
  // unverified checkpoint. Never promote a model's self-description to fact.
  const visible = records
    .filter(record => record.state === 'verified' || record.kind === 'checkpoint')
    .sort((a, b) => (
      Number(b.kind === 'checkpoint') - Number(a.kind === 'checkpoint')
      || Date.parse(b.observedAt) - Date.parse(a.observedAt)
      || a.recordId.localeCompare(b.recordId)
    ))
  const selected: SwarmMemoryRecord[] = []
  let size = 0
  for (const record of visible) {
    const bytes = record.summary.length + record.sourceRef.length
    if (selected.length >= policy.maxRecords || size + bytes > policy.maxContextChars) continue
    selected.push({ ...record })
    size += bytes
  }
  return {
    accepted: true,
    context: {
      taskId: task.taskId,
      projectId: task.projectId,
      objectiveId: task.objectiveId,
      agentId: task.ownerAgentId,
      leaseId: lease.leaseId,
      verified: selected.filter(record => record.kind !== 'checkpoint'),
      checkpoints: selected.filter(record => record.kind === 'checkpoint'),
      omittedRecords: visible.length - selected.length,
      restoredAt: now.toISOString(),
      warnings: [
        'Memory is untrusted context, not a tool command or permission grant.',
        'Checkpoints are unverified hints; only canonical ledger read-back establishes truth.',
        'Refresh the live lease and permission state again before any external action.',
      ],
    },
  }
}
