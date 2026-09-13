export type MicrositeStage =
  | 'RESEARCH'
  | 'VALIDATED'
  | 'READY_TO_BUILD'
  | 'READY_TO_DEPLOY'
  | 'LIVE'
  | 'MONETIZING'
  | 'PAUSED';

export type EvidenceConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface MarketCandidate {
  id: string;
  vertical: string;
  city: string;
  state: string;
  country: string;
  primaryService: string;
  secondaryServices: string[];
  stage: MicrositeStage;
  createdAt: string;
}

export interface OpportunitySignals {
  commercialIntent: number;
  competition: number;
  localDemand: number;
  estimatedLeadValue: number;
  domainFit: number;
  evidenceConfidence: EvidenceConfidence;
}

export interface OpportunityScore {
  total: number;
  components: {
    commercialIntent: number;
    competitionAdvantage: number;
    localDemand: number;
    leadValue: number;
    domainFit: number;
  };
  evidenceConfidence: EvidenceConfidence;
}

export interface MicrositeSpec {
  id: string;
  marketCandidateId: string;
  domain?: string;
  publicBrandName?: string;
  primaryService: string;
  secondaryServices: string[];
  serviceArea: string[];
  leadDestinationId?: string;
  claimsApproved: boolean;
  domainPurchaseApproved: boolean;
  deploymentApproved: boolean;
}

export interface LeadEvent {
  id: string;
  micrositeId: string;
  channel: 'FORM' | 'CALL' | 'CHAT';
  occurredAt: string;
  qualified: boolean | null;
  contractorDestinationId?: string;
  revenueEventId?: string;
}

export interface RevenueEvent {
  id: string;
  micrositeId: string;
  leadEventId?: string;
  model: 'PAY_PER_LEAD' | 'MONTHLY_LEASE' | 'REVENUE_SHARE' | 'HYBRID';
  amountCents: number;
  occurredAt: string;
}

export const WATERPROOFING_VERTICAL = {
  id: 'waterproofing',
  primaryService: 'basement waterproofing',
  secondaryServices: [
    'crawl-space encapsulation',
    'crawl-space repair',
    'mold remediation',
    'basement leak repair',
    'foundation waterproofing',
    'sump-pump installation and repair',
    'drainage and French drains',
  ],
} as const;

export const MID_ATLANTIC_SEED_MARKETS: Omit<
  MarketCandidate,
  'id' | 'vertical' | 'primaryService' | 'secondaryServices' | 'stage' | 'createdAt'
>[] = [
  { city: 'Frederick', state: 'MD', country: 'US' },
  { city: 'Hagerstown', state: 'MD', country: 'US' },
  { city: 'Westminster', state: 'MD', country: 'US' },
  { city: 'Bel Air', state: 'MD', country: 'US' },
  { city: 'Winchester', state: 'VA', country: 'US' },
  { city: 'Fredericksburg', state: 'VA', country: 'US' },
  { city: 'Culpeper', state: 'VA', country: 'US' },
  { city: 'York', state: 'PA', country: 'US' },
  { city: 'Lancaster', state: 'PA', country: 'US' },
  { city: 'Carlisle', state: 'PA', country: 'US' },
];

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function scoreMicrositeOpportunity(signals: OpportunitySignals): OpportunityScore {
  const components = {
    commercialIntent: clamp(signals.commercialIntent) * 0.25,
    competitionAdvantage: (100 - clamp(signals.competition)) * 0.25,
    localDemand: clamp(signals.localDemand) * 0.2,
    leadValue: clamp(signals.estimatedLeadValue) * 0.2,
    domainFit: clamp(signals.domainFit) * 0.1,
  };

  const total = Object.values(components).reduce((sum, value) => sum + value, 0);

  return {
    total: Math.round(total * 10) / 10,
    components,
    evidenceConfidence: signals.evidenceConfidence,
  };
}

export function canBuildMicrosite(score: OpportunityScore): boolean {
  return score.total >= 65 && score.evidenceConfidence !== 'LOW';
}

export function canDeployMicrosite(spec: MicrositeSpec): boolean {
  return Boolean(
    spec.domain &&
      spec.claimsApproved &&
      spec.domainPurchaseApproved &&
      spec.deploymentApproved,
  );
}
