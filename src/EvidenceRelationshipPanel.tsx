import { useMemo } from 'react'
import type { ProjectLedgers, ProjectWorld } from './lib/perception-backend'
import { buildEvidenceRelationshipMap } from './lib/evidence-relationship-map'

type Props = {
  world: ProjectWorld
  ledgers: ProjectLedgers | null
}

function shortDate(value: string | null) {
  if (!value) return 'No successful scan recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Timestamp unverified' : date.toLocaleString()
}

function StateLabel({ state }: { state: string }) {
  const label = state.replace(/_/g, ' ')
  return <span className={`ledger-state ledger-state--${state}`}>{label}</span>
}

export function EvidenceRelationshipPanel({ world, ledgers }: Props) {
  const map = useMemo(() => buildEvidenceRelationshipMap(world, ledgers), [world, ledgers])
  const visibleClaims = map.claims.slice(0, 10)
  const visibleObservations = map.observations.slice(0, 8)

  return (
    <div className="evidence-relationship-panel" aria-label="Read-only evidence relationship map">
      <p className="evidence-map-caution">
        READ-ONLY EVIDENCE MAP · Recorded observations are not verified claims. Model
        confidence, a user statement, and a successful fetch do not authorize an action.
      </p>
      <div className="evidence-map-metrics" aria-label="Project-scoped evidence counts">
        <div><strong>{map.sources.length}</strong><span>Bound sources</span></div>
        <div><strong>{map.observations.length}</strong><span>Source records</span></div>
        <div><strong>{map.claims.length}</strong><span>Ledger claims</span></div>
        <div><strong>{map.contradictedClaims}</strong><span>Conflict flags</span></div>
      </div>

      <div className="evidence-map-section">
        <h3>Claim relationships</h3>
        <p className="evidence-map-helper">
          Claims are connected to raw observations only by explicit observation IDs.
          {map.unlinkedClaims > 0 ? ` ${map.unlinkedClaims} claim(s) have no exact source-observation link.` : ''}
        </p>
        {visibleClaims.length === 0 ? <p>No epistemic claims have been recorded for this Project World.</p> : (
          <ol className="evidence-map-list">
            {visibleClaims.map(claim => (
              <li key={claim.id}>
                <div className="evidence-map-row-title">
                  <StateLabel state={claim.state} />
                  <strong>{claim.statement}</strong>
                </div>
                <small>{claim.claimKey} · Recorded confidence {Math.round(claim.confidence * 100)}%</small>
                <p>
                  {claim.linkedObservationIds.length
                    ? `Explicit links to ${claim.linkedObservationIds.length} raw observation(s).`
                    : 'No exact raw-observation link recorded; this claim is not independently corroborated here.'}
                  {claim.provenanceKinds.length ? ` Provenance labels: ${claim.provenanceKinds.join(', ')}.` : ''}
                </p>
                {(claim.contradictionClaimIds.length > 0 || claim.unresolvedContradictionCount > 0) && (
                  <p className="evidence-map-conflict">
                    Recorded conflicts: {claim.contradictionClaimIds.length} linked claim(s)
                    {claim.unresolvedContradictionCount > 0
                      ? `, ${claim.unresolvedContradictionCount} unresolved reference(s)` : ''}. Review required.
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        {map.claims.length > visibleClaims.length && <small>Showing latest {visibleClaims.length} of {map.claims.length} claims.</small>}
      </div>

      <div className="evidence-map-section">
        <h3>Evidence chain: sources → observations</h3>
        {map.sources.length === 0 ? <p>No source has been explicitly bound to this Project World.</p> : (
          <ul className="evidence-map-source-list">
            {map.sources.slice(0, 10).map(source => (
              <li key={source.id}>
                <strong>{source.locator ? (
                  <a href={source.locator} target="_blank" rel="noopener noreferrer">{source.label}</a>
                ) : source.label}</strong>
                <span>{source.provider} · {source.stale ? 'STALE / NOT RECENTLY CHECKED' : 'Within scan freshness window'}</span>
                <small>Last recorded sync: {shortDate(source.lastSyncedAt)}</small>
                {source.error && <small className="evidence-map-conflict">Last source error: {source.error}</small>}
              </li>
            ))}
          </ul>
        )}
        <h4>Recent recorded source observations</h4>
        {visibleObservations.length === 0 ? <p>No project-bound source observations are available.</p> : (
          <ol className="evidence-map-list">
            {visibleObservations.map(observation => (
              <li key={observation.id}>
                <strong>{observation.sourceRef
                  ? <a href={observation.sourceRef} target="_blank" rel="noopener noreferrer">{observation.sourceLabel}</a>
                  : observation.sourceLabel}</strong>
                <p>{observation.summary || observation.kind}</p>
                <small>Observed {shortDate(observation.observedAt)} · Imported {shortDate(observation.ingestedAt)}</small>
              </li>
            ))}
          </ol>
        )}
        {map.sourceObservationsWithoutProjectBindings > 0 && (
          <p className="evidence-map-conflict">
            {map.sourceObservationsWithoutProjectBindings} input observation(s) were excluded because their
            project binding or ownership could not be verified.
          </p>
        )}
        <p className="evidence-map-helper">
          This view does not infer people, organizations, influence networks, causal relationships,
          truth, or execution authority. Those require independent evidence and explicit verification.
        </p>
      </div>
    </div>
  )
}
