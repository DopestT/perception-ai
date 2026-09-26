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

export type PermissionLevel = 'P0' | 'P1' | 'P2' | 'P3'

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

export type PlannerMeaning = {
  desiredReality: string
  currentReality: string
  constraints: string[]
  successCriteria: string[]
  deliverables: string[]
  knownUnknowns: string[]
}

export type PlannedRouteNode = {
  key: string
  label: string
  outcome: string
  status: RouteNodeStatus
  dependencies: string[]
  capability: CapabilityKind
  permissionLevel: PermissionLevel
  confidence: number
  risk: 'low' | 'medium' | 'high'
  completionTests: Array<{
    description: string
    kind: 'deterministic' | 'source' | 'schema' | 'build' | 'ui' | 'external' | 'user'
  }>
  blocker?: string
}

export type PlannedRoute = {
  reason: string
  nodes: PlannedRouteNode[]
  blockedCapabilities: CapabilityKind[]
}

type PlannerOptions = {
  availableCapabilities?: CapabilityKind[]
}

const defaultCapabilities: CapabilityKind[] = ['reason', 'generate', 'verify']

function explicitExternalAction(desiredReality: string): { capability: CapabilityKind; permission: PermissionLevel; label: string } | null {
  const value = desiredReality.toLowerCase()

  if (/\b(delete|remove permanently|revoke access|change password|change access)\b/.test(value)) {
    return { capability: 'edit', permission: 'P3', label: 'Perform consequential change' }
  }
  if (/\b(publish|post publicly|send|email|message|announce)\b/.test(value)) {
    return { capability: 'communicate', permission: 'P3', label: 'Perform external communication' }
  }
  if (/\b(deploy|ship to production|release to production)\b/.test(value)) {
    return { capability: 'code', permission: 'P3', label: 'Deploy verified change' }
  }
  if (
    /\b(commit|create (?:a )?branch)\b/.test(value)
    || (/\b(edit|modify|change|update|create)\b/.test(value) && /\b(github|repo|repository|branch|code)\b/.test(value))
  ) {
    return { capability: 'code', permission: 'P2', label: 'Make bounded repository change' }
  }
  if (/\b(schedule|book|reserve)\b/.test(value)) {
    return { capability: 'schedule', permission: 'P2', label: 'Perform scheduled action' }
  }
  return null
}

export function planInitialRealityRoute(
  meaning: PlannerMeaning,
  options: PlannerOptions = {},
): PlannedRoute {
  const available = new Set(options.availableCapabilities ?? defaultCapabilities)
  const nodes: PlannedRouteNode[] = []
  const blockedCapabilities = new Set<CapabilityKind>()

  nodes.push({
    key: 'resolve-meaning',
    label: 'Resolve objective meaning',
    outcome: 'The route is grounded in structured objective semantics without silently promoting inference to fact.',
    status: 'completed',
    dependencies: [],
    capability: 'reason',
    permissionLevel: 'P0',
    confidence: 1,
    risk: 'low',
    completionTests: [{ description: 'Structured objective semantics exist.', kind: 'schema' }],
  })

  if (meaning.knownUnknowns.length > 0) {
    const capability: CapabilityKind = 'research'
    const canInspect = available.has(capability)
    if (!canInspect) blockedCapabilities.add(capability)

    nodes.push({
      key: 'inspect-current-reality',
      label: 'Inspect current reality',
      outcome: 'Material unknowns that could change the route are replaced by sourced observations or remain explicitly unknown.',
      status: canInspect ? 'ready' : 'blocked',
      dependencies: ['resolve-meaning'],
      capability,
      permissionLevel: 'P0',
      confidence: 0.9,
      risk: 'low',
      completionTests: [{ description: 'Material current-state claims carry source evidence and freshness.', kind: 'source' }],
      blocker: canInspect ? undefined : 'No research capability is currently attached to this runtime.',
    })
  }

  const firstDeliverable = meaning.deliverables.find((item) => item.trim()) || 'Verified first-action brief'
  nodes.push({
    key: 'first-reversible-action',
    label: 'Create first reversible action',
    outcome: firstDeliverable,
    status: available.has('generate') ? 'ready' : 'blocked',
    dependencies: ['resolve-meaning'],
    capability: 'generate',
    permissionLevel: 'P1',
    confidence: 0.95,
    risk: 'low',
    completionTests: [
      { description: 'Artifact preserves the objective and does not claim unverified external effects.', kind: 'deterministic' },
    ],
    blocker: available.has('generate') ? undefined : 'Generate capability is unavailable.',
  })
  if (!available.has('generate')) blockedCapabilities.add('generate')

  nodes.push({
    key: 'verify-first-action',
    label: 'Verify first action',
    outcome: 'Independent verification determines whether the first action may advance Project World.',
    status: 'pending',
    dependencies: ['first-reversible-action'],
    capability: 'verify',
    permissionLevel: 'P0',
    confidence: 0.99,
    risk: 'low',
    completionTests: [{ description: 'Completion tests pass with inspectable evidence.', kind: 'deterministic' }],
    blocker: available.has('verify') ? undefined : 'Verification capability is unavailable.',
  })
  if (!available.has('verify')) blockedCapabilities.add('verify')

  for (const [index, deliverable] of meaning.deliverables.slice(1, 4).entries()) {
    nodes.push({
      key: `deliverable-${index + 2}`,
      label: `Create deliverable ${index + 2}`,
      outcome: deliverable,
      status: 'pending',
      dependencies: ['verify-first-action'],
      capability: 'generate',
      permissionLevel: 'P1',
      confidence: 0.8,
      risk: 'low',
      completionTests: [{ description: `Deliverable exists and matches: ${deliverable}`, kind: 'user' }],
    })
  }

  const external = explicitExternalAction(meaning.desiredReality)
  if (external) {
    const canExecute = available.has(external.capability)
    if (!canExecute) blockedCapabilities.add(external.capability)

    const priorDeliverables = nodes
      .filter((node) => node.key === 'verify-first-action' || node.key.startsWith('deliverable-'))
      .map((node) => node.key)

    nodes.push({
      key: 'explicit-external-action',
      label: external.label,
      outcome: meaning.desiredReality,
      status: 'pending',
      dependencies: priorDeliverables.length ? priorDeliverables : ['verify-first-action'],
      capability: external.capability,
      permissionLevel: external.permission,
      confidence: 0.7,
      risk: external.permission === 'P3' ? 'high' : 'medium',
      completionTests: [{ description: 'External effect is independently observed and verified.', kind: 'external' }],
      blocker: canExecute ? undefined : `${external.capability} capability is not currently attached.`,
    })
  }

  const reason = [
    'Smallest viable route from resolved meaning.',
    meaning.knownUnknowns.length
      ? `${meaning.knownUnknowns.length} known unknown${meaning.knownUnknowns.length === 1 ? '' : 's'} remain explicit.`
      : 'No material unknowns were supplied.',
    blockedCapabilities.size
      ? `Unavailable capabilities remain blocked: ${Array.from(blockedCapabilities).join(', ')}.`
      : 'All planned capabilities are available.',
  ].join(' ')

  return { reason, nodes, blockedCapabilities: Array.from(blockedCapabilities) }
}
