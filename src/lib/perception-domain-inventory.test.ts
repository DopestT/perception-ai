import { describe, expect, it } from 'vitest';
import {
  chooseBestOwnedDomain,
  scoreDomainOpportunityFit,
  shouldReuseOwnedDomain,
  type OwnedDomain,
} from './perception-domain-inventory';

describe('owned domain inventory', () => {
  const parked: OwnedDomain = { id: 'd1', domain: 'example.com', status: 'PARKED' };

  it('reuses a parked domain only when the fit is strong and low-risk', () => {
    const fit = scoreDomainOpportunityFit({
      domainId: 'd1',
      opportunityId: 'o1',
      topicalFit: 95,
      brandFit: 85,
      audienceFit: 80,
      trustRisk: 10,
      rationale: 'Direct topical and audience match',
    });
    expect(fit.score).toBeGreaterThanOrEqual(70);
    expect(shouldReuseOwnedDomain(parked, fit)).toBe(true);
  });

  it('never reassigns an active domain', () => {
    const fit = scoreDomainOpportunityFit({
      domainId: 'd2', opportunityId: 'o1', topicalFit: 100, brandFit: 100, audienceFit: 100, trustRisk: 0, rationale: 'Strong fit',
    });
    expect(shouldReuseOwnedDomain({ id: 'd2', domain: 'active.com', status: 'ACTIVE' }, fit)).toBe(false);
  });

  it('chooses the best eligible owned domain', () => {
    const domains: OwnedDomain[] = [parked, { id: 'd2', domain: 'other.com', status: 'PARKED' }];
    const fits = [
      scoreDomainOpportunityFit({ domainId: 'd1', opportunityId: 'o1', topicalFit: 90, brandFit: 80, audienceFit: 80, trustRisk: 10, rationale: 'Good fit' }),
      scoreDomainOpportunityFit({ domainId: 'd2', opportunityId: 'o1', topicalFit: 75, brandFit: 70, audienceFit: 70, trustRisk: 10, rationale: 'Weaker fit' }),
    ];
    expect(chooseBestOwnedDomain(domains, fits)?.domain.domain).toBe('example.com');
  });
});
