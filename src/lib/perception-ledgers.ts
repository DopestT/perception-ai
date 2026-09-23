import type { PermissionLevel } from './perception-runtime'

export type EpistemicState =
  | 'observed'
  | 'inferred'
  | 'confirmed'
  | 'unknown'
  | 'rejected'
  | 'stale'
  | 'contradicted'

export interface EpistemicLedgerEntry {
  id: string
  projectId: string
  objectiveId?: string
  claimKey: string
  statement: string
  state: EpistemicState
  confidence: number
  provenance: unknown[]
  temporalValidFrom: string
  temporalValidUntil?: string
  supersedesEntryId?: string
  contradictionRefs: string[]
  routeImpact: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type ExecutionPhase =
  | 'intended'
  | 'authorized'
  | 'attempted'
  | 'observed'
  | 'verified'
  | 'blocked'
  | 'failed'
  | 'rolled_back'

export interface ExecutionLedgerEntry {
  id: string
  projectId: string
  objectiveId?: string
  routeId?: string
  routeNodeId?: string
  workerRunId?: string
  actionKey: string
  phase: ExecutionPhase
  permissionLevel: PermissionLevel
  capability?: string
  target?: string
  details: Record<string, unknown>
  evidence: unknown[]
  createdAt: string
}

export function isTemporallyValid(entry: EpistemicLedgerEntry, now = new Date()): boolean {
  if (new Date(entry.temporalValidFrom).getTime() > now.getTime()) return false
  if (!entry.temporalValidUntil) return true
  return new Date(entry.temporalValidUntil).getTime() > now.getTime()
}

export function isTrustedClaim(entry: EpistemicLedgerEntry, now = new Date()): boolean {
  return (
    (entry.state === 'observed' || entry.state === 'confirmed') &&
    entry.confidence >= 0 &&
    entry.confidence <= 1 &&
    isTemporallyValid(entry, now)
  )
}

export function latestClaimByKey(entries: EpistemicLedgerEntry[], claimKey: string): EpistemicLedgerEntry | null {
  return (
    entries
      .filter((entry) => entry.claimKey === claimKey)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null
  )
}

export function latestExecutionForAction(
  entries: ExecutionLedgerEntry[],
  actionKey: string,
): ExecutionLedgerEntry | null {
  return (
    entries
      .filter((entry) => entry.actionKey === actionKey)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null
  )
}

export function isVerifiedEffect(entry: ExecutionLedgerEntry | null): boolean {
  return Boolean(entry && entry.phase === 'verified' && entry.evidence.length > 0)
}

export function mayAdvanceAuthoritativeTruth(
  entries: ExecutionLedgerEntry[],
  actionKey: string,
): boolean {
  return isVerifiedEffect(latestExecutionForAction(entries, actionKey))
}
