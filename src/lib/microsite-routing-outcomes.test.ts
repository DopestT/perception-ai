import { describe, expect, it } from 'vitest'
import {
  canTransitionRoutingLeadState,
  renderHomeownerNotice,
} from '../../supabase/functions/_shared/microsite-routing'

describe('Hagerstown Well Help homeowner notices', () => {
  it('renders a request-received notice without implying a provider match', () => {
    const notice = renderHomeownerNotice('REQUEST_RECEIVED', {
      leadId: 'lead-1',
      simulated: true,
    })
    expect(notice.simulated).toBe(true)
    expect(notice.body).toMatch(/received/i)
    expect(notice.body).not.toMatch(/accepted|matched with/i)
  })

  it('names a provider only after an accepted provider is supplied', () => {
    expect(() => renderHomeownerNotice('PROVIDER_ACCEPTED', {
      leadId: 'lead-1',
      providerName: 'Provider A',
      simulated: true,
    })).toThrow(/accepted provider/i)

    const notice = renderHomeownerNotice('PROVIDER_ACCEPTED', {
      leadId: 'lead-1',
      acceptedProviderId: 'provider-a',
      providerName: 'Provider A',
      simulated: true,
    })
    expect(notice.body).toContain('Provider A')
    expect(notice.body).toMatch(/accepted/i)
  })

  it('renders honest exhaustion with no provider claim or internal scores', () => {
    const notice = renderHomeownerNotice('NO_PROVIDER_SECURED', {
      leadId: 'lead-1',
      providerName: 'Never expose me',
      internal: { score: 99, ranking: ['Provider A'] },
      simulated: true,
    })
    expect(notice.body).toMatch(/not secured|could not secure/i)
    expect(notice.body).not.toContain('Never expose me')
    expect(JSON.stringify(notice)).not.toContain('99')
    expect(JSON.stringify(notice)).not.toContain('ranking')
  })

  it('renders cancellation and outcome follow-up without internal routing details', () => {
    expect(renderHomeownerNotice('REQUEST_CANCELLED', { leadId: 'lead-1', simulated: true }).body).toMatch(/cancel/i)
    expect(renderHomeownerNotice('OUTCOME_FOLLOWUP', { leadId: 'lead-1', simulated: true }).body).toMatch(/service|request/i)
  })
})

describe('Hagerstown Well Help outcome state machine', () => {
  it('allows the forward successful path', () => {
    expect(canTransitionRoutingLeadState('ACCEPTED', 'CONTACTED')).toBe(true)
    expect(canTransitionRoutingLeadState('CONTACTED', 'APPOINTMENT')).toBe(true)
    expect(canTransitionRoutingLeadState('APPOINTMENT', 'COMPLETED')).toBe(true)
  })

  it('allows lost outcomes only from active accepted-service states', () => {
    expect(canTransitionRoutingLeadState('ACCEPTED', 'LOST')).toBe(true)
    expect(canTransitionRoutingLeadState('CONTACTED', 'LOST')).toBe(true)
    expect(canTransitionRoutingLeadState('APPOINTMENT', 'LOST')).toBe(true)
    expect(canTransitionRoutingLeadState('NEW', 'LOST')).toBe(false)
    expect(canTransitionRoutingLeadState('COMPLETED', 'LOST')).toBe(false)
  })

  it('allows cancellation before completion but rejects backwards transitions', () => {
    expect(canTransitionRoutingLeadState('NEW', 'CANCELLED')).toBe(true)
    expect(canTransitionRoutingLeadState('ROUTING', 'CANCELLED')).toBe(true)
    expect(canTransitionRoutingLeadState('ACCEPTED', 'CANCELLED')).toBe(true)
    expect(canTransitionRoutingLeadState('APPOINTMENT', 'CANCELLED')).toBe(true)
    expect(canTransitionRoutingLeadState('COMPLETED', 'CANCELLED')).toBe(false)
    expect(canTransitionRoutingLeadState('APPOINTMENT', 'CONTACTED')).toBe(false)
    expect(canTransitionRoutingLeadState('COMPLETED', 'APPOINTMENT')).toBe(false)
  })
})
