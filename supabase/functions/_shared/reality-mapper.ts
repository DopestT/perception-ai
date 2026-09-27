import type { PlannerMeaning } from './reality-planner.ts'

export type ProjectRealitySnapshot = {
  currentReality: string
  desiredReality: string
  artifacts: Array<{
    title: string
    content?: string | null
    artifactType?: string | null
  }>
  verifications: Array<{
    passed: boolean
    details?: Record<string, unknown> | null
  }>
  epistemic: Array<{
    statement: string
    state: 'observed' | 'inferred' | 'confirmed' | 'unknown' | 'rejected' | 'stale' | 'contradicted'
    confidence: number
    routeImpact?: string | null
  }>
  execution: Array<{
    actionKey: string
    phase: 'intended' | 'authorized' | 'attempted' | 'observed' | 'verified' | 'blocked' | 'failed' | 'rolled_back'
    details?: Record<string, unknown> | null
  }>
  blockers: string[]
}

export type RealityGap = {
  key: string
  kind: 'unknown' | 'deliverable' | 'objective'
  statement: string
  priority: number
  confidence: number
  evidence: string[]
}

export type RealityMap = {
  currentReality: string
  desiredReality: string
  gaps: RealityGap[]
  blockers: string[]
  verifiedEvidence: string[]
  completedDeliverables: string[]
  unresolvedUnknowns: string[]
}

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function boundedJson(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 4000)
  } catch {
    return ''
  }
}

function directlySupports(statement: string, evidence: string[]): string[] {
  const target = normalized(statement)
  if (target.length < 6) return []

  return evidence.filter((item) => {
    const candidate = normalized(item)
    return candidate.includes(target) || target.includes(candidate)
  })
}

export function mapProjectReality(
  meaning: PlannerMeaning,
  snapshot: ProjectRealitySnapshot,
): RealityMap {
  const artifactEvidence = snapshot.artifacts.flatMap((artifact) => [
    artifact.title,
    artifact.content ?? '',
  ]).filter(Boolean)

  const epistemicEvidence = snapshot.epistemic
    .filter((claim) => claim.state === 'observed' || claim.state === 'confirmed')
    .map((claim) => claim.statement)

  const verifiedExecutionEvidence = snapshot.execution
    .filter((entry) => entry.phase === 'verified')
    .flatMap((entry) => [entry.actionKey, boundedJson(entry.details)])
    .filter(Boolean)

  const verifiedEvidence = Array.from(new Set([
    snapshot.currentReality,
    ...artifactEvidence,
    ...epistemicEvidence,
    ...verifiedExecutionEvidence,
  ].filter(Boolean)))

  const completedDeliverables: string[] = []
  const unresolvedUnknowns: string[] = []
  const gaps: RealityGap[] = []

  for (const [index, unknown] of meaning.knownUnknowns.entries()) {
    const support = directlySupports(unknown, epistemicEvidence)
    if (support.length > 0) continue

    unresolvedUnknowns.push(unknown)
    gaps.push({
      key: `unknown-${index + 1}`,
      kind: 'unknown',
      statement: unknown,
      priority: 100 - index,
      confidence: 0.9,
      evidence: [],
    })
  }

  for (const [index, deliverable] of meaning.deliverables.entries()) {
    const support = directlySupports(deliverable, verifiedEvidence)
    if (support.length > 0) {
      completedDeliverables.push(deliverable)
      continue
    }

    gaps.push({
      key: `deliverable-${index + 1}`,
      kind: 'deliverable',
      statement: deliverable,
      priority: 80 - index,
      confidence: 0.88,
      evidence: [],
    })
  }

  const desiredSupport = directlySupports(
    meaning.desiredReality,
    [
      snapshot.currentReality,
      ...verifiedExecutionEvidence,
    ],
  )

  if (
    gaps.every((gap) => gap.kind === 'unknown')
    && desiredSupport.length === 0
    && meaning.deliverables.length === 0
  ) {
    gaps.push({
      key: 'objective-gap',
      kind: 'objective',
      statement: meaning.desiredReality,
      priority: 70,
      confidence: 0.72,
      evidence: [],
    })
  }

  return {
    currentReality: snapshot.currentReality || meaning.currentReality,
    desiredReality: snapshot.desiredReality || meaning.desiredReality,
    gaps: gaps.sort((left, right) => right.priority - left.priority),
    blockers: Array.from(new Set(snapshot.blockers.filter(Boolean))),
    verifiedEvidence,
    completedDeliverables,
    unresolvedUnknowns,
  }
}
