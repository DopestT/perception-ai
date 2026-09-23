import { describe, expect, it } from 'vitest'
import {
  isTrustedClaim,
  latestClaimByKey,
  mayAdvanceAuthoritativeTruth,
  type EpistemicLedgerEntry,
  type ExecutionLedgerEntry,
} from './perception-ledgers'

const epistemicBase: EpistemicLedgerEntry = {
  id: 'e1',
  projectId: 'p1',
  claimKey: 'domain.connected',
  statement: 'The domain is connected.',
  state: 'observed',
  confidence: 1,
  provenance: [],
  temporalValidFrom: '2026-09-01T00:00:00.000Z',
  contradictionRefs: [],
  routeImpact: '',
  metadata: {},
  createdAt: '2026-09-01T00:00:00.000Z',
}

const executionBase: ExecutionLedgerEntry = {
  id: 'x1',
  projectId: 'p1',
  actionKey: 'deploy.frontend',
  phase: 'attempted',
  permissionLevel: 'P2',
  evidence: [],
  details: {},
  createdAt: '2026-09-01T00:00:00.000Z',
}

describe('Perception v0.2 ledgers', () => {
  it('trusts observed or confirmed claims only while temporally valid', () => {
    expect(isTrustedClaim(epistemicBase, new Date('2026-09-02T00:00:00.000Z'))).toBe(true)
    expect(isTrustedClaim({ ...epistemicBase, state: 'inferred' }, new Date('2026-09-02T00:00:00.000Z'))).toBe(false)
    expect(
      isTrustedClaim(
        { ...epistemicBase, temporalValidUntil: '2026-09-01T12:00:00.000Z' },
        new Date('2026-09-02T00:00:00.000Z'),
      ),
    ).toBe(false)
  })

  it('selects the newest append-only claim for a claim key', () => {
    const newer = {
      ...epistemicBase,
      id: 'e2',
      state: 'stale' as const,
      createdAt: '2026-09-03T00:00:00.000Z',
    }
    expect(latestClaimByKey([epistemicBase, newer], 'domain.connected')?.id).toBe('e2')
  })

  it('does not advance truth after an attempted or merely observed effect', () => {
    const observed: ExecutionLedgerEntry = {
      ...executionBase,
      id: 'x2',
      phase: 'observed',
      evidence: ['Provider returned 200'],
      createdAt: '2026-09-01T00:01:00.000Z',
    }
    expect(mayAdvanceAuthoritativeTruth([executionBase, observed], 'deploy.frontend')).toBe(false)
  })

  it('allows authoritative truth to advance only after verified evidence', () => {
    const verified: ExecutionLedgerEntry = {
      ...executionBase,
      id: 'x3',
      phase: 'verified',
      evidence: ['Production endpoint served expected build SHA'],
      createdAt: '2026-09-01T00:02:00.000Z',
    }
    expect(mayAdvanceAuthoritativeTruth([executionBase, verified], 'deploy.frontend')).toBe(true)
  })
})
