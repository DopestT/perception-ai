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
  economicPotential: number;
  executionFeasibility: number;
  timeToValue: number;
  trustRisk: number;
  score: number;
  rationale: string;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function scoreDomainOpportunityFit(input: Omit<DomainOpportunityFit, 'score'>): DomainOpportunityFit {
  const topical = clamp(input.topicalFit);
  const brand = clamp(input.brandFit);
  const audience = clamp(input.audienceFit);
  const economic = clamp(input.economicPotential);
  const feasibility = clamp(input.executionFeasibility);
  const speed = clamp(input.timeToValue);
  const risk = clamp(input.trustRisk);

  const score = Math.round((
    topical * 0.2 +
    brand * 0.15 +
    audience * 0.1 +
    economic * 0.25 +
    feasibility * 0.15 +
    speed * 0.15 -
    risk * 0.3
  ) * 10) / 10;

  return {
    ...input,
    topicalFit: topical,
    brandFit: brand,
    audienceFit: audience,
    economicPotential: economic,
    executionFeasibility: feasibility,
    timeToValue: speed,
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

export function rankUsesForDomain(
  domain: OwnedDomain,
  fits: DomainOpportunityFit[],
): DomainOpportunityFit[] {
  if (domain.status === 'ACTIVE' || domain.status === 'HOLD') return [];
  return fits
    .filter((fit) => fit.domainId === domain.id)
    .sort((a, b) => b.score - a.score);
}
