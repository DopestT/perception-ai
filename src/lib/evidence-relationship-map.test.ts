import { describe, expect, it } from 'vitest'
import type { ProjectLedgers, ProjectWorld } from './perception-backend'
import { buildEvidenceRelationshipMap, safeEvidenceUrl } from './evidence-relationship-map'

const fixedNow = new Date('2026-11-13T13:00:00.000Z')

function fixture() {
  const source = {
    id: 'source-1', user_id: 'owner-1', label: 'Public evidence source',
    external_id: 'DopestT/repo', provider: 'github',
    locator: 'https://github.com/DopestT/repo',
    last_synced_at: '2026-11-13T12:30:00.000Z',
    freshness_sla_minutes: 120, last_error: null,
  }
  const world = {
    project: { id: 'project-1' },
    sources: [{ binding: { project_id: 'project-1', source_id: 'source-1', active: true }, source }],
    source_observations: [
      { id: 'observation-1', user_id: 'owner-1', source_id: 'source-1',
        observation_kind: 'github_head_commit', source_ref: 'https://github.com/DopestT/repo/commit/abc',
        summary: 'Recorded repository head', observed_at: '2026-11-12T12:00:00Z',
        ingested_at: '2026-11-13T12:45:00Z' },
    ],
  } as unknown as ProjectWorld
  const ledgers = {
    epistemic: [
      { id: 'claim-1', project_id: 'project-1', state: 'observed', statement: 'Commit was observed',
        claim_key: 'repo.head', confidence: 0.8, created_at: '2026-11-13T12:50:00Z',
        provenance: [{ kind: 'https_source', observation_id: 'observation-1' }],
        contradiction_refs: [], route_impact: 'Review only' },
    ],
    execution: [],
  } as unknown as ProjectLedgers
  return { world, ledgers }
}

describe('Evidence relationship map — provenance and project boundaries', () => {
  it('links source, observation and claim only by exact recorded IDs', () => {
    const { world, ledgers } = fixture()
    const result = buildEvidenceRelationshipMap(world, ledgers, fixedNow)
    expect(result.sources).toHaveLength(1)
    expect(result.observations).toHaveLength(1)
    expect(result.claims).toHaveLength(1)
    expect(result.relationships).toEqual([
      { kind: 'observed_from', fromId: 'observation-1', toId: 'source-1' },
      { kind: 'claim_cites_observation', fromId: 'claim-1', toId: 'observation-1' },
    ])
    expect(result.unlinkedClaims).toBe(0)
  })

  it('excludes evidence from unbound and other-project sources', () => {
    const { world, ledgers } = fixture()
    world.sources.push({
      ...world.sources[0],
      binding: { ...world.sources[0].binding, project_id: 'different-project', source_id: 'source-2' },
      source: { ...world.sources[0].source, id: 'source-2' },
    })
    world.source_observations.push({
      ...world.source_observations[0], id: 'observation-2', source_id: 'source-2',
    })
    ledgers.epistemic.push({
      ...ledgers.epistemic[0], id: 'claim-2', project_id: 'different-project',
      provenance: [{ observation_id: 'observation-2' }],
    })
    const result = buildEvidenceRelationshipMap(world, ledgers, fixedNow)
    expect(result.sources.map(s => s.id)).toEqual(['source-1'])
    expect(result.observations.map(o => o.id)).toEqual(['observation-1'])
    expect(result.claims.map(c => c.id)).toEqual(['claim-1'])
    expect(result.sourceObservationsWithoutProjectBindings).toBe(1)
  })

  it('never associates a claim merely because a source URL looks similar', () => {
    const { world, ledgers } = fixture()
    ledgers.epistemic[0].provenance = [{ kind: 'webpage', source_ref: 'https://github.com/DopestT/repo/commit/abc' }]
    const result = buildEvidenceRelationshipMap(world, ledgers, fixedNow)
    expect(result.claims[0].linkedObservationIds).toEqual([])
    expect(result.unlinkedClaims).toBe(1)
  })

  it('does not equate machine-generated meaning with independent external evidence', () => {
    const { world, ledgers } = fixture()
    ledgers.epistemic[0].provenance = [{ kind: 'meaning_resolver', source: 'deterministic_fallback' }]
    const claim = buildEvidenceRelationshipMap(world, ledgers, fixedNow).claims[0]
    expect(claim.provenanceKinds).toEqual(['meaning_resolver'])
    expect(claim.linkedObservationIds).toHaveLength(0)
    expect(claim.state).toBe('observed')
  })

  it('surfaces only explicit contradictions; preserves dangling references for review', () => {
    const { world, ledgers } = fixture()
    ledgers.epistemic.push({
      ...ledgers.epistemic[0], id: 'claim-2', statement: 'Conflicting observation',
      state: 'contradicted', provenance: [], contradiction_refs: ['claim-1', 'missing-claim'],
    })
    const map = buildEvidenceRelationshipMap(world, ledgers, fixedNow)
    const claim = map.claims.find(c => c.id === 'claim-2')!
    expect(claim.contradictionClaimIds).toEqual(['claim-1'])
    expect(claim.unresolvedContradictionCount).toBe(1)
    expect(map.contradictedClaims).toBe(1)
    expect(map.relationships).toContainEqual({
      kind: 'recorded_contradiction', fromId: 'claim-2', toId: 'claim-1',
    })
  })

  it('flags stale source scans without treating old observations as current', () => {
    const { world, ledgers } = fixture()
    world.sources[0].source.last_synced_at = '2026-09-23T12:00:00.000Z'
    const map = buildEvidenceRelationshipMap(world, ledgers, fixedNow)
    expect(map.sources[0].stale).toBe(true)
    expect(map.observations[0].observedAt).toBe('2026-11-12T12:00:00Z')
  })

  it('rejects unsafe URLs before creating user-visible links', () => {
    expect(safeEvidenceUrl('javascript:alert(1)')).toBeNull()
    expect(safeEvidenceUrl('http://example.com')).toBeNull()
    expect(safeEvidenceUrl('https://user:password@example.com/')).toBeNull()
    expect(safeEvidenceUrl('https://example.com/item')).toBe('https://example.com/item')
  })

  it('treats empty, missing or incorrectly owned evidence as unresolved', () => {
    const { world, ledgers } = fixture()
    world.source_observations[0].user_id = 'different-user'
    const result = buildEvidenceRelationshipMap(world, ledgers, fixedNow)
    expect(result.observations).toHaveLength(0)
    expect(result.unlinkedClaims).toBe(1)
    expect(result.relationships).toHaveLength(0)
  })
})
