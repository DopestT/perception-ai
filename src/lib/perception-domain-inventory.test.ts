import { describe, expect, it } from 'vitest';
import {
  chooseBestOwnedDomain,
  rankUsesForDomain,
  scoreDomainOpportunityFit,
  shouldReuseOwnedDomain,
  type OwnedDomain,
} from './perception-domain-inventory';

describe('owned domain inventory', () => {
  const parked: OwnedDomain = { id: 'd1', domain: 'example.com', status: 'PARKED' };

  const fit = (domainId: string, opportunityId: string, economicPotential = 90) =>
    scoreDomainOpportunityFit({
      domainId,
      opportunityId,
      topicalFit: 90,
      brandFit: 85,
      audienceFit: 80,
      economicPotential,
      executionFeasibility: 85,
      timeToValue: 75,
      trustRisk: 10,
      rationale: 'Strong legitimate use with practical path to value',
    });

  it('reuses a parked domain only when the fit is strong and low-risk', () => {
    const scored = fit('d1', 'o1');
    expect(scored.score).toBeGreaterThanOrEqual(70);
    expect(shouldReuseOwnedDomain(parked, scored)).toBe(true);
  });

  it('never reassigns an active domain', () => {
    expect(shouldReuseOwnedDomain({ id: 'd2', domain: 'active.com', status: 'ACTIVE' }, fit('d2', 'o1'))).toBe(false);
  });

  it('chooses the best eligible owned domain', () => {
    const domains: OwnedDomain[] = [parked, { id: 'd2', domain: 'other.com', status: 'PARKED' }];
    const fits = [fit('d1', 'o1', 95), fit('d2', 'o1', 70)];
    expect(chooseBestOwnedDomain(domains, fits)?.domain.domain).toBe('example.com');
  });

  it('ranks competing uses for the same domain by expected value score', () => {
    const uses = [fit('d1', 'media', 55), fit('d1', 'lead-gen', 95), fit('d1', 'affiliate', 75)];
    expect(rankUsesForDomain(parked, uses).map((item) => item.opportunityId)).toEqual(['lead-gen', 'affiliate', 'media']);
  });
});
