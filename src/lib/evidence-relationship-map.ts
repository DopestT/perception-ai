import type { ProjectLedgers, ProjectWorld } from './perception-backend'

type SourceBinding = ProjectWorld['sources'][number]
type Observation = ProjectWorld['source_observations'][number]
type LedgerClaim = ProjectLedgers['epistemic'][number]

export type EvidenceClaim = {
  id: string
  statement: string
  state: LedgerClaim['state']
  claimKey: string
  confidence: number
  provenanceKinds: string[]
  linkedObservationIds: string[]
  contradictionClaimIds: string[]
  unresolvedContradictionCount: number
  routeImpact: string
  createdAt: string
}

export type EvidenceSource = {
  id: string
  provider: string
  label: string
  locator: string | null
  lastSyncedAt: string | null
  freshnessMinutes: number
  stale: boolean
  error: string | null
}

export type EvidenceObservation = {
  id: string
  sourceId: string
  sourceLabel: string
  kind: string
  summary: string
  sourceRef: string | null
  observedAt: string
  ingestedAt: string
}

export type EvidenceRelationship =
  | { kind: 'observed_from'; fromId: string; toId: string }
  | { kind: 'claim_cites_observation'; fromId: string; toId: string }
  | { kind: 'recorded_contradiction'; fromId: string; toId: string }

export type EvidenceRelationshipMap = {
  projectId: string
  sources: EvidenceSource[]
  observations: EvidenceObservation[]
  claims: EvidenceClaim[]
  relationships: EvidenceRelationship[]
  unlinkedClaims: number
  contradictedClaims: number
  sourceObservationsWithoutProjectBindings: number
  checkedAt: string
}

// No fuzzy joins, model inferences or automatic cross-project bindings. Only
// exact source/observation IDs and explicitly recorded claim references create edges.
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getClaimObservationId(value: unknown): string | null {
  const obj = record(value)
  if (!obj) return null
  return safeString(obj.observation_id) ?? safeString(obj.source_observation_id)
}

function getContradictionId(value: unknown): string | null {
  if (typeof value === 'string') return safeString(value)
  const obj = record(value)
  return obj ? safeString(obj.claim_id) ?? safeString(obj.entry_id) : null
}

export function safeEvidenceUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

function compareByNewest<T>(a: T, b: T, field: (item: T) => string) {
  return (Date.parse(field(b)) || 0) - (Date.parse(field(a)) || 0)
}

export function buildEvidenceRelationshipMap(
  world: ProjectWorld,
  ledgers: ProjectLedgers | null,
  now = new Date(),
): EvidenceRelationshipMap {
  const projectId = world.project.id
  const checkedAt = now.toISOString()
  const scopedSources = new Map<string, SourceBinding>()
  for (const entry of world.sources ?? []) {
    if (entry.binding.active
      && entry.binding.project_id === projectId
      && entry.binding.source_id === entry.source.id) {
      scopedSources.set(entry.source.id, entry)
    }
  }

  const sources: EvidenceSource[] = [...scopedSources.values()].map(({ source }) => {
    const lastSync = source.last_synced_at
    const age = lastSync ? now.getTime() - Date.parse(lastSync) : Number.POSITIVE_INFINITY
    return {
      id: source.id,
      provider: source.provider,
      label: source.label || source.external_id,
      locator: safeEvidenceUrl(source.locator),
      lastSyncedAt: lastSync,
      freshnessMinutes: source.freshness_sla_minutes,
      stale: !Number.isFinite(age) || age < 0 || age > source.freshness_sla_minutes * 60_000,
      error: source.last_error,
    }
  }).sort((a, b) => a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label))

  const observations: EvidenceObservation[] = (world.source_observations ?? [])
    .filter((obs: Observation) => obs.user_id && scopedSources.get(obs.source_id)?.source.user_id === obs.user_id)
    .map((obs: Observation) => ({
      id: obs.id,
      sourceId: obs.source_id,
      sourceLabel: scopedSources.get(obs.source_id)!.source.label || scopedSources.get(obs.source_id)!.source.external_id,
      kind: obs.observation_kind,
      summary: obs.summary,
      sourceRef: safeEvidenceUrl(obs.source_ref),
      observedAt: obs.observed_at,
      ingestedAt: obs.ingested_at,
    }))
    .sort((a, b) => compareByNewest(a, b, o => o.ingestedAt))
  const observationIds = new Set(observations.map(o => o.id))
  const rows = (ledgers?.epistemic ?? []).filter(entry => entry.project_id === projectId)
  const claimIds = new Set(rows.map(row => row.id))
  const claims: EvidenceClaim[] = rows.map(entry => {
    const kinds = new Set<string>()
    const linkedIds = new Set<string>()
    for (const item of entry.provenance ?? []) {
      const obj = record(item)
      if (obj && safeString(obj.kind)) kinds.add(safeString(obj.kind)!)
      const id = getClaimObservationId(item)
      if (id && observationIds.has(id)) linkedIds.add(id)
    }
    const recordedContradictions = (entry.contradiction_refs ?? [])
      .map(getContradictionId).filter((id): id is string => Boolean(id))
    const matched = [...new Set(recordedContradictions.filter(id => claimIds.has(id) && id !== entry.id))]
    return {
      id: entry.id,
      statement: entry.statement,
      state: entry.state,
      claimKey: entry.claim_key,
      confidence: entry.confidence,
      provenanceKinds: [...kinds],
      linkedObservationIds: [...linkedIds],
      contradictionClaimIds: matched,
      unresolvedContradictionCount: recordedContradictions.length - matched.length,
      routeImpact: entry.route_impact,
      createdAt: entry.created_at,
    }
  }).sort((a, b) => compareByNewest(a, b, c => c.createdAt))

  const relationships: EvidenceRelationship[] = [
    ...observations.map((o): EvidenceRelationship => ({ kind: 'observed_from', fromId: o.id, toId: o.sourceId })),
    ...claims.flatMap(c => c.linkedObservationIds.map((id): EvidenceRelationship =>
      ({ kind: 'claim_cites_observation', fromId: c.id, toId: id }))),
    ...claims.flatMap(c => c.contradictionClaimIds.map((id): EvidenceRelationship =>
      ({ kind: 'recorded_contradiction', fromId: c.id, toId: id }))),
  ]

  return {
    projectId,
    sources,
    observations,
    claims,
    relationships,
    unlinkedClaims: claims.filter(c => !c.linkedObservationIds.length).length,
    contradictedClaims: claims.filter(c => c.state === 'contradicted' || c.contradictionClaimIds.length > 0 || c.unresolvedContradictionCount > 0).length,
    sourceObservationsWithoutProjectBindings: (world.source_observations ?? []).length - observations.length,
    checkedAt,
  }
}
