import { describe, expect, it } from 'vitest'
import { planInitialRealityRoute } from './reality-planner'

const baseMeaning = {
  desiredReality: 'Build a verified launch plan',
  currentReality: 'Only the direct objective statement is known.',
  constraints: [],
  successCriteria: ['A launch plan exists'],
  deliverables: ['Launch plan'],
  knownUnknowns: ['Current launch assets are unknown'],
}

describe('Reality Mapper / Route Planner', () => {
  it('keeps unsupported research explicitly blocked while allowing a reversible first action', () => {
    const route = planInitialRealityRoute(baseMeaning)

    expect(route.nodes.find((node) => node.key === 'inspect-current-reality')?.status).toBe('blocked')
    expect(route.nodes.find((node) => node.key === 'first-reversible-action')?.status).toBe('ready')
    expect(route.blockedCapabilities).toContain('research')
  })

  it('activates current-reality inspection when research is attached', () => {
    const route = planInitialRealityRoute(baseMeaning, {
      availableCapabilities: ['reason', 'research', 'generate', 'verify'],
    })

    expect(route.nodes.find((node) => node.key === 'inspect-current-reality')?.status).toBe('ready')
    expect(route.blockedCapabilities).not.toContain('research')
  })

  it('requires P3 for an explicit production deployment', () => {
    const route = planInitialRealityRoute({
      ...baseMeaning,
      desiredReality: 'Deploy the verified app to production',
      knownUnknowns: [],
    }, {
      availableCapabilities: ['reason', 'generate', 'verify', 'code'],
    })

    const external = route.nodes.find((node) => node.key === 'explicit-external-action')
    expect(external?.capability).toBe('code')
    expect(external?.permissionLevel).toBe('P3')
    expect(external?.risk).toBe('high')
  })

  it('does not invent an external action when the objective does not state one', () => {
    const route = planInitialRealityRoute(baseMeaning)
    expect(route.nodes.some((node) => node.key === 'explicit-external-action')).toBe(false)
  })
})
