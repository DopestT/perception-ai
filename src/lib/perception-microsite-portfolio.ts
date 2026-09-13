import {
  type MarketCandidate,
  type MicrositeSpec,
  type OpportunityScore,
  WATERPROOFING_VERTICAL,
  canBuildMicrosite,
} from './perception-microsites';

export const MICROSITE_PORTFOLIO_TARGET = 100;

export type PortfolioSlotStatus =
  | 'EMPTY'
  | 'RESEARCHING'
  | 'CANDIDATE'
  | 'VALIDATED'
  | 'APPROVAL_REQUIRED'
  | 'BUILDING'
  | 'LIVE'
  | 'MONETIZING'
  | 'PAUSED';

export interface MicrositePortfolioSlot {
  slot: number;
  status: PortfolioSlotStatus;
  marketCandidateId?: string;
  micrositeSpecId?: string;
  opportunityScore?: number;
}

export interface RankedMarketCandidate {
  market: MarketCandidate;
  score: OpportunityScore;
}

export interface PortfolioBuildPlan {
  target: number;
  validated: RankedMarketCandidate[];
  rejected: RankedMarketCandidate[];
  slots: MicrositePortfolioSlot[];
}

export function createPortfolioSlots(target = MICROSITE_PORTFOLIO_TARGET): MicrositePortfolioSlot[] {
  if (!Number.isInteger(target) || target < 1) throw new Error('Portfolio target must be a positive integer');
  return Array.from({ length: target }, (_, index) => ({
    slot: index + 1,
    status: 'EMPTY' as const,
  }));
}

export function rankMarketCandidates(candidates: RankedMarketCandidate[]): RankedMarketCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    const confidenceRank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
    return confidenceRank[b.score.evidenceConfidence] - confidenceRank[a.score.evidenceConfidence];
  });
}

export function planPortfolio(
  candidates: RankedMarketCandidate[],
  target = MICROSITE_PORTFOLIO_TARGET,
): PortfolioBuildPlan {
  const ranked = rankMarketCandidates(candidates);
  const validated = ranked.filter((candidate) => canBuildMicrosite(candidate.score)).slice(0, target);
  const rejected = ranked.filter((candidate) => !canBuildMicrosite(candidate.score));
  const slots = createPortfolioSlots(target);

  validated.forEach((candidate, index) => {
    slots[index] = {
      slot: index + 1,
      status: 'VALIDATED',
      marketCandidateId: candidate.market.id,
      opportunityScore: candidate.score.total,
    };
  });

  for (let index = validated.length; index < slots.length; index += 1) {
    slots[index] = {
      ...slots[index],
      status: 'RESEARCHING',
    };
  }

  return { target, validated, rejected, slots };
}

export function createDraftMicrositeSpec(market: MarketCandidate): MicrositeSpec {
  return {
    id: `microsite:${market.id}`,
    marketCandidateId: market.id,
    primaryService: market.primaryService || WATERPROOFING_VERTICAL.primaryService,
    secondaryServices: market.secondaryServices.length
      ? market.secondaryServices
      : [...WATERPROOFING_VERTICAL.secondaryServices],
    serviceArea: [`${market.city}, ${market.state}`],
    claimsApproved: false,
    domainPurchaseApproved: false,
    deploymentApproved: false,
  };
}

export function portfolioProgress(slots: MicrositePortfolioSlot[]) {
  const live = slots.filter((slot) => slot.status === 'LIVE' || slot.status === 'MONETIZING').length;
  const monetizing = slots.filter((slot) => slot.status === 'MONETIZING').length;
  const validated = slots.filter((slot) => slot.status === 'VALIDATED').length;
  const researching = slots.filter((slot) => slot.status === 'RESEARCHING').length;

  return {
    target: slots.length,
    live,
    monetizing,
    validated,
    researching,
    remaining: Math.max(0, slots.length - live),
    livePercent: slots.length ? Math.round((live / slots.length) * 1000) / 10 : 0,
  };
}
