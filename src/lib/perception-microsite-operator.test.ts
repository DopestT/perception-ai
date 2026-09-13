import { describe, expect, it } from 'vitest';
import { reviewMicrositeLifecycle } from './perception-microsite-operator';

const base = {
  siteId: 'site-1',
  ageDays: 60,
  publishedPages: 20,
  indexedPages: 18,
  impressions28d: 300,
  clicks28d: 12,
  qualifiedLeads28d: 1,
  revenueCents28d: 0,
  verifiedHealthy: true,
};

describe('microsite lifecycle review', () => {
  it('keeps new sites in observation', () => {
    expect(reviewMicrositeLifecycle({ ...base, ageDays: 10 }).action).toBe('CONTINUE_MONITORING');
  });

  it('prioritizes technical health before performance', () => {
    expect(reviewMicrositeLifecycle({ ...base, verifiedHealthy: false }).action).toBe('REVIEW_TECHNICAL_HEALTH');
  });

  it('reviews the inquiry path when traffic exists without leads', () => {
    expect(reviewMicrositeLifecycle({ ...base, clicks28d: 30, qualifiedLeads28d: 0 }).action).toBe('REVIEW_CONVERSION_PATH');
  });

  it('requires human approval before expansion', () => {
    const result = reviewMicrositeLifecycle({ ...base, qualifiedLeads28d: 7, revenueCents28d: 50000 });
    expect(result.action).toBe('REVIEW_EXPANSION');
    expect(result.humanApprovalRequired).toBe(true);
  });
});
