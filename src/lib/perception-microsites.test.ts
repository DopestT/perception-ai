import { describe, expect, it } from 'vitest';
import {
  canBuildMicrosite,
  canDeployMicrosite,
  scoreMicrositeOpportunity,
  type MicrositeSpec,
} from './perception-microsites';

describe('Perception microsite scoring', () => {
  it('favors strong intent, demand, lead value, and low competition', () => {
    const score = scoreMicrositeOpportunity({
      commercialIntent: 90,
      competition: 25,
      localDemand: 80,
      estimatedLeadValue: 85,
      domainFit: 70,
      evidenceConfidence: 'HIGH',
    });

    expect(score.total).toBeGreaterThan(75);
    expect(canBuildMicrosite(score)).toBe(true);
  });

  it('does not graduate low-confidence research into build', () => {
    const score = scoreMicrositeOpportunity({
      commercialIntent: 100,
      competition: 0,
      localDemand: 100,
      estimatedLeadValue: 100,
      domainFit: 100,
      evidenceConfidence: 'LOW',
    });

    expect(canBuildMicrosite(score)).toBe(false);
  });
});

describe('Perception microsite approval gates', () => {
  it('requires domain and all human approvals before deploy', () => {
    const base: MicrositeSpec = {
      id: 'site-1',
      marketCandidateId: 'market-1',
      primaryService: 'basement waterproofing',
      secondaryServices: [],
      serviceArea: ['Frederick, MD'],
      claimsApproved: true,
      domainPurchaseApproved: true,
      deploymentApproved: true,
    };

    expect(canDeployMicrosite(base)).toBe(false);
    expect(canDeployMicrosite({ ...base, domain: 'example.com' })).toBe(true);
  });
});
