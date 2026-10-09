import { describe, expect, it } from 'vitest'
import {
  classifyHagerstownWellHelp,
  deriveUrgency,
  normalizeEmail,
  normalizePhone,
  offerTimeoutSeconds,
  rankEligibleProviders,
  resolveServiceAreaKey,
  submissionFingerprintInput,
  type RoutingProvider,
  type ServiceAreaRule,
} from '../../supabase/functions/_shared/microsite-routing'

describe('Hagerstown Well Help routing', () => {
  it('normalizes contact identity deterministically', () => {
    expect(normalizeEmail('  Person@Example.COM ')).toBe('person@example.com')
    expect(normalizePhone('(301) 555-0123 x9')).toBe('30155501239')
  })

  it('prefers a valid explicit service key', () => {
    expect(classifyHagerstownWellHelp({ explicitServiceKey: 'PRESSURE_TANK', issue: 'something else' })).toEqual({
      serviceKey: 'PRESSURE_TANK',
      source: 'explicit',
      reviewRequired: false,
    })
  })

  it('classifies supported issue text and urgency deterministically', () => {
    const cases = [
      ['no water since this morning', 'NO_WATER', 'EMERGENCY'],
      ['well pump failed and we have no usable water', 'WELL_PUMP', 'EMERGENCY'],
      ['low pressure throughout the house', 'LOW_PRESSURE', 'ROUTINE'],
      ['pressure tank is short cycling', 'PRESSURE_TANK', 'ROUTINE'],
      ['need water treatment and a softener', 'WATER_TREATMENT', 'ROUTINE'],
      ['need a well diagnostic inspection', 'WELL_DIAGNOSTIC', 'ROUTINE'],
    ] as const

    for (const [issue, serviceKey, urgency] of cases) {
      const classified = classifyHagerstownWellHelp({ issue })
      expect(classified.serviceKey).toBe(serviceKey)
      expect(classified.reviewRequired).toBe(false)
      expect(deriveUrgency({ serviceKey, issue })).toBe(urgency)
    }
  })

  it('fails ambiguous or unsupported issue text into manual review', () => {
    expect(classifyHagerstownWellHelp({ issue: 'low pressure and water treatment system issue' })).toEqual({
      serviceKey: null,
      source: 'ambiguous',
      reviewRequired: true,
    })
    expect(classifyHagerstownWellHelp({ issue: 'need help with my house' })).toEqual({
      serviceKey: null,
      source: 'unsupported',
      reviewRequired: true,
    })
  })

  it('resolves configured service areas without hard-coded ZIP assumptions', () => {
    const rules: ServiceAreaRule[] = [
      { key: 'washington-county-md', zips: ['21740', '21742', '21713'] },
    ]
    expect(resolveServiceAreaKey('21740', rules)).toBe('washington-county-md')
    expect(resolveServiceAreaKey('20817', rules)).toBeNull()
    expect(resolveServiceAreaKey('bad-zip', rules)).toBeNull()
  })

  it('produces stable fingerprint material without raw contact values', () => {
    const value = submissionFingerprintInput({
      micrositeId: 'site-1',
      phoneHash: 'phone-hash',
      emailHash: 'email-hash',
      zip: '21740',
      issue: ' No Water ',
    })
    expect(value).toBe('site-1|phone-hash|email-hash|21740|no water')
    expect(value).not.toContain('301555')
    expect(value).not.toContain('@')
  })

  it('filters ineligible providers and scores eligible providers explainably', () => {
    const providers: RoutingProvider[] = [
      {
        id: 'a', displayName: 'Alpha', status: 'ACTIVE', acceptingNewWork: true,
        serviceKeys: ['NO_WATER'], serviceAreaKeys: ['washington-county-md'], emergencyCapable: true, priorityBias: 5,
      },
      {
        id: 'b', displayName: 'Beta', status: 'ACTIVE', acceptingNewWork: true,
        serviceKeys: ['NO_WATER'], serviceAreaKeys: ['washington-county-md'], emergencyCapable: false, priorityBias: 20,
      },
      {
        id: 'c', displayName: 'Gamma', status: 'PAUSED', acceptingNewWork: true,
        serviceKeys: ['NO_WATER'], serviceAreaKeys: ['washington-county-md'], emergencyCapable: true, priorityBias: 20,
      },
    ]

    const result = rankEligibleProviders({
      providers,
      performance: {
        a: { acceptanceRate: 0.8, medianResponseSeconds: 60, completionRate: 0.75 },
        b: { acceptanceRate: 1, medianResponseSeconds: 10, completionRate: 1 },
        c: { acceptanceRate: 1, medianResponseSeconds: 10, completionRate: 1 },
      },
      serviceKey: 'NO_WATER',
      serviceAreaKey: 'washington-county-md',
      urgency: 'EMERGENCY',
      timeoutSeconds: 300,
    })

    expect(result.eligible.map((item) => item.provider.id)).toEqual(['a'])
    expect(result.eligible[0].score).toBeCloseTo(78.75)
    expect(result.eligible[0].scoreReasons).toEqual({
      base: 50,
      priorityBias: 5,
      acceptanceRate: 12,
      responseSpeed: 8,
      completionRate: 3.75,
    })
    expect(result.ineligible).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: 'b', reasons: expect.arrayContaining(['emergency_capability']) }),
      expect.objectContaining({ providerId: 'c', reasons: expect.arrayContaining(['status']) }),
    ]))
  })

  it('clamps priority bias and uses stable tie ordering', () => {
    const base = {
      status: 'ACTIVE' as const,
      acceptingNewWork: true,
      serviceKeys: ['LOW_PRESSURE'] as const,
      serviceAreaKeys: ['washington-county-md'] as const,
      emergencyCapable: false,
    }
    const providers: RoutingProvider[] = [
      { id: 'z', displayName: 'Same', ...base, serviceKeys: [...base.serviceKeys], serviceAreaKeys: [...base.serviceAreaKeys], priorityBias: 999 },
      { id: 'a', displayName: 'Same', ...base, serviceKeys: [...base.serviceKeys], serviceAreaKeys: [...base.serviceAreaKeys], priorityBias: 999 },
    ]
    const result = rankEligibleProviders({
      providers,
      performance: {},
      serviceKey: 'LOW_PRESSURE',
      serviceAreaKey: 'washington-county-md',
      urgency: 'ROUTINE',
      timeoutSeconds: 1800,
    })
    expect(result.eligible.map((item) => item.provider.id)).toEqual(['a', 'z'])
    expect(result.eligible[0].scoreReasons.priorityBias).toBe(20)
  })

  it('selects timeout by urgency', () => {
    expect(offerTimeoutSeconds('EMERGENCY', { emergencyTimeoutSeconds: 300, routineTimeoutSeconds: 1800 })).toBe(300)
    expect(offerTimeoutSeconds('ROUTINE', { emergencyTimeoutSeconds: 300, routineTimeoutSeconds: 1800 })).toBe(1800)
  })
})
