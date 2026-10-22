import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../supabase/functions/perceive-objective/index.ts', import.meta.url),
  'utf8',
)

describe('perceive-objective capability ledger regression', () => {
  it('defines routeNodeId before using it in the capability-routing ledger insert', () => {
    const useOffset = source.indexOf('route_node_id: routeNodeId')

    expect(useOffset).toBeGreaterThan(-1)
    expect(source.lastIndexOf('const routeNodeId', useOffset)).toBeGreaterThan(-1)
  })

  it('defines routingStatus before using it in the capability-routing ledger insert', () => {
    const useOffset = source.indexOf('routing_status: routingStatus')

    expect(useOffset).toBeGreaterThan(-1)
    expect(source.lastIndexOf('const routingStatus', useOffset)).toBeGreaterThan(-1)
  })
})
