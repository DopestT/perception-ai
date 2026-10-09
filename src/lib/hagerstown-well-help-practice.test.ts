import { beforeAll, describe, expect, it } from 'vitest'

type ScenarioResult = {
  id: string
  passed: boolean
  leadIds: string[]
  routeIds: string[]
  acceptedProviderId: string | null
  externalDeliveries: number
  events: string[]
  notes: string[]
}

type PracticeReport = {
  passed: boolean
  externalDeliveries: number
  scenarios: ScenarioResult[]
}

let report: PracticeReport

beforeAll(async () => {
  const path = '../../scripts/hagerstown-well-help-practice.mjs'
  const module = await import(/* @vite-ignore */ path)
  report = await module.runPracticeSuite()
})

function scenario(id: string) {
  const found = report.scenarios.find((item) => item.id === id)
  expect(found, `missing practice scenario ${id}`).toBeTruthy()
  return found as ScenarioResult
}

describe('Hagerstown Well Help ten-scenario zero-send practice suite', () => {
  it('1. emergency lead is accepted by the first provider', () => {
    const result = scenario('01-emergency-first-accept')
    expect(result.passed).toBe(true)
    expect(result.acceptedProviderId).toBe('provider-a')
    expect(result.externalDeliveries).toBe(0)
  })

  it('2. first provider times out, second passes, third accepts', () => {
    const result = scenario('02-timeout-pass-third-accept')
    expect(result.passed).toBe(true)
    expect(result.acceptedProviderId).toBe('provider-c')
    expect(result.events).toEqual(expect.arrayContaining(['offer.expired', 'offer.passed', 'offer.accepted']))
  })

  it('3. two simultaneous leads route independently', () => {
    const result = scenario('03-simultaneous-independent-leads')
    expect(result.passed).toBe(true)
    expect(new Set(result.leadIds).size).toBe(2)
    expect(new Set(result.routeIds).size).toBe(2)
  })

  it('4. duplicate homeowner submission resolves to one canonical lead', () => {
    const result = scenario('04-duplicate-canonical-lead')
    expect(result.passed).toBe(true)
    expect(new Set(result.leadIds).size).toBe(1)
    expect(result.events).toContain('lead.duplicate_detected')
  })

  it('5. repeated provider ACCEPT is idempotent', () => {
    const result = scenario('05-repeat-accept-idempotent')
    expect(result.passed).toBe(true)
    expect(result.acceptedProviderId).toBe('provider-a')
    expect(result.events.filter((event) => event === 'offer.accepted')).toHaveLength(1)
  })

  it('6. competing accepts yield exactly one winner', () => {
    const result = scenario('06-competing-accepts-one-winner')
    expect(result.passed).toBe(true)
    expect(['provider-a', 'provider-b']).toContain(result.acceptedProviderId)
    expect(result.events.filter((event) => event === 'offer.accepted')).toHaveLength(1)
    expect(result.notes).toContain('one_accept_one_already_assigned')
  })

  it('7. delivery failure advances the provider queue', () => {
    const result = scenario('07-delivery-failure-advances')
    expect(result.passed).toBe(true)
    expect(result.events).toContain('offer.delivery_failed')
    expect(result.notes).toContain('provider-b-offered-after-failure')
  })

  it('8. all providers unavailable produces UNROUTABLE and an honest notice', () => {
    const result = scenario('08-all-unavailable-honest-unroutable')
    expect(result.passed).toBe(true)
    expect(result.acceptedProviderId).toBeNull()
    expect(result.events).toEqual(expect.arrayContaining(['route.no_eligible_provider', 'homeowner.notice.no_provider_secured']))
    expect(result.notes).toContain('no-provider-match-claimed')
  })

  it('9. disabled and out-of-area providers are never offered', () => {
    const result = scenario('09-ineligible-providers-never-offered')
    expect(result.passed).toBe(true)
    expect(result.notes).toEqual(expect.arrayContaining(['disabled-not-offered', 'out-of-area-not-offered']))
  })

  it('10. practice mode produces zero external deliveries', () => {
    const result = scenario('10-zero-external-deliveries')
    expect(result.passed).toBe(true)
    expect(result.externalDeliveries).toBe(0)
    expect(report.externalDeliveries).toBe(0)
    expect(report.scenarios).toHaveLength(10)
    expect(report.passed).toBe(true)
  })
})
