import { describe, expect, it } from 'vitest'
import { routeCapabilityNode, routePlannedCapabilities } from '../../supabase/functions/_shared/capability-router'
import type { PlannedRouteNode } from '../../supabase/functions/_shared/reality-planner'

const node = (overrides: Partial<PlannedRouteNode> = {}): PlannedRouteNode => ({
  key: 'node',
  label: 'Node',
  outcome: 'Outcome',
  status: 'ready',
  dependencies: [],
  capability: 'reason',
  permissionLevel: 'P0',
  confidence: 1,
  risk: 'low',
  completionTests: [],
  ...overrides,
})

describe('Capability Router v1', () => {
  it('routes local reason/generate/verify capabilities without external side effects', () => {
    const decisions = routePlannedCapabilities([
      node({ key: 'reason', capability: 'reason' }),
      node({ key: 'generate', capability: 'generate', permissionLevel: 'P1' }),
      node({ key: 'verify', capability: 'verify' }),
    ])

    expect(decisions.every((decision) => decision.adapter === 'local-runtime')).toBe(true)
    expect(decisions.every((decision) => decision.status === 'ready')).toBe(true)
  })

  it('selects GitHub Operator for bounded P2 code but requires an action contract and permission', () => {
    const decision = routeCapabilityNode(
      node({
        key: 'repo-change',
        capability: 'code',
        permissionLevel: 'P2',
        risk: 'medium',
      }),
      { githubOperatorAttached: true },
    )

    expect(decision.adapter).toBe('github-operator')
    expect(decision.status).toBe('needs_action_contract')
    expect(decision.permissionRequired).toBe(true)
    expect(decision.requiredInputFields).toEqual(expect.arrayContaining([
      'project_id',
      'repository',
      'branch',
      'files',
    ]))
    expect(decision.blockers.join(' ')).toContain('permission grant')
  })

  it('blocks code when no execution adapter is attached', () => {
    const decision = routeCapabilityNode(
      node({ capability: 'code', permissionLevel: 'P2', risk: 'medium' }),
      { githubOperatorAttached: false },
    )

    expect(decision.adapter).toBeNull()
    expect(decision.status).toBe('blocked')
  })

  it('never treats GitHub Operator v1 as a production deployment adapter', () => {
    const decision = routeCapabilityNode(
      node({
        capability: 'code',
        permissionLevel: 'P3',
        risk: 'high',
        label: 'Deploy verified change',
      }),
      { githubOperatorAttached: true },
    )

    expect(decision.adapter).toBeNull()
    expect(decision.status).toBe('blocked')
    expect(decision.blockers.join(' ')).toContain('production deployment')
  })
})
