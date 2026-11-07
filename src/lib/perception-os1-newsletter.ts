/**
 * PERCEPTION OS1: deterministic, read-only newsletter setup planner.
 *
 * This file DOES NOT call Brevo or Stripe, grant permissions, verify real provider
 * state, send mail, change projects, or create a live charge. Every externally
 * consequential step needs separate scoped approval and read-back evidence.
 */
export type Os1NewsletterOffer = 'free' | 'subscription' | 'one_time' | 'hybrid'

export interface Os1NewsletterManifest {
  schemaVersion: 1
  system: 'PERCEPTION OS1'
  newsletterId: string
  projectId: string
  ownerAgentId: string
  reviewerAgentId: string
  brand: {
    name: string
    domain: string
    senderEmail: string
  }
  brevo: {
    listId: number | null
    listIsolationVerified: boolean
    senderVerified: boolean
    optInVerified: boolean
    unsubscribeVerified: boolean
  }
  stripe: {
    accountLabel: string
    state: 'planned'
    offerType: Os1NewsletterOffer
    productId: string | null
    priceId: string | null
    webhookVerified: boolean
    portalVerified: boolean
  }
  evidenceRefs: string[]
  externallyApprovedActions: string[]
  status: 'draft'
}

export interface Os1NewsletterTask {
  id: string
  action: string
  completionEvidence: string
  requiresSeparateApproval: boolean
}

export interface Os1NewsletterPlan {
  valid: boolean
  errors: string[]
  tasks: Os1NewsletterTask[]
  /** Manifest entries are not authority to run provider APIs or activate billing. */
  externalWritesAuthorized: false
}

const obj = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const realText = (value: unknown): value is string =>
  typeof value === 'string'
  && value.trim().length > 0
  && !/^(TODO|REPLACE_ME)/i.test(value.trim())

const boolean = (value: unknown): value is boolean => typeof value === 'boolean'

const refs = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(realText) && new Set(value).size === value.length

const nullableText = (value: unknown): value is string | null =>
  value === null || realText(value)

const tasks: Os1NewsletterTask[] = [
  {
    id: 'brand',
    action: 'Confirm isolated project, brand, domain, and worker/reviewer assignment',
    completionEvidence: 'Canonical project and separate reviewer verified',
    requiresSeparateApproval: false,
  },
  {
    id: 'brevo',
    action: 'Prepare a dedicated Brevo list, consent workflow, sender authentication, and welcome email draft',
    completionEvidence: 'Provider list ID, sender/domain verification, consent and unsubscribe tests',
    requiresSeparateApproval: true,
  },
  {
    id: 'stripe',
    action: 'Prepare brand-scoped Stripe product and offer mapping; paid prices remain unset until approved',
    completionEvidence: 'Stripe account, product/price references, offer terms, and separate approval record',
    requiresSeparateApproval: true,
  },
  {
    id: 'billing',
    action: 'Draft hosted Stripe Checkout, signed idempotent webhooks, entitlement reconciliation, and customer portal',
    completionEvidence: 'Test events for checkout, successful/failed renewal and cancellation; no live charge',
    requiresSeparateApproval: true,
  },
  {
    id: 'verification',
    action: 'Have a different reviewer test signup, payment-state isolation, email delivery and failure paths',
    completionEvidence: 'Independent verification receipts and drift-check results',
    requiresSeparateApproval: false,
  },
  {
    id: 'release',
    action: 'Hold all public publishing, live Stripe billing, and outbound email until exact separate approval',
    completionEvidence: 'Release approval plus real provider read-back and user-complete acceptance',
    requiresSeparateApproval: true,
  },
]

/**
 * Validates the *shape of a proposed draft*. It never certifies live readiness,
 * current Stripe/Brevo resources, user consent, or actual permission.
 */
export function planOs1Newsletter(candidate: unknown): Os1NewsletterPlan {
  const errors: string[] = []
  if (!obj(candidate)) {
    return { valid: false, errors: ['manifest_must_be_object'], tasks: [], externalWritesAuthorized: false }
  }

  for (const field of ['newsletterId', 'projectId', 'ownerAgentId', 'reviewerAgentId']) {
    if (!realText(candidate[field])) errors.push(`${field}_required`)
  }
  if (candidate.ownerAgentId === candidate.reviewerAgentId) errors.push('independent_reviewer_required')
  if (candidate.schemaVersion !== 1 || candidate.system !== 'PERCEPTION OS1' || candidate.status !== 'draft') {
    errors.push('draft_os1_manifest_required')
  }

  if (!obj(candidate.brand)
    || !realText(candidate.brand.name)
    || !realText(candidate.brand.domain)
    || !realText(candidate.brand.senderEmail)
    || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(candidate.brand.senderEmail))) {
    errors.push('brand_identity_required')
  }

  if (!obj(candidate.brevo)
    || (candidate.brevo.listId !== null && (!Number.isSafeInteger(candidate.brevo.listId) || Number(candidate.brevo.listId) <= 0))
    || !boolean(candidate.brevo.listIsolationVerified)
    || !boolean(candidate.brevo.senderVerified)
    || !boolean(candidate.brevo.optInVerified)
    || !boolean(candidate.brevo.unsubscribeVerified)) {
    errors.push('brevo_isolation_and_consent_contract_required')
  }

  if (!obj(candidate.stripe)
    || !realText(candidate.stripe.accountLabel)
    || candidate.stripe.state !== 'planned'
    || !['free', 'subscription', 'one_time', 'hybrid'].includes(String(candidate.stripe.offerType))
    || !nullableText(candidate.stripe.productId)
    || !nullableText(candidate.stripe.priceId)
    || !boolean(candidate.stripe.webhookVerified)
    || !boolean(candidate.stripe.portalVerified)) {
    errors.push('stripe_plan_required_for_every_newsletter')
  }

  if (!refs(candidate.evidenceRefs) || !refs(candidate.externallyApprovedActions)) {
    errors.push('valid_evidence_and_approval_references_required')
  }

  return {
    valid: errors.length === 0,
    errors,
    tasks: errors.length === 0 ? tasks.map((task) => ({ ...task })) : [],
    externalWritesAuthorized: false,
  }
}
