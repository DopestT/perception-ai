export type RoutingServiceKey =
  | 'NO_WATER'
  | 'WELL_PUMP'
  | 'LOW_PRESSURE'
  | 'PRESSURE_TANK'
  | 'WATER_TREATMENT'
  | 'WELL_DIAGNOSTIC'

export type RoutingUrgency = 'EMERGENCY' | 'ROUTINE'
export type RoutingProviderStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED'
export type RoutingLeadState =
  | 'NEW' | 'QUALIFIED' | 'ROUTING' | 'ACCEPTED' | 'CONTACTED' | 'APPOINTMENT' | 'COMPLETED'
  | 'DUPLICATE' | 'UNQUALIFIED' | 'UNROUTABLE' | 'LOST' | 'CANCELLED' | 'MANUAL_REVIEW'
export type HomeownerNoticeType =
  | 'REQUEST_RECEIVED'
  | 'PROVIDER_ACCEPTED'
  | 'NO_PROVIDER_SECURED'
  | 'REQUEST_CANCELLED'
  | 'OUTCOME_FOLLOWUP'

export type RoutingProvider = {
  id: string
  displayName: string
  status: RoutingProviderStatus
  acceptingNewWork: boolean
  serviceKeys: RoutingServiceKey[]
  serviceAreaKeys: string[]
  emergencyCapable: boolean
  priorityBias: number
}

export type RoutingPerformance = {
  acceptanceRate: number
  medianResponseSeconds: number
  completionRate: number
}

export type RoutingPolicy = {
  emergencyTimeoutSeconds: number
  routineTimeoutSeconds: number
}

export type ServiceAreaRule = {
  key: string
  zips: string[]
}

export type ServiceClassification = {
  serviceKey: RoutingServiceKey | null
  source: 'explicit' | 'text' | 'ambiguous' | 'unsupported'
  reviewRequired: boolean
}

export type ScoreReasons = {
  base: number
  priorityBias: number
  acceptanceRate: number
  responseSpeed: number
  completionRate: number
}

export type RankedProvider = {
  provider: RoutingProvider
  score: number
  scoreReasons: ScoreReasons
}

export type IneligibleProvider = {
  providerId: string
  reasons: string[]
}

export type ProviderRanking = {
  eligible: RankedProvider[]
  ineligible: IneligibleProvider[]
}

export type HomeownerNoticeInput = {
  leadId: string
  simulated: boolean
  acceptedProviderId?: string | null
  providerName?: string | null
  internal?: unknown
}

export type RenderedHomeownerNotice = {
  subject: string
  body: string
  simulated: boolean
}

const SERVICE_KEYS = new Set<RoutingServiceKey>([
  'NO_WATER',
  'WELL_PUMP',
  'LOW_PRESSURE',
  'PRESSURE_TANK',
  'WATER_TREATMENT',
  'WELL_DIAGNOSTIC',
])

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0))
}

export function normalizePhone(value: string): string {
  return String(value ?? '').replace(/\D/g, '')
}

export function normalizeEmail(value: string): string {
  return String(value ?? '').trim().toLowerCase()
}

export function submissionFingerprintInput(input: {
  micrositeId: string
  phoneHash?: string | null
  emailHash?: string | null
  zip: string
  issue: string
}): string {
  return [
    input.micrositeId.trim(),
    input.phoneHash?.trim() ?? '',
    input.emailHash?.trim() ?? '',
    input.zip.trim(),
    normalizeText(input.issue),
  ].join('|')
}

export function classifyHagerstownWellHelp(input: {
  explicitServiceKey?: string | null
  issue: string
}): ServiceClassification {
  const explicit = String(input.explicitServiceKey ?? '').trim().toUpperCase() as RoutingServiceKey
  if (SERVICE_KEYS.has(explicit)) {
    return { serviceKey: explicit, source: 'explicit', reviewRequired: false }
  }

  const issue = normalizeText(input.issue)
  const noWater = /\b(no|without)\s+(usable\s+)?water\b/.test(issue)
  const pump = /\b(well\s+)?pump\b/.test(issue)
  const lowPressure = /\blow\s+(water\s+)?pressure\b/.test(issue)
  const pressureTank = /\bpressure\s+tank\b|\bshort\s+cycl/.test(issue)
  const treatment = /\bwater\s+treatment\b|\bfilter\b|\bfiltration\b|\bsoftener\b|\bconditioning\b/.test(issue)
  const diagnostic = /\bwell\s+diagnostic\b|\bwell\s+inspection\b|\bdiagnostic\s+inspection\b|\bwell\s+check\b/.test(issue)

  const matches: RoutingServiceKey[] = []
  if (pump && noWater) {
    matches.push('WELL_PUMP')
  } else {
    if (noWater) matches.push('NO_WATER')
    if (pump) matches.push('WELL_PUMP')
  }
  if (lowPressure) matches.push('LOW_PRESSURE')
  if (pressureTank) matches.push('PRESSURE_TANK')
  if (treatment) matches.push('WATER_TREATMENT')
  if (diagnostic) matches.push('WELL_DIAGNOSTIC')

  const unique = [...new Set(matches)]
  if (unique.length === 1) {
    return { serviceKey: unique[0], source: 'text', reviewRequired: false }
  }
  if (unique.length > 1) {
    return { serviceKey: null, source: 'ambiguous', reviewRequired: true }
  }
  return { serviceKey: null, source: 'unsupported', reviewRequired: true }
}

export function deriveUrgency(input: {
  serviceKey: RoutingServiceKey
  issue: string
}): RoutingUrgency {
  if (input.serviceKey === 'NO_WATER') return 'EMERGENCY'
  if (input.serviceKey === 'WELL_PUMP') {
    const issue = normalizeText(input.issue)
    if (/\b(no|without)\s+(usable\s+)?water\b/.test(issue) || /\bpump\s+(failed|failure|not\s+running|stopped)\b/.test(issue)) {
      return 'EMERGENCY'
    }
  }
  return 'ROUTINE'
}

export function resolveServiceAreaKey(zip: string, rules: ServiceAreaRule[]): string | null {
  const match = String(zip ?? '').trim().match(/^(\d{5})(?:-\d{4})?$/)
  if (!match) return null
  const normalized = match[1]
  for (const rule of rules) {
    if (rule.zips.includes(normalized)) return rule.key
  }
  return null
}

export function rankEligibleProviders(input: {
  providers: RoutingProvider[]
  performance: Record<string, RoutingPerformance>
  serviceKey: RoutingServiceKey
  serviceAreaKey: string
  urgency: RoutingUrgency
  timeoutSeconds: number
}): ProviderRanking {
  const eligible: RankedProvider[] = []
  const ineligible: IneligibleProvider[] = []
  const timeout = Math.max(1, input.timeoutSeconds)

  for (const provider of input.providers) {
    const reasons: string[] = []
    if (provider.status !== 'ACTIVE') reasons.push('status')
    if (!provider.acceptingNewWork) reasons.push('accepting_new_work')
    if (!provider.serviceKeys.includes(input.serviceKey)) reasons.push('service_key')
    if (!provider.serviceAreaKeys.includes(input.serviceAreaKey)) reasons.push('service_area')
    if (input.urgency === 'EMERGENCY' && !provider.emergencyCapable) reasons.push('emergency_capability')

    if (reasons.length) {
      ineligible.push({ providerId: provider.id, reasons })
      continue
    }

    const performance = input.performance[provider.id]
    const acceptanceRate = performance ? clamp(performance.acceptanceRate, 0, 1) * 15 : 0
    const responseSpeed = performance
      ? clamp(1 - Math.max(0, performance.medianResponseSeconds) / timeout, 0, 1) * 10
      : 0
    const completionRate = performance ? clamp(performance.completionRate, 0, 1) * 5 : 0
    const priorityBias = clamp(provider.priorityBias, -20, 20)
    const scoreReasons: ScoreReasons = {
      base: 50,
      priorityBias,
      acceptanceRate,
      responseSpeed,
      completionRate,
    }
    const score = Object.values(scoreReasons).reduce((sum, value) => sum + value, 0)
    eligible.push({ provider, score, scoreReasons })
  }

  eligible.sort((a, b) =>
    b.score - a.score
    || a.provider.displayName.localeCompare(b.provider.displayName)
    || a.provider.id.localeCompare(b.provider.id),
  )

  return { eligible, ineligible }
}

export function offerTimeoutSeconds(urgency: RoutingUrgency, policy: RoutingPolicy): number {
  return urgency === 'EMERGENCY' ? policy.emergencyTimeoutSeconds : policy.routineTimeoutSeconds
}

export function canTransitionRoutingLeadState(from: RoutingLeadState, to: RoutingLeadState): boolean {
  const allowed: Partial<Record<RoutingLeadState, RoutingLeadState[]>> = {
    NEW: ['CANCELLED'],
    QUALIFIED: ['CANCELLED'],
    ROUTING: ['CANCELLED'],
    ACCEPTED: ['CONTACTED', 'LOST', 'CANCELLED'],
    CONTACTED: ['APPOINTMENT', 'LOST', 'CANCELLED'],
    APPOINTMENT: ['COMPLETED', 'LOST', 'CANCELLED'],
  }
  return allowed[from]?.includes(to) ?? false
}

export function renderHomeownerNotice(
  type: HomeownerNoticeType,
  input: HomeownerNoticeInput,
): RenderedHomeownerNotice {
  switch (type) {
    case 'REQUEST_RECEIVED':
      return {
        subject: 'Hagerstown Well Help request received',
        body: 'We received your Hagerstown Well Help request. We are checking for a participating local provider who fits the request and is available.',
        simulated: input.simulated,
      }
    case 'PROVIDER_ACCEPTED': {
      const providerName = String(input.providerName ?? '').trim()
      if (!input.acceptedProviderId || !providerName) throw new Error('An accepted provider is required before naming a provider')
      return {
        subject: 'A local provider accepted your request',
        body: `${providerName} accepted your Hagerstown Well Help request. Hagerstown Well Help is a referral service; service is provided independently by the participating provider.`,
        simulated: input.simulated,
      }
    }
    case 'NO_PROVIDER_SECURED':
      return {
        subject: 'Update on your Hagerstown Well Help request',
        body: 'We have not secured a participating provider for your request yet. No provider match has been confirmed.',
        simulated: input.simulated,
      }
    case 'REQUEST_CANCELLED':
      return {
        subject: 'Hagerstown Well Help request cancelled',
        body: 'Your Hagerstown Well Help request has been cancelled. No further routing will be attempted for this request.',
        simulated: input.simulated,
      }
    case 'OUTCOME_FOLLOWUP':
      return {
        subject: 'How did your service request go?',
        body: 'Please let us know whether your Hagerstown Well Help service request was completed and whether you need any follow-up.',
        simulated: input.simulated,
      }
  }
}
