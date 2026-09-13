export type ReviewAction =
  | 'CONTINUE_MONITORING'
  | 'REVIEW_TECHNICAL_HEALTH'
  | 'REVIEW_CONTENT_QUALITY'
  | 'REVIEW_CONVERSION_PATH'
  | 'REVIEW_EXPANSION'
  | 'REVIEW_RETIREMENT';

export interface MicrositePerformanceSnapshot {
  siteId: string;
  ageDays: number;
  publishedPages: number;
  indexedPages: number;
  impressions28d: number;
  clicks28d: number;
  qualifiedLeads28d: number;
  revenueCents28d: number;
  verifiedHealthy: boolean;
}

export interface LifecycleReview {
  action: ReviewAction;
  reason: string;
  humanApprovalRequired: boolean;
}

export function reviewMicrositeLifecycle(snapshot: MicrositePerformanceSnapshot): LifecycleReview {
  if (!snapshot.verifiedHealthy) {
    return {
      action: 'REVIEW_TECHNICAL_HEALTH',
      reason: 'Technical health should be verified before interpreting traffic or lead performance.',
      humanApprovalRequired: false,
    };
  }

  if (snapshot.ageDays < 30) {
    return {
      action: 'CONTINUE_MONITORING',
      reason: 'The site is still new; collect more indexing and traffic evidence before changing direction.',
      humanApprovalRequired: false,
    };
  }

  if (snapshot.ageDays >= 45 && snapshot.impressions28d < 100) {
    return {
      action: 'REVIEW_CONTENT_QUALITY',
      reason: 'Visibility remains limited, so review usefulness, differentiation, crawlability, and local relevance.',
      humanApprovalRequired: false,
    };
  }

  if (snapshot.clicks28d >= 20 && snapshot.qualifiedLeads28d === 0) {
    return {
      action: 'REVIEW_CONVERSION_PATH',
      reason: 'Visitors are arriving but no qualified leads were recorded; review clarity, trust, and the inquiry path.',
      humanApprovalRequired: false,
    };
  }

  if (snapshot.qualifiedLeads28d >= 5 && snapshot.revenueCents28d > 0) {
    return {
      action: 'REVIEW_EXPANSION',
      reason: 'The site is producing qualified leads and recorded revenue; consider whether adjacent useful coverage is justified.',
      humanApprovalRequired: true,
    };
  }

  if (snapshot.ageDays >= 120 && snapshot.impressions28d < 50 && snapshot.qualifiedLeads28d === 0) {
    return {
      action: 'REVIEW_RETIREMENT',
      reason: 'After an extended observation period, the site has little visibility and no qualified leads.',
      humanApprovalRequired: true,
    };
  }

  return {
    action: 'CONTINUE_MONITORING',
    reason: 'No review threshold is currently met.',
    humanApprovalRequired: false,
  };
}
