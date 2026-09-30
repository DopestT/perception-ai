import { describe, expect, it } from 'vitest'
import { mapProjectReality, type ProjectRealitySnapshot } from './reality-mapper'
import { planDynamicRealityRoute } from './reality-planner'

const baseMeaning = {
  desiredReality: 'Launch a verified product',
  currentReality: 'Only direct intent is known.',
  constraints: [],
  successCriteria: ['The product is ready'],
  deliverables: ['Launch plan'],
  knownUnknowns: ['Current launch assets are unknown'],
}

const snapshot: ProjectRealitySnapshot = {
  currentReality: 'Verified first-action brief created; broader objective remains active.',
  desiredReality: 'Launch a verified product',
  artifacts: [
    {
      title: 'Verified First-Action Brief',
      artifactType: 'execution_brief',
      content: 'Desired reality: Launch a verified product\nNext reversible move: inspect what exists.',
    },
  ],
  verifications: [{ passed: true, details: { kind: 'deterministic_first_action_brief' } }],
  epistemic: [],
  execution: [],
  blockers: [],
}

describe('Project World Reality Mapper v0.3', () => {
  it('does not treat the first-action brief repeating desired reality as completion evidence', () => {
    const map = mapProjectReality(baseMeaning, snapshot)

    expect(map.completedDeliverables).not.toContain('Launch plan')
    expect(map.gaps.some((gap) => gap.kind === 'deliverable' && gap.statement === 'Launch plan')).toBe(true)
  })

  it('omits a deliverable already represented by verified project evidence', () => {
    const map = mapProjectReality(
      { ...baseMeaning, deliverables: ['Launch plan'], knownUnknowns: [] },
      {
        ...snapshot,
        artifacts: [{
          title: 'Launch plan',
          artifactType: 'plan',
          content: 'Verified launch plan artifact',
        }],
      },
    )

    expect(map.completedDeliverables).toContain('Launch plan')
    expect(map.gaps.some((gap) => gap.statement === 'Launch plan')).toBe(false)
  })

  it('treats observed epistemic evidence as resolving a known unknown', () => {
    const map = mapProjectReality(baseMeaning, {
      ...snapshot,
      epistemic: [{
        statement: 'Current launch assets are unknown',
        state: 'observed',
        confidence: 1,
        routeImpact: 'Current state inspected.',
      }],
    })

    expect(map.unresolvedUnknowns).toHaveLength(0)
    expect(map.gaps.some((gap) => gap.kind === 'unknown')).toBe(false)
  })
})

describe('Dynamic Route Planner v0.3', () => {
  it('routes unknown -> deliverable -> verification from mapped Project World', () => {
    const map = mapProjectReality(baseMeaning, snapshot)
    const route = planDynamicRealityRoute(baseMeaning, map, {
      availableCapabilities: ['reason', 'research', 'generate', 'verify'],
    })

    const unknown = route.nodes.find((node) => node.key.startsWith('resolve-unknown-'))
    const deliverable = route.nodes.find((node) => node.key.startsWith('advance-deliverable-'))
    const verification = route.nodes.find((node) => node.key.startsWith('verify-deliverable-'))

    expect(route.source).toBe('project_world_dynamic_v0_3')
    expect(unknown?.status).toBe('ready')
    expect(deliverable?.dependencies).toContain(unknown?.key)
    expect(verification?.dependencies).toContain(deliverable?.key)
  })

  it('routes a bounded GitHub effect directly to P2 when the first brief is already evidenced', () => {
    const meaning = {
      desiredReality: 'Create docs/OPERATOR_LIVE_PROOF.md in the Perception GitHub repository on a bounded branch.',
      currentReality: 'Verified first-action brief created.',
      constraints: [],
      successCriteria: ['External effect is verified.'],
      deliverables: ['Verified first-action brief'],
      knownUnknowns: [],
    }
    const map = mapProjectReality(meaning, snapshot)
    const route = planDynamicRealityRoute(meaning, map, {
      availableCapabilities: ['reason', 'generate', 'verify', 'code'],
    })

    const external = route.nodes.find((node) => node.key === 'execute-external-effect')
    expect(external?.capability).toBe('code')
    expect(external?.permissionLevel).toBe('P2')
    expect(external?.dependencies).toEqual([])
    expect(external?.status).toBe('awaiting_approval')
  })

  it('preserves missing capabilities as explicit blockers', () => {
    const map = mapProjectReality(baseMeaning, snapshot)
    const route = planDynamicRealityRoute(baseMeaning, map)

    expect(route.blockedCapabilities).toContain('research')
    expect(route.nodes.find((node) => node.key.startsWith('resolve-unknown-'))?.status).toBe('blocked')
  })

  it('loads only fresh revalidation-required warm-start scenarios', () => {
    const map = mapProjectReality(baseMeaning, snapshot)
    const route = planDynamicRealityRoute(baseMeaning, map, {
      availableCapabilities: ['reason', 'research', 'generate', 'verify'],
      warmStartScenarios: [
        {
          scenarioKey: 'stale-fast-path',
          title: 'Stale fast path',
          summary: 'Should not be trusted.',
          confidence: 0.99,
          isFresh: false,
          matchCount: 10,
          intentKeys: ['launch'],
          routeSeed: { must_revalidate: true },
        },
        {
          scenarioKey: 'continue-active-route',
          title: 'Continue active route',
          summary: 'Fresh Project World continuation.',
          confidence: 0.9,
          isFresh: true,
          matchCount: 2,
          intentKeys: ['launch', 'product'],
          routeSeed: { must_revalidate: true },
        },
      ],
    })

    expect(route.warmStartScenarioKey).toBe('continue-active-route')
    expect(route.reason).toContain('Warm start continue-active-route')
    expect(route.reason).toContain('must be revalidated')
  })


  it('uses learned scenario utility only after relevance ties', () => {
    const meaning = { ...baseMeaning, knownUnknowns: [] }
    const mapped = mapProjectReality(meaning, snapshot)

    const plan = planDynamicRealityRoute(meaning, mapped, {
      availableCapabilities: ['reason', 'generate', 'verify'],
      warmStartScenarios: [
        {
          scenarioKey: 'lower-utility',
          title: 'Lower utility',
          summary: 'Previously less useful',
          confidence: 0.95,
          isFresh: true,
          matchCount: 2,
          utilityScore: 0.25,
          intentKeys: ['launch'],
          routeSeed: { must_revalidate: true },
        },
        {
          scenarioKey: 'higher-utility',
          title: 'Higher utility',
          summary: 'Previously useful',
          confidence: 0.8,
          isFresh: true,
          matchCount: 2,
          utilityScore: 0.75,
          intentKeys: ['launch'],
          routeSeed: { must_revalidate: true },
        },
        {
          scenarioKey: 'less-relevant',
          title: 'Less relevant',
          summary: 'Utility must not beat relevance',
          confidence: 1,
          isFresh: true,
          matchCount: 1,
          utilityScore: 1,
          intentKeys: ['launch'],
          routeSeed: { must_revalidate: true },
        },
      ],
    })

    expect(plan.warmStartScenarioKey).toBe('higher-utility')
  })
})
