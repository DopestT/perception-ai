export type DomainStatus = 'ACTIVE' | 'PARKED' | 'UNASSESSED' | 'HOLD' | 'CANDIDATE';

export interface OwnedDomain {
  id: string;
  domain: string;
  status: DomainStatus;
  currentProject?: string;
  notes?: string;
  lastCheckedAt?: string;
}

export interface DomainOpportunityFit {
  domainId: string;
  opportunityId: string;
  topicalFit: number;
  brandFit: number;
  audienceFit: number;
  trustRisk: number;
  score: number;
  rationale: string;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function scoreDomainOpportunityFit(input: Omit<DomainOpportunityFit, 'score'>): DomainOpportunityFit {
  const topical = clamp(input.topicalFit);
  const brand = clamp(input.brandFit);
  const audience = clamp(input.audienceFit);
  const risk = clamp(input.trustRisk);
  const score = Math.round((topical * 0.45 + brand * 0.3 + audience * 0.25 - risk * 0.35) * 10) / 10;

  return {
    ...input,
    topicalFit: topical,
    brandFit: brand,
    audienceFit: audience,
    trustRisk: risk,
    score: Math.max(0, Math.min(100, score)),
  };
}

export function shouldReuseOwnedDomain(domain: OwnedDomain, fit: DomainOpportunityFit): boolean {
  if (domain.status === 'ACTIVE' || domain.status === 'HOLD') return false;
  return fit.score >= 70 && fit.trustRisk <= 25;
}

export function chooseBestOwnedDomain(
  domains: OwnedDomain[],
  fits: DomainOpportunityFit[],
): { domain: OwnedDomain; fit: DomainOpportunityFit } | null {
  const byId = new Map(domains.map((domain) => [domain.id, domain]));
  const eligible = fits
    .map((fit) => ({ domain: byId.get(fit.domainId), fit }))
    .filter((entry): entry is { domain: OwnedDomain; fit: DomainOpportunityFit } => Boolean(entry.domain))
    .filter(({ domain, fit }) => shouldReuseOwnedDomain(domain, fit))
    .sort((a, b) => b.fit.score - a.fit.score);

  return eligible[0] || null;
}
