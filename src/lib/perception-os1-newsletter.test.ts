import { describe, expect, it } from 'vitest'
import { planOs1Newsletter } from './perception-os1-newsletter'

const draft = {
  schemaVersion: 1,
  system: 'PERCEPTION OS1',
  newsletterId: 'example-weekly',
  projectId: 'example-isolated-project',
  ownerAgentId: 'newsletter-agent-1',
  reviewerAgentId: 'independent-reviewer-1',
  brand: {
    name: 'Example Weekly',
    domain: 'example.com',
    senderEmail: 'newsletter@example.com',
  },
  brevo: {
    listId: null,
    listIsolationVerified: false,
    senderVerified: false,
    optInVerified: false,
    unsubscribeVerified: false,
  },
  stripe: {
    accountLabel: 'Verified account required before any Stripe API call',
    state: 'planned',
    offerType: 'free',
    productId: null,
    priceId: null,
    webhookVerified: false,
    portalVerified: false,
  },
  evidenceRefs: [],
  externallyApprovedActions: [],
  status: 'draft',
}

const check = (change: Record<string, unknown>) => planOs1Newsletter({ ...draft, ...change })

describe('PERCEPTION OS1 newsletter factory — safe draft planning', () => {
  it('accepts a free-first newsletter with Stripe planned but no price or account writes', () => {
    const result = planOs1Newsletter(draft)
    expect(result.valid).toBe(true)
    expect(result.externalWritesAuthorized).toBe(false)
    expect(result.tasks.map((t) => t.id)).toEqual([
      'brand', 'brevo', 'stripe', 'billing', 'verification', 'release',
    ])
  })

  it('requires Stripe planning for EVERY new newsletter, including free ones', () => {
    expect(check({ stripe: undefined }).errors).toContain('stripe_plan_required_for_every_newsletter')
    expect(check({ stripe: { ...draft.stripe, state: 'live_verified' } }).valid).toBe(false)
  })

  it('rejects owner and reviewer being the same worker', () => {
    expect(check({ reviewerAgentId: draft.ownerAgentId }).errors).toContain('independent_reviewer_required')
  })

  it('rejects missing Brevo consent and isolation contract', () => {
    expect(check({ brevo: {} }).errors).toContain('brevo_isolation_and_consent_contract_required')
    expect(check({ brevo: { ...draft.brevo, listId: -5 } }).valid).toBe(false)
  })

  it('supports each offer type without inventing prices or authorizing charges', () => {
    for (const offerType of ['free', 'subscription', 'one_time', 'hybrid']) {
      const result = check({ stripe: { ...draft.stripe, offerType } })
      expect(result.valid).toBe(true)
      expect(result.externalWritesAuthorized).toBe(false)
      expect(result.tasks.find((task) => task.id === 'stripe')?.requiresSeparateApproval).toBe(true)
    }
  })

  it('rejects unowned placeholders and non-draft release claims', () => {
    expect(check({ projectId: 'TODO_project' }).valid).toBe(false)
    expect(check({ status: 'live' }).errors).toContain('draft_os1_manifest_required')
    expect(check({ reviewerAgentId: '' }).valid).toBe(false)
  })

  it('never treats an approval reference or a completed setup checklist as authorization', () => {
    const result = check({
      externallyApprovedActions: ['fake-approval-reference'],
      stripe: { ...draft.stripe, productId: 'prod_example', priceId: 'price_example' },
    })
    expect(result.valid).toBe(true)
    expect(result.externalWritesAuthorized).toBe(false)
  })

  it('fails closed on malformed inputs', () => {
    expect(planOs1Newsletter(null)).toEqual({
      valid: false,
      errors: ['manifest_must_be_object'],
      tasks: [],
      externalWritesAuthorized: false,
    })
  })
})
