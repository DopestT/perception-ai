import type { PerceptionModel } from './perception-model'
import {
  ObjectiveSpec,
  RouteNode,
  RouteVersion,
  VerificationResult,
  transitionRouteNode,
} from './perception-runtime'

const now = () => new Date().toISOString()
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export interface RuntimeArtifact {
  id: string
  routeNodeId: string
  title: string
  content: string
  createdAt: string
}

export interface RuntimeEvent {
  id: string
  type: string
  summary: string
  at: string
  objectiveId?: string
  routeNodeId?: string
}

export interface ProjectWorldUpdate {
  projectId: string
  objectiveId: string
  routeId: string
  stage: 'verified_progress'
  summary: string
  latestArtifactId: string
  verifiedAt: string
  nextAction: string
}

export interface FirstActionCycle {
  objective: ObjectiveSpec
  route: RouteVersion
  nodes: RouteNode[]
  artifact: RuntimeArtifact
  verification: VerificationResult
  events: RuntimeEvent[]
  worldUpdate: ProjectWorldUpdate
}

export function compileObjective(model: PerceptionModel, rawInput: string): ObjectiveSpec {
  const statement = rawInput.trim() || model.lastInput.trim()
  if (!statement) throw new Error('Objective input is required')

  const timestamp = now()
  const knownUnknowns = model.goal.beliefs
    .filter((belief) => belief.state === 'unknown' || belief.state === 'inferred' || belief.state === 'stale')
    .map((belief) => belief.statement)

  return {
    id: id(),
    projectId: model.goal.id,
    statement,
    desiredReality: model.goal.desiredReality === 'Not known yet' ? statement : model.goal.desiredReality,
    currentReality: model.goal.currentReality,
    constraints: [],
    successCriteria: [
      'The objective is represented from direct user evidence.',
      'A first low-risk action is produced without external side effects.',
      'That action is verified before progress is recorded.',
    ],
    deliverables: ['Verified first-action brief'],
    urgency: 'normal',
    knownUnknowns,
    sourceRefs: [{ kind: 'user_input', ref: statement, observedAt: timestamp }],
    status: 'resolved',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function planFirstActionRoute(objective: ObjectiveSpec): { route: RouteVersion; nodes: RouteNode[] } {
  const routeId = id()
  const resolveId = id()
  const actionId = id()
  const verifyId = id()

  const route: RouteVersion = {
    id: routeId,
    objectiveId: objective.id,
    version: 1,
    reason: 'Smallest viable route: resolve the objective, start one reversible draft action, then verify it before recording progress.',
    nodeIds: [resolveId, actionId, verifyId],
    createdAt: now(),
  }

  const nodes: RouteNode[] = [
    {
      id: resolveId,
      routeId,
      label: 'Resolve objective',
      outcome: 'A structured objective is grounded in direct user evidence.',
      status: 'pending',
      dependencies: [],
      capability: 'reason',
      permissionLevel: 'P0',
      confidence: 0.98,
      risk: 'low',
      completionTests: [{ description: 'Objective statement and source reference are non-empty.', kind: 'schema' }],
    },
    {
      id: actionId,
      routeId,
      label: 'Start first action',
      outcome: 'Create a reusable execution brief without producing external side effects.',
      status: 'pending',
      dependencies: [resolveId],
      capability: 'generate',
      permissionLevel: 'P1',
      confidence: 0.92,
      risk: 'low',
      completionTests: [
        { description: 'Brief names the objective, current reality, desired reality, and next reversible move.', kind: 'deterministic' },
      ],
    },
    {
      id: verifyId,
      routeId,
      label: 'Verify progress',
      outcome: 'Evidence confirms the first action is usable before Project World records progress.',
      status: 'pending',
      dependencies: [actionId],
      capability: 'verify',
      permissionLevel: 'P0',
      confidence: 0.99,
      risk: 'low',
      completionTests: [{ description: 'The action verification result passed with evidence.', kind: 'deterministic' }],
    },
  ]

  return { route, nodes }
}

function makeExecutionBrief(objective: ObjectiveSpec, routeNodeId: string): RuntimeArtifact {
  const unknowns = objective.knownUnknowns.length > 0 ? objective.knownUnknowns.join('; ') : 'None blocking this first reversible action.'
  const content = [
    `Objective: ${objective.statement}`,
    `Current reality: ${objective.currentReality}`,
    `Desired reality: ${objective.desiredReality}`,
    `Known unknowns: ${unknowns}`,
    'Action started: create this execution brief as the first reversible artifact.',
    'Next reversible move: use the verified brief to select the next bounded capability without taking external action.',
  ].join('\n')

  return {
    id: id(),
    routeNodeId,
    title: 'Verified First-Action Brief',
    content,
    createdAt: now(),
  }
}

export function verifyExecutionBrief(objective: ObjectiveSpec, artifact: RuntimeArtifact): VerificationResult {
  const checks = [
    artifact.content.includes(`Objective: ${objective.statement}`),
    artifact.content.includes('Current reality:'),
    artifact.content.includes('Desired reality:'),
    artifact.content.includes('Next reversible move:'),
  ]
  const passed = checks.every(Boolean)

  return {
    id: id(),
    routeNodeId: artifact.routeNodeId,
    passed,
    evidence: passed
      ? [
          'Objective statement is preserved verbatim in the artifact.',
          'Current and desired reality are present.',
          'A next reversible move is explicit.',
          'No external side effect is required for this P1 action.',
        ]
      : ['Execution brief failed one or more deterministic completion checks.'],
    checkedAt: now(),
  }
}

export function runFirstActionCycle(model: PerceptionModel, rawInput: string): FirstActionCycle {
  const objective = compileObjective(model, rawInput)
  const { route, nodes: plannedNodes } = planFirstActionRoute(objective)
  const nodes = [...plannedNodes]
  const events: RuntimeEvent[] = []
  const event = (type: string, summary: string, routeNodeId?: string) => {
    events.push({ id: id(), type, summary, at: now(), objectiveId: objective.id, routeNodeId })
  }

  event('objective.created', 'Objective compiled from direct user evidence.')
  event('route.created', 'Smallest viable first-action route created.')

  nodes[0] = transitionRouteNode(nodes[0], 'ready')
  nodes[0] = transitionRouteNode(nodes[0], 'running')
  event('route_node.started', nodes[0].label, nodes[0].id)
  nodes[0] = transitionRouteNode(nodes[0], 'verifying')
  const objectiveValid = objective.statement.length > 0 && objective.sourceRefs.length > 0
  nodes[0] = transitionRouteNode(nodes[0], objectiveValid ? 'completed' : 'failed')
  if (!objectiveValid) throw new Error('Objective verification failed')
  event('route_node.completed', nodes[0].label, nodes[0].id)

  nodes[1] = transitionRouteNode(nodes[1], 'ready')
  nodes[1] = transitionRouteNode(nodes[1], 'running')
  event('route_node.started', nodes[1].label, nodes[1].id)
  const artifact = makeExecutionBrief(objective, nodes[1].id)
  event('artifact.created', artifact.title, nodes[1].id)
  nodes[1] = transitionRouteNode(nodes[1], 'verifying')
  const verification = verifyExecutionBrief(objective, artifact)
  nodes[1] = transitionRouteNode(nodes[1], verification.passed ? 'completed' : 'failed')
  event(verification.passed ? 'verification.passed' : 'verification.failed', verification.evidence.join(' '), nodes[1].id)
  if (!verification.passed) throw new Error('First action verification failed')
  event('route_node.completed', nodes[1].label, nodes[1].id)

  nodes[2] = transitionRouteNode(nodes[2], 'ready')
  nodes[2] = transitionRouteNode(nodes[2], 'running')
  event('route_node.started', nodes[2].label, nodes[2].id)
  nodes[2] = transitionRouteNode(nodes[2], 'verifying')
  nodes[2] = transitionRouteNode(nodes[2], 'completed')
  event('route_node.completed', nodes[2].label, nodes[2].id)

  objective.status = 'running'
  objective.updatedAt = now()
  event('objective.updated', 'Verified first-action progress recorded; the broader objective remains active.')

  return {
    objective,
    route,
    nodes,
    artifact,
    verification,
    events,
    worldUpdate: {
      projectId: objective.projectId,
      objectiveId: objective.id,
      routeId: route.id,
      stage: 'verified_progress',
      summary: 'Perception understood the objective, routed it, started a reversible P1 action, verified the result, and recorded evidence-backed progress.',
      latestArtifactId: artifact.id,
      verifiedAt: verification.checkedAt,
      nextAction: 'Select the next bounded capability from the verified brief; require a permission gate if that action exceeds P1.',
    },
  }
}
