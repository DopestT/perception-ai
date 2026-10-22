import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../supabase/functions/perceive-objective/index.ts', import.meta.url),
  'utf8',
)

describe('perceive-objective capability ledger regression', () => {
  it('binds the external capability decision to its persisted continuation route node', () => {
    const useOffset = source.indexOf('route_node_id: routeNodeId')

    expect(useOffset).toBeGreaterThan(-1)
    expect(source.lastIndexOf('const routeNodeId', useOffset)).toBeGreaterThan(-1)
    expect(source).toContain(
      'const continuationIndex = continuationPlanNodes.findIndex((candidate) => candidate.key === decision.nodeKey)',
    )
    expect(source).toContain('const expectedSortOrder = continuationIndex >= 0 ? continuationIndex + 1 : null')
  })

  it('derives routingStatus from the resolved action contract with the capability decision as fallback', () => {
    const useOffset = source.indexOf('routing_status: routingStatus')

    expect(useOffset).toBeGreaterThan(-1)
    expect(source.lastIndexOf('const routingStatus', useOffset)).toBeGreaterThan(-1)
    expect(source).toContain('const routingStatus = actionContract?.status ?? decision.status')
  })
})
