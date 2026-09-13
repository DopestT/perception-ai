import { describe, expect, it } from 'vitest';
import {
  MICROSITE_PORTFOLIO_TARGET,
  createPortfolioSlots,
  planPortfolio,
  portfolioProgress,
} from './perception-microsite-portfolio';
import type { MarketCandidate, OpportunityScore } from './perception-microsites';

const market = (id: string, city: string): MarketCandidate => ({
  id,
  vertical: 'waterproofing',
  city,
  state: 'MD',
  country: 'US',
  primaryService: 'basement waterproofing',
  secondaryServices: [],
  stage: 'RESEARCH',
  createdAt: '2026-09-13T00:00:00.000Z',
});

const score = (total: number, confidence: OpportunityScore['evidenceConfidence'] = 'HIGH'): OpportunityScore => ({
  total,
  evidenceConfidence: confidence,
  components: {
    commercialIntent: 20,
    competitionAdvantage: 20,
    localDemand: 15,
    leadValue: 15,
    domainFit: 10,
  },
});

describe('100-site portfolio', () => {
  it('creates 100 research slots by default', () => {
    const slots = createPortfolioSlots();
    expect(slots).toHaveLength(MICROSITE_PORTFOLIO_TARGET);
    expect(slots[0].slot).toBe(1);
    expect(slots[99].slot).toBe(100);
  });

  it('fills only validated opportunities and leaves the rest researching', () => {
    const plan = planPortfolio([
      { market: market('a', 'Frederick'), score: score(84) },
      { market: market('b', 'Hagerstown'), score: score(74, 'MEDIUM') },
      { market: market('c', 'Bethesda'), score: score(91, 'LOW') },
      { market: market('d', 'Rockville'), score: score(59) },
    ]);

    expect(plan.validated.map((candidate) => candidate.market.id)).toEqual(['a', 'b']);
    expect(plan.slots).toHaveLength(100);
    expect(plan.slots[0].status).toBe('VALIDATED');
    expect(plan.slots[1].status).toBe('VALIDATED');
    expect(plan.slots[2].status).toBe('RESEARCHING');
  });

  it('reports portfolio progress without treating validated sites as live', () => {
    const slots = createPortfolioSlots(4);
    slots[0].status = 'LIVE';
    slots[1].status = 'MONETIZING';
    slots[2].status = 'VALIDATED';
    slots[3].status = 'RESEARCHING';

    expect(portfolioProgress(slots)).toEqual({
      target: 4,
      live: 2,
      monetizing: 1,
      validated: 1,
      researching: 1,
      remaining: 2,
      livePercent: 50,
    });
  });
});
