export type ObjectiveUrgency = 'low' | 'normal' | 'high' | 'critical'

export type MeaningClaim = {
  claim_key: string
  statement: string
  confidence: number
  route_impact: string
}

export type ResolvedObjectiveMeaning = {
  desired_reality: string
  current_reality: string
  constraints: string[]
  success_criteria: string[]
  deliverables: string[]
  urgency: ObjectiveUrgency
  known_unknowns: string[]
  inferred_claims: MeaningClaim[]
  confidence: number
  source: 'openai' | 'deterministic_fallback'
  model: string | null
}

type ResolverOptions = {
  apiKey?: string | null
  model?: string | null
  fetchImpl?: typeof fetch
}

const schema = {
  type: 'object',
  properties: {
    desired_reality: { type: 'string' },
    current_reality: { type: 'string' },
    constraints: { type: 'array', items: { type: 'string' } },
    success_criteria: { type: 'array', items: { type: 'string' } },
    deliverables: { type: 'array', items: { type: 'string' } },
    urgency: { type: 'string', enum: ['low', 'normal', 'high', 'critical'] },
    known_unknowns: { type: 'array', items: { type: 'string' } },
    inferred_claims: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim_key: { type: 'string' },
          statement: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          route_impact: { type: 'string' },
        },
        required: ['claim_key', 'statement', 'confidence', 'route_impact'],
        additionalProperties: false,
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: [
    'desired_reality',
    'current_reality',
    'constraints',
    'success_criteria',
    'deliverables',
    'urgency',
    'known_unknowns',
    'inferred_claims',
    'confidence',
  ],
  additionalProperties: false,
} as const

function compactStrings(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit)
}

function clamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback
}

function normalizeMeaning(raw: Record<string, unknown>, statement: string, model: string): ResolvedObjectiveMeaning {
  const urgency = ['low', 'normal', 'high', 'critical'].includes(String(raw.urgency))
    ? raw.urgency as ObjectiveUrgency
    : 'normal'

  const claims = Array.isArray(raw.inferred_claims)
    ? raw.inferred_claims
        .filter((claim): claim is Record<string, unknown> => Boolean(claim && typeof claim === 'object' && !Array.isArray(claim)))
        .map((claim) => ({
          claim_key: typeof claim.claim_key === 'string' ? claim.claim_key.trim().slice(0, 160) : '',
          statement: typeof claim.statement === 'string' ? claim.statement.trim().slice(0, 2000) : '',
          confidence: clamp(claim.confidence, 0.5),
          route_impact: typeof claim.route_impact === 'string' ? claim.route_impact.trim().slice(0, 1000) : '',
        }))
        .filter((claim) => claim.claim_key && claim.statement)
        .slice(0, 12)
    : []

  return {
    desired_reality:
      typeof raw.desired_reality === 'string' && raw.desired_reality.trim()
        ? raw.desired_reality.trim().slice(0, 4000)
        : statement,
    current_reality:
      typeof raw.current_reality === 'string' && raw.current_reality.trim()
        ? raw.current_reality.trim().slice(0, 4000)
        : 'Only the direct objective statement is currently known.',
    constraints: compactStrings(raw.constraints, 12),
    success_criteria: compactStrings(raw.success_criteria, 12),
    deliverables: compactStrings(raw.deliverables, 12),
    urgency,
    known_unknowns: compactStrings(raw.known_unknowns, 12),
    inferred_claims: claims,
    confidence: clamp(raw.confidence, 0.65),
    source: 'openai',
    model,
  }
}

export function deterministicMeaning(statement: string): ResolvedObjectiveMeaning {
  const normalized = statement.toLowerCase()
  const urgency: ObjectiveUrgency =
    /\b(emergency|critical|immediately|right now)\b/.test(normalized)
      ? 'critical'
      : /\b(urgent|asap|today|tonight)\b/.test(normalized)
        ? 'high'
        : /\b(whenever|no rush|eventually)\b/.test(normalized)
          ? 'low'
          : 'normal'

  return {
    desired_reality: statement,
    current_reality: 'Only the direct objective statement is currently known.',
    constraints: [],
    success_criteria: [
      'Preserve the user\'s stated objective without silently inventing requirements.',
      'Complete at least one bounded action and verify its effect before Project World advances.',
    ],
    deliverables: ['Verified first-action brief'],
    urgency,
    known_unknowns: [
      'The implementation state relevant to this objective has not yet been independently observed.',
      'Completion criteria beyond the direct statement have not yet been confirmed.',
    ],
    inferred_claims: [],
    confidence: 0.55,
    source: 'deterministic_fallback',
    model: null,
  }
}

function responseText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text

  if (!Array.isArray(payload.output)) return null
  for (const item of payload.output) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object' || Array.isArray(part)) continue
      const record = part as Record<string, unknown>
      if (record.type === 'output_text' && typeof record.text === 'string') return record.text
    }
  }
  return null
}

export async function resolveObjectiveMeaning(
  statement: string,
  options: ResolverOptions = {},
): Promise<ResolvedObjectiveMeaning> {
  const fallback = deterministicMeaning(statement)
  const apiKey = options.apiKey?.trim()
  const model = options.model?.trim()
  if (!apiKey || !model) return fallback

  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content:
              'Resolve a user objective into structured project semantics. Preserve direct user meaning. Do not invent facts, constraints, deadlines, dependencies, or current-state claims. Put missing material facts in known_unknowns. inferred_claims must contain only useful routing inferences and must be labeled with conservative confidence.',
          },
          { role: 'user', content: statement },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'perception_objective_meaning',
            strict: true,
            schema,
          },
        },
      }),
    })

    if (!response.ok) return fallback
    const payload = await response.json() as Record<string, unknown>
    const text = responseText(payload)
    if (!text) return fallback

    const parsed = JSON.parse(text) as Record<string, unknown>
    return normalizeMeaning(parsed, statement, model)
  } catch {
    return fallback
  }
}
