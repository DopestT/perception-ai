export interface ReferralMarketSignals {
  providerDemand: number;
  expectedReferralValue: number;
  serviceUrgency: number;
  providerCoverage: number;
  consentAndComplianceFit: number;
  evidenceConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ReferralMarketScore {
  score: number;
  evidenceConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
  components: {
    providerDemand: number;
    expectedReferralValue: number;
    serviceUrgency: number;
    providerCoverage: number;
    consentAndComplianceFit: number;
  };
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function scoreReferralMarket(signals: ReferralMarketSignals): ReferralMarketScore {
  const components = {
    providerDemand: clamp(signals.providerDemand) * 0.30,
    expectedReferralValue: clamp(signals.expectedReferralValue) * 0.25,
    serviceUrgency: clamp(signals.serviceUrgency) * 0.15,
    providerCoverage: clamp(signals.providerCoverage) * 0.15,
    consentAndComplianceFit: clamp(signals.consentAndComplianceFit) * 0.15,
  };

  const score = Math.round(Object.values(components).reduce((sum, value) => sum + value, 0) * 10) / 10;
  return { score, evidenceConfidence: signals.evidenceConfidence, components };
}

export function isReferralMarketViable(result: ReferralMarketScore): boolean {
  return result.score >= 70 &&
    result.evidenceConfidence !== 'LOW' &&
    result.components.consentAndComplianceFit >= 12;
}
