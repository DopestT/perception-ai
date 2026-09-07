import { describe, expect, it } from 'vitest'
import { createModel, perceiveInput } from './perception-model'
import { runFirstActionCycle } from './perception-flow'
import { getRouteReadiness } from './perception-review'
import { hasPermission } from './perception-runtime'

describe('Perception first vertical runtime slice', () => {
  it('treats a direct goal statement as trusted evidence and makes it routeable', () => {
    const model = perceiveInput(createModel(''), 'I want to build a neighborhood tool for finding open community resources.')
    const readiness = getRouteReadiness(model)

    expect(model.goal.desiredReality).toContain('I want to build')
    expect(model.goal.beliefs.some((belief) => belief.scope === 'project' && belief.state === 'observed')).toBe(true)
    expect(readiness.canRoute).toBe(true)
    expect(readiness.label).toBe('ROUTED')
  })

  it('runs understood → routed → action started → verified and records Project World progress', () => {
    const statement = 'I want to build a neighborhood tool for finding open community resources.'
    const model = perceiveInput(createModel(''), statement)
    const cycle = runFirstActionCycle(model, statement)

    expect(cycle.nodes).toHaveLength(3)
    expect(cycle.nodes.every((node) => node.status === 'completed')).toBe(true)
    expect(cycle.verification.passed).toBe(true)
    expect(cycle.artifact.content).toContain(`Objective: ${statement}`)
    expect(cycle.worldUpdate.stage).toBe('verified_progress')
    expect(cycle.objective.status).toBe('running')
    expect(cycle.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      'objective.created',
      'route.created',
      'artifact.created',
      'verification.passed',
      'objective.updated',
    ]))
  })

  it('keeps ambiguous input unresolved and preserves permission boundaries', () => {
    const ambiguous = perceiveInput(createModel(''), 'deer')
    expect(getRouteReadiness(ambiguous).canRoute).toBe(false)

    const statement = 'I want to draft a launch brief.'
    const model = perceiveInput(createModel(''), statement)
    const cycle = runFirstActionCycle(model, statement)
    const p1Node = cycle.nodes[1]
    const p2Node = { ...p1Node, permissionLevel: 'P2' as const }

    expect(hasPermission(p1Node, [])).toBe(true)
    expect(hasPermission(p2Node, [])).toBe(false)
  })
})
