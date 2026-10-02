import { describe, expect, it } from 'vitest'
import { planInitialRealityRoute } from '../../supabase/functions/_shared/reality-planner'

const meaning = (desiredReality: string) => ({
  desiredReality,
  currentReality: 'Repository exists and main is protected from direct Operator writes.',
  constraints: [],
  successCriteria: ['External effect is independently verified.'],
  deliverables: ['Verified repository change'],
  urgency: 'normal' as const,
  knownUnknowns: [],
  inferredClaims: [],
  confidence: 1,
  source: 'deterministic_fallback' as const,
})

describe('Operator repository routing', () => {
  it('routes bounded GitHub repository changes through code at P2', () => {
    const route = planInitialRealityRoute(
      meaning('Change the Perception GitHub repository on a bounded branch and verify the result.'),
      { availableCapabilities: ['reason', 'generate', 'verify', 'code'] },
    )
    const node = route.nodes.find((candidate) => candidate.key === 'explicit-external-action')
    expect(node?.capability).toBe('code')
    expect(node?.permissionLevel).toBe('P2')
    expect(node?.blocker).toBeUndefined()
  })

  it('keeps repository intent when the requested file contains a proof message', () => {
    const route = planInitialRealityRoute(
      meaning(
        'Create docs/OPERATOR_LIVE_PROOF.md in the Perception GitHub repository on a bounded branch with a short non-secret proof message. Verify the external effect independently and update Project World without changing main.',
      ),
      { availableCapabilities: ['reason', 'generate', 'verify', 'code'] },
    )
    const node = route.nodes.find((candidate) => candidate.key === 'explicit-external-action')
    expect(node?.capability).toBe('code')
    expect(node?.permissionLevel).toBe('P2')
    expect(node?.blocker).toBeUndefined()
  })

  it('keeps production deployment at P3', () => {
    const route = planInitialRealityRoute(
      meaning('Deploy the verified change to production.'),
      { availableCapabilities: ['reason', 'generate', 'verify', 'code'] },
    )
    const node = route.nodes.find((candidate) => candidate.key === 'explicit-external-action')
    expect(node?.capability).toBe('code')
    expect(node?.permissionLevel).toBe('P3')
  })
})
