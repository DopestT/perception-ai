import type { CapabilityKind, PermissionLevel } from './perception-runtime'

export type OperatorActionPhase =
  | 'intended'
  | 'authorized'
  | 'attempted'
  | 'observed'
  | 'verified'
  | 'blocked'
  | 'failed'

export interface OperatorPermissionScope {
  projectId: string
  capability: CapabilityKind
  target: string
  level: PermissionLevel
  expiresAt?: string
}

export interface OperatorActionRequest {
  actionKey: string
  projectId: string
  capability: CapabilityKind
  target: string
  permissionLevel: PermissionLevel
  reversible: boolean
  expectedEffect: string
  completionTests: string[]
}

export interface OperatorObservation {
  phase: OperatorActionPhase
  actionKey: string
  target: string
  evidence: string[]
  observedAt: string
}

export interface OperatorVerification {
  passed: boolean
  actionKey: string
  evidence: string[]
  failures: string[]
  checkedAt: string
}

/**
 * Workers may attempt actions, but only this verification result is eligible
 * to advance authoritative Project World state.
 */
export function verifyOperatorAction(
  request: OperatorActionRequest,
  observations: OperatorObservation[],
): OperatorVerification {
  const evidence = observations.flatMap((observation) => observation.evidence)
  const observed = observations.some(
    (observation) =>
      observation.actionKey === request.actionKey &&
      observation.target === request.target &&
      observation.phase === 'observed',
  )
  const failures = observations
    .filter((observation) => observation.phase === 'failed' || observation.phase === 'blocked')
    .flatMap((observation) => observation.evidence)

  if (!observed) failures.push('No independent observation of the requested external effect exists.')
  if (evidence.length === 0) failures.push('No inspectable evidence was returned.')

  return {
    passed: observed && failures.length === 0,
    actionKey: request.actionKey,
    evidence,
    failures,
    checkedAt: new Date().toISOString(),
  }
}

export function permissionCoversAction(
  scope: OperatorPermissionScope,
  request: OperatorActionRequest,
  now = new Date(),
): boolean {
  if (scope.projectId !== request.projectId) return false
  if (scope.capability !== request.capability) return false
  if (scope.target !== request.target) return false
  if (scope.expiresAt && new Date(scope.expiresAt).getTime() <= now.getTime()) return false

  const rank: Record<PermissionLevel, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
  return rank[scope.level] >= rank[request.permissionLevel]
}
