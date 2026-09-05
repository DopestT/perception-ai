import type { Belief } from './perception-model'

export type ObjectiveStatus =
  | 'captured'
  | 'resolved'
  | 'mapped'
  | 'routed'
  | 'running'
  | 'blocked'
  | 'awaiting_approval'
  | 'verifying'
  | 'realized'
  | 'paused'
  | 'superseded'

export type RouteNodeStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'awaiting_approval'
  | 'verifying'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'skipped'
  | 'superseded'
  | 'paused'

export type PermissionLevel = 'P0' | 'P1' | 'P2' | 'P3'

export type CapabilityKind =
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

export interface SourceRef {
  kind: 'user_input' | 'file' | 'link' | 'connected_source' | 'web' | 'system'
  ref: string
  observedAt: string
}

export interface ObjectiveSpec {
  id: string
  projectId: string
  statement: string
  desiredReality: string
  currentReality: string
  constraints: string[]
  successCriteria: string[]
  deliverables: string[]
  urgency: 'low' | 'normal' | 'high' | 'critical'
  knownUnknowns: string[]
  sourceRefs: SourceRef[]
  status: ObjectiveStatus
  createdAt: string
  updatedAt: string
}

export interface CompletionTest {
  description: string
  kind: 'deterministic' | 'source' | 'schema' | 'build' | 'ui' | 'external' | 'user'
}

export interface RouteNode {
  id: string
  routeId: string
  label: string
  outcome: string
  status: RouteNodeStatus
  dependencies: string[]
  capability: CapabilityKind
  permissionLevel: PermissionLevel
  confidence: number
  risk: 'low' | 'medium' | 'high'
  completionTests: CompletionTest[]
  blocker?: string
}

export interface RouteVersion {
  id: string
  objectiveId: string
  version: number
  reason: string
  nodeIds: string[]
  supersedesRouteId?: string
  createdAt: string
}

export interface PermissionGrant {
  id: string
  projectId: string
  level: PermissionLevel
  capability?: CapabilityKind
  target?: string
  grantedAt: string
  expiresAt?: string
  revokedAt?: string
}

export interface VerificationResult {
  id: string
  routeNodeId: string
  passed: boolean
  evidence: string[]
  checkedAt: string
}

export interface WorldSignal {
  id: string
  projectId: string
  summary: string
  relevance: number
  impact: number
  novelty: number
  confidence: number
  urgency: number
  noise: number
  affectedBeliefIds: string[]
  affectedRouteNodeIds: string[]
  sourceRefs: SourceRef[]
  detectedAt: string
}

export interface RuntimeSnapshot {
  objective: ObjectiveSpec
  beliefs: Belief[]
  route: RouteVersion | null
  nodes: RouteNode[]
  permissions: PermissionGrant[]
  verifications: VerificationResult[]
}

const routeTransitions: Record<RouteNodeStatus, RouteNodeStatus[]> = {
  pending: ['ready', 'blocked', 'skipped', 'superseded', 'paused'],
  ready: ['running', 'blocked', 'skipped', 'superseded', 'paused'],
  running: ['awaiting_approval', 'verifying', 'blocked', 'failed', 'paused'],
  awaiting_approval: ['running', 'verifying', 'blocked', 'skipped', 'paused'],
  verifying: ['completed', 'failed', 'blocked', 'running'],
  completed: [],
  blocked: ['ready', 'skipped', 'superseded', 'paused'],
  failed: ['ready', 'skipped', 'superseded'],
  skipped: [],
  superseded: [],
  paused: ['pending', 'ready', 'running', 'awaiting_approval', 'blocked'],
}

export function canTransitionRouteNode(from: RouteNodeStatus, to: RouteNodeStatus): boolean {
  return routeTransitions[from].includes(to)
}

export function transitionRouteNode(node: RouteNode, to: RouteNodeStatus, blocker?: string): RouteNode {
  if (!canTransitionRouteNode(node.status, to)) {
    throw new Error(`Invalid route-node transition: ${node.status} -> ${to}`)
  }

  return {
    ...node,
    status: to,
    blocker: to === 'blocked' ? blocker ?? node.blocker ?? 'Blocked' : undefined,
  }
}

export function trustedRoutingBeliefs(beliefs: Belief[]): Belief[] {
  return beliefs.filter((belief) => belief.state === 'observed' || belief.state === 'confirmed')
}

export function unresolvedHighImpactBeliefs(beliefs: Belief[]): Belief[] {
  return beliefs.filter(
    (belief) =>
      (belief.state === 'inferred' || belief.state === 'unknown' || belief.state === 'stale') &&
      (belief.needsConfirmation || belief.routeImpact.trim().length > 0),
  )
}

export function permissionRank(level: PermissionLevel): number {
  return ({ P0: 0, P1: 1, P2: 2, P3: 3 } as const)[level]
}

export function hasPermission(
  node: RouteNode,
  grants: PermissionGrant[],
  now = new Date(),
): boolean {
  if (node.permissionLevel === 'P0' || node.permissionLevel === 'P1') return true

  const timestamp = now.getTime()
  return grants.some((grant) => {
    if (grant.revokedAt) return false
    if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= timestamp) return false
    if (permissionRank(grant.level) < permissionRank(node.permissionLevel)) return false
    if (grant.capability && grant.capability !== node.capability) return false
    return true
  })
}

export function dependenciesSatisfied(node: RouteNode, allNodes: RouteNode[]): boolean {
  if (node.dependencies.length === 0) return true
  const statuses = new Map(allNodes.map((candidate) => [candidate.id, candidate.status]))
  return node.dependencies.every((dependencyId) => statuses.get(dependencyId) === 'completed')
}

export function nextReadyNodes(snapshot: RuntimeSnapshot): RouteNode[] {
  return snapshot.nodes.filter(
    (node) =>
      (node.status === 'pending' || node.status === 'ready') &&
      dependenciesSatisfied(node, snapshot.nodes) &&
      hasPermission(node, snapshot.permissions),
  )
}

export function worldSignalScore(signal: WorldSignal): number {
  const positive = signal.relevance * signal.impact * signal.novelty * signal.confidence * signal.urgency
  return positive - signal.noise
}

export function shouldSurfaceWorldSignal(signal: WorldSignal, threshold = 0.18): boolean {
  return worldSignalScore(signal) >= threshold
}
