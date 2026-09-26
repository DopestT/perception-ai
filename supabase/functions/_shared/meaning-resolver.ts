import type { ModelLane, ModelProvider, ModelProtocol, ModelTarget } from './token-efficiency.ts'

export type ObjectiveUrgency = 'low' | 'normal' | 'high' | 'critical'

export type MeaningClaim = {
  claim_key: string
  statement: string
  confidence: number
  route_impact: string
}

export type ResolverUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
}

export type ResolverAttempt = {
  provider: ModelProvider
  model: string
  lane: ModelLane
  protocol: ModelProtocol
  ok: boolean
  reason?: string
  usage?: ResolverUsage
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
  provider: ModelProvider | null
  model: string | null
  routing_attempts: ResolverAttempt[]
  usage?: ResolverUsage
}

type ResolverOptions = {
  apiKey?: string | null
  model?: string | null
  candidates?: ModelTarget[]
  maxOutputTokens?: number
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

const systemPrompt =
  'Resolve a user objective into structured project semantics. Preserve direct user meaning. Do not invent facts, constraints, deadlines, dependencies, or current-state claims. Put missing material facts in known_unknowns. inferred_claims must contain only useful routing inferences and must be labeled with conservative confidence.'

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

function normalizeMeaning(
  raw: Record<string, unknown>,
  statement: string,
  target: ModelTarget,
  attempts: ResolverAttempt[],
  usage?: ResolverUsage,
): ResolvedObjectiveMeaning {
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
    provider: target.provider,
    model: target.model,
    routing_attempts: attempts,
    usage,
  }
}

export function deterministicMeaning(
  statement: string,
  attempts: ResolverAttempt[] = [],
): ResolvedObjectiveMeaning {
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
    provider: null,
    model: null,
    routing_attempts: attempts,
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

function chatCompletionText(payload: Record<string, unknown>): string | null {
  if (!Array.isArray(payload.choices)) return null
  const first = payload.choices[0]
  if (!first || typeof first !== 'object' || Array.isArray(first)) return null
  const message = (first as Record<string, unknown>).message
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null
  const content = (message as Record<string, unknown>).content
  return typeof content === 'string' && content.trim() ? content : null
}

function usageFromPayload(payload: Record<string, unknown>, protocol: ModelProtocol): ResolverUsage | undefined {
  const raw = payload.usage
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const usage = raw as Record<string, unknown>

  if (protocol === 'chat_completions') {
    const promptDetails = usage.prompt_tokens_details
    const details = promptDetails && typeof promptDetails === 'object' && !Array.isArray(promptDetails)
      ? promptDetails as Record<string, unknown>
      : {}
    return {
      inputTokens: Number(usage.prompt_tokens ?? 0) || 0,
      cachedInputTokens: Number(details.cached_tokens ?? 0) || 0,
      outputTokens: Number(usage.completion_tokens ?? 0) || 0,
      reasoningTokens: 0,
    }
  }

  const inputDetails = usage.input_tokens_details
  const outputDetails = usage.output_tokens_details
  const input = inputDetails && typeof inputDetails === 'object' && !Array.isArray(inputDetails)
    ? inputDetails as Record<string, unknown>
    : {}
  const output = outputDetails && typeof outputDetails === 'object' && !Array.isArray(outputDetails)
    ? outputDetails as Record<string, unknown>
    : {}

  return {
    inputTokens: Number(usage.input_tokens ?? 0) || 0,
    cachedInputTokens: Number(input.cached_tokens ?? 0) || 0,
    outputTokens: Number(usage.output_tokens ?? 0) || 0,
    reasoningTokens: Number(output.reasoning_tokens ?? 0) || 0,
  }
}

function targetEndpoint(target: ModelTarget, protocol: ModelProtocol): string {
  const base = (target.baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '')
  return protocol === 'chat_completions' ? `${base}/chat/completions` : `${base}/responses`
}

function legacyTarget(options: ResolverOptions): ModelTarget[] {
  const apiKey = options.apiKey?.trim()
  const model = options.model?.trim()
  if (!apiKey || !model) return []
  return [{
    id: 'legacy-meaning-model',
    provider: 'openai',
    model,
    lane: 'economy',
    protocol: 'responses',
    apiKey,
  }]
}

export async function resolveObjectiveMeaning(
  statement: string,
  options: ResolverOptions = {},
): Promise<ResolvedObjectiveMeaning> {
  const fetchImpl = options.fetchImpl ?? fetch
  const candidates = options.candidates?.length ? options.candidates : legacyTarget(options)
  const attempts: ResolverAttempt[] = []

  for (const target of candidates) {
    const protocol = target.protocol ?? 'responses'
    const apiKey = target.apiKey?.trim() || (target.provider === 'openai' ? options.apiKey?.trim() : '')
    if (target.provider === 'openai' && !apiKey) {
      attempts.push({ provider: target.provider, model: target.model, lane: target.lane, protocol, ok: false, reason: 'missing_api_key' })
      continue
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    const body = protocol === 'chat_completions'
      ? {
          model: target.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: statement },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'perception_objective_meaning',
              strict: true,
              schema,
            },
          },
          ...(options.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
        }
      : {
          model: target.model,
          input: [
            { role: 'system', content: systemPrompt },
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
          ...(options.maxOutputTokens ? { max_output_tokens: options.maxOutputTokens } : {}),
        }

    try {
      const response = await fetchImpl(targetEndpoint(target, protocol), {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        attempts.push({
          provider: target.provider,
          model: target.model,
          lane: target.lane,
          protocol,
          ok: false,
          reason: `http_${response.status}`,
        })
        continue
      }

      const payload = await response.json() as Record<string, unknown>
      const usage = usageFromPayload(payload, protocol)
      const text = protocol === 'chat_completions' ? chatCompletionText(payload) : responseText(payload)
      if (!text) {
        attempts.push({ provider: target.provider, model: target.model, lane: target.lane, protocol, ok: false, reason: 'missing_output', usage })
        continue
      }

      try {
        const parsed = JSON.parse(text) as Record<string, unknown>
        const successAttempt: ResolverAttempt = {
          provider: target.provider,
          model: target.model,
          lane: target.lane,
          protocol,
          ok: true,
          usage,
        }
        const completeAttempts = [...attempts, successAttempt]
        return normalizeMeaning(parsed, statement, target, completeAttempts, usage)
      } catch {
        attempts.push({ provider: target.provider, model: target.model, lane: target.lane, protocol, ok: false, reason: 'invalid_json', usage })
      }
    } catch {
      attempts.push({ provider: target.provider, model: target.model, lane: target.lane, protocol, ok: false, reason: 'request_failed' })
    }
  }

  return deterministicMeaning(statement, attempts)
}
