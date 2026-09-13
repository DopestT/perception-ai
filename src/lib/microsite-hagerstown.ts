import type { MarketCandidate, MicrositeSpec } from './perception-microsites';
import { WATERPROOFING_VERTICAL } from './perception-microsites';

export const HAGERSTOWN_WATERPROOFING_CANDIDATE: MarketCandidate = {
  id: 'waterproofing-hagerstown-md',
  vertical: WATERPROOFING_VERTICAL.id,
  city: 'Hagerstown',
  state: 'MD',
  country: 'US',
  primaryService: WATERPROOFING_VERTICAL.primaryService,
  secondaryServices: [...WATERPROOFING_VERTICAL.secondaryServices],
  stage: 'READY_TO_BUILD',
  createdAt: new Date(0).toISOString(),
};

export const HAGERSTOWN_WATERPROOFING_SPEC: MicrositeSpec = {
  id: 'site-waterproofing-hagerstown-md',
  marketCandidateId: HAGERSTOWN_WATERPROOFING_CANDIDATE.id,
  domain: 'hagerstownbasementwaterproofing.com',
  publicBrandName: 'Hagerstown Basement Waterproofing',
  primaryService: HAGERSTOWN_WATERPROOFING_CANDIDATE.primaryService,
  secondaryServices: HAGERSTOWN_WATERPROOFING_CANDIDATE.secondaryServices,
  serviceArea: [
    'Hagerstown, MD',
    'Halfway, MD',
    'Funkstown, MD',
    'Smithsburg, MD',
    'Boonsboro, MD',
    'Williamsport, MD',
  ],
  claimsApproved: false,
  domainPurchaseApproved: true,
  deploymentApproved: false,
};

export const HAGERSTOWN_WATERPROOFING_PAGE_PLAN = [
  '/',
  '/basement-waterproofing',
  '/crawl-space-encapsulation',
  '/crawl-space-repair',
  '/basement-leak-repair',
  '/foundation-waterproofing',
  '/sump-pump-installation',
  '/drainage-french-drains',
  '/wet-basement',
  '/musty-basement',
  '/foundation-cracks',
  '/service-area/hagerstown-md',
  '/service-area/halfway-md',
  '/service-area/funkstown-md',
  '/service-area/smithsburg-md',
  '/service-area/boonsboro-md',
  '/service-area/williamsport-md',
  '/faq',
  '/contact',
] as const;
