import { describe, expect, it } from 'vitest';
import { isReferralMarketViable, scoreReferralMarket } from './perception-referral-market';

describe('referral market scoring', () => {
  it('requires strong economics and evidence', () => {
    const result = scoreReferralMarket({
      providerDemand: 90,
      expectedReferralValue: 85,
      serviceUrgency: 80,
      providerCoverage: 80,
      consentAndComplianceFit: 95,
      evidenceConfidence: 'HIGH',
    });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(isReferralMarketViable(result)).toBe(true);
  });

  it('rejects weak consent/compliance fit even when economics are strong', () => {
    const result = scoreReferralMarket({
      providerDemand: 100,
      expectedReferralValue: 100,
      serviceUrgency: 100,
      providerCoverage: 100,
      consentAndComplianceFit: 50,
      evidenceConfidence: 'HIGH',
    });
    expect(isReferralMarketViable(result)).toBe(false);
  });

  it('rejects low-confidence markets', () => {
    const result = scoreReferralMarket({
      providerDemand: 100,
      expectedReferralValue: 100,
      serviceUrgency: 100,
      providerCoverage: 100,
      consentAndComplianceFit: 100,
      evidenceConfidence: 'LOW',
    });
    expect(isReferralMarketViable(result)).toBe(false);
  });
});
