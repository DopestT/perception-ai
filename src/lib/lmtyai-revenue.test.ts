import { describe, expect, it } from 'vitest'
import { normalizeStripeRevenueEvent } from '../../supabase/functions/_shared/lmtyai-revenue'

describe('normalizeStripeRevenueEvent', () => {
  it('records one-time payment intent success as verified gross revenue', () => {
    const got = normalizeStripeRevenueEvent({
      id: 'evt_pi_1',
      type: 'payment_intent.succeeded',
      created: 1792998000,
      data: {
        object: {
          id: 'pi_1', object: 'payment_intent', amount: 2500, amount_received: 2500,
          currency: 'usd', customer: 'cus_1', invoice: null,
          metadata: { source_platform: 'tiktok', campaign_id: 'launch', creative_id: 'LMT-TT-001' },
        },
      },
    })
    expect(got.amount_gross_minor).toBe(2500)
    expect(got.amount_net_minor).toBe(2500)
    expect(got.verification_state).toBe('verified')
    expect(got.attribution_state).toBe('verified')
    expect(got.creative_id).toBe('LMT-TT-001')
  })

  it('does not double count a subscription-linked payment intent', () => {
    const got = normalizeStripeRevenueEvent({
      id: 'evt_pi_sub',
      type: 'payment_intent.succeeded',
      created: 1792998000,
      data: {
        object: {
          id: 'pi_sub', object: 'payment_intent', amount: 9900, amount_received: 9900,
          currency: 'usd', customer: 'cus_2', invoice: 'in_1', metadata: {},
        },
      },
    })
    expect(got.amount_gross_minor).toBe(0)
    expect(got.amount_net_minor).toBe(0)
  })

  it('uses invoice paid as canonical subscription revenue', () => {
    const got = normalizeStripeRevenueEvent({
      id: 'evt_in_1',
      type: 'invoice.paid',
      created: 1792998000,
      data: {
        object: {
          id: 'in_1', object: 'invoice', amount_paid: 9900, currency: 'usd', customer: 'cus_2',
          subscription: 'sub_1', payment_intent: 'pi_sub', metadata: {},
        },
      },
    })
    expect(got.amount_gross_minor).toBe(9900)
    expect(got.amount_net_minor).toBe(9900)
    expect(got.invoice_id).toBe('in_1')
  })

  it('keeps missing acquisition evidence unknown', () => {
    const got = normalizeStripeRevenueEvent({
      id: 'evt_unknown',
      type: 'payment_intent.succeeded',
      created: 1792998000,
      data: {
        object: {
          id: 'pi_unknown', object: 'payment_intent', amount: 1200, amount_received: 1200,
          currency: 'usd', customer: 'cus_3', invoice: null, metadata: {},
        },
      },
    })
    expect(got.attribution_state).toBe('unknown')
    expect(got.attribution_confidence).toBe(0)
    expect(got.source_platform).toBeNull()
  })

  it('records refunds as negative net events without negative gross', () => {
    const got = normalizeStripeRevenueEvent({
      id: 'evt_refund',
      type: 'charge.refunded',
      created: 1792998000,
      data: {
        object: {
          id: 'ch_1', object: 'charge', amount: 2500, amount_refunded: 2500,
          currency: 'usd', customer: 'cus_1', payment_intent: 'pi_1', metadata: {},
        },
      },
    })
    expect(got.amount_gross_minor).toBe(0)
    expect(got.amount_refunded_minor).toBe(2500)
    expect(got.amount_net_minor).toBe(-2500)
  })
})
