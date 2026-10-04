export const DATACENTER_EVENT_LIMITS = {
  eventId: 200,
  eventType: 80,
  subjectRef: 500,
  summary: 5000,
  sourceRef: 2048,
  observationPayloadChars: 250_000,
} as const

const reservedDataKeys = new Set([
  'event_id',
  'event_type',
  'subject_ref',
  'summary',
  'observed_at',
  'integration',
])

export type PreparedDataCenterEvent = {
  eventId: string
  eventType: string
  subjectRef: string
  summary: string
  observedAt: string
  sourceRef: string | null
  observationPayload: Record<string, unknown>
  contentHash: string
}

export type PrepareResult =
  | { ok: true; value: PreparedDataCenterEvent }
  | { ok: false; status: 400 | 413; error: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function requiredBoundedString(
  value: unknown,
  name: string,
  limit: number,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: `${name} is required` }
  }
  const normalized = value.trim()
  if (normalized.length > limit) {
    return { ok: false, error: `${name} exceeds ${limit} characters` }
  }
  return { ok: true, value: normalized }
}

function optionalBoundedString(
  value: unknown,
  name: string,
  limit: number,
): { ok: true; value: string } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: '' }
  }
  if (typeof value !== 'string') {
    return { ok: false, error: `${name} must be a string` }
  }
  const normalized = value.trim()
  if (normalized.length > limit) {
    return { ok: false, error: `${name} exceeds ${limit} characters` }
  }
  return { ok: true, value: normalized }
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value)
    return encoded === undefined ? 'null' : encoded
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function constantTimeHexEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) return false
  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return mismatch === 0
}

export async function prepareDataCenterEvent(
  input: unknown,
  configuredProjectId: string,
): Promise<PrepareResult> {
  const payload = asRecord(input)
  if (!payload) return { ok: false, status: 400, error: 'Invalid JSON payload' }

  const eventId = requiredBoundedString(payload.event_id, 'event_id', DATACENTER_EVENT_LIMITS.eventId)
  if (!eventId.ok) return { ok: false, status: 400, error: eventId.error }

  const eventType = requiredBoundedString(payload.event_type, 'event_type', DATACENTER_EVENT_LIMITS.eventType)
  if (!eventType.ok) return { ok: false, status: 400, error: eventType.error }

  const subjectRef = requiredBoundedString(payload.subject_ref, 'subject_ref', DATACENTER_EVENT_LIMITS.subjectRef)
  if (!subjectRef.ok) return { ok: false, status: 400, error: subjectRef.error }

  const summary = optionalBoundedString(payload.summary, 'summary', DATACENTER_EVENT_LIMITS.summary)
  if (!summary.ok) return { ok: false, status: 400, error: summary.error }

  if (typeof payload.observed_at !== 'string' || !payload.observed_at.trim()) {
    return { ok: false, status: 400, error: 'observed_at is required' }
  }
  const observedMillis = Date.parse(payload.observed_at)
  if (Number.isNaN(observedMillis)) {
    return { ok: false, status: 400, error: 'observed_at must be a valid timestamp' }
  }
  const observedAt = new Date(observedMillis).toISOString()

  const rawData = payload.data === undefined ? {} : asRecord(payload.data)
  if (!rawData) return { ok: false, status: 400, error: 'data must be an object' }

  const sourceRefCandidate = rawData.canonicalUrl
  if (
    sourceRefCandidate !== undefined
    && (typeof sourceRefCandidate !== 'string' || sourceRefCandidate.length > DATACENTER_EVENT_LIMITS.sourceRef)
  ) {
    return { ok: false, status: 400, error: `data.canonicalUrl must be a string up to ${DATACENTER_EVENT_LIMITS.sourceRef} characters` }
  }

  const boundedData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rawData)) {
    if (!reservedDataKeys.has(key)) boundedData[key] = value
  }

  const sourceRef = typeof sourceRefCandidate === 'string' && sourceRefCandidate.trim()
    ? sourceRefCandidate.trim()
    : null

  const observationPayload: Record<string, unknown> = {
    ...boundedData,
    subject_ref: subjectRef.value,
    integration: {
      client_id: 'datacenter-forums',
      project_id: configuredProjectId,
      trust_boundary: 'external_observation_only',
      authoritative_truth_requires_perception_verification: true,
    },
  }

  const normalizedPayload = stableStringify(observationPayload)
  if (normalizedPayload.length > DATACENTER_EVENT_LIMITS.observationPayloadChars) {
    return {
      ok: false,
      status: 413,
      error: `data exceeds ${DATACENTER_EVENT_LIMITS.observationPayloadChars} normalized characters`,
    }
  }

  const hashInput = stableStringify({
    event_id: eventId.value,
    event_type: eventType.value,
    subject_ref: subjectRef.value,
    summary: summary.value,
    observed_at: observedAt,
    data: observationPayload,
  })

  return {
    ok: true,
    value: {
      eventId: eventId.value,
      eventType: eventType.value,
      subjectRef: subjectRef.value,
      summary: summary.value,
      observedAt,
      sourceRef,
      observationPayload,
      contentHash: await sha256Hex(hashInput),
    },
  }
}
