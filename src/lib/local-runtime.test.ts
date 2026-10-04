import { describe, expect, it } from 'vitest'
import { materializeLocalArtifact, verifyLocalArtifact } from './local-runtime'

const target = {
  id: 'test-balanced',
  provider: 'openai' as const,
  model: 'test-model',
  lane: 'balanced' as const,
  protocol: 'responses' as const,
  apiKey: 'test-key',
}

function fakeResponse(value: Record<string, unknown>) {
  return async () => new Response(JSON.stringify({
    output_text: JSON.stringify(value),
    usage: {
      input_tokens: 120,
      output_tokens: 80,
      input_tokens_details: { cached_tokens: 20 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('bounded local runtime worker', () => {
  it('materializes and mechanically verifies a P1 artifact', async () => {
    const result = await materializeLocalArtifact({
      objective: 'Create a launch plan',
      desiredReality: 'A launch plan exists',
      currentReality: 'A verified first-action brief exists',
      outcome: 'Launch plan',
      constraints: ['Do not publish anything'],
      successCriteria: ['Plan includes sequencing and checks'],
      verifiedEvidence: ['First-action brief is verified'],
      candidates: [target],
      fetchImpl: fakeResponse({
        title: 'Launch plan',
        content: 'Launch plan: define the audience, prepare the assets, sequence the release, run preflight checks, record owners, and verify each deliverable before any external publication occurs.',
        completion_evidence: ['The artifact includes audience, assets, sequence, preflight checks, owners, and verification steps.'],
        confidence: 0.9,
      }),
    })

    expect(result.ok).toBe(true)
    expect(result.phase).toBe('materialized')
    expect(result.attempts[0]?.ok).toBe(true)
    expect(verifyLocalArtifact(result, 'Launch plan').passed).toBe(true)
  })


  it('keeps OpenAI local-worker requests out of provider application storage', async () => {
    const captured: { body?: Record<string, unknown> } = {}
    const result = await materializeLocalArtifact({
      objective: 'Create a launch plan',
      desiredReality: 'A launch plan exists',
      currentReality: 'Only intent is known',
      outcome: 'Launch plan',
      candidates: [target],
      fetchImpl: async (_input, init) => {
        captured.body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
        return new Response(JSON.stringify({
          output_text: JSON.stringify({
            title: 'Launch plan',
            content: 'Launch plan: define the audience, prepare assets, sequence release steps, assign owners, check dependencies, and verify each bounded deliverable before any external action is taken.',
            completion_evidence: ['The draft includes audience, assets, sequence, owners, dependencies, and verification.'],
            confidence: 0.9,
          }),
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    })

    expect(result.ok).toBe(true)
    expect(captured.body?.store).toBe(false)
    const input = captured.body?.input as Array<{ role: string; content: string }>
    expect(input[0]?.content).toContain('non-authoritative working copy')
  })


  it('blocks output that is too small to count as a real deliverable', async () => {
    const result = await materializeLocalArtifact({
      objective: 'Create a launch plan',
      desiredReality: 'A launch plan exists',
      currentReality: 'Only intent is known',
      outcome: 'Launch plan',
      candidates: [target],
      fetchImpl: fakeResponse({
        title: 'Launch plan',
        content: 'Launch plan.',
        completion_evidence: ['A title exists.'],
        confidence: 0.4,
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.phase).toBe('blocked')
    expect(result.failures).toContain('Artifact content is too small to be a useful bounded deliverable.')
  })

  it('does not invent a fallback artifact when every model route fails', async () => {
    const result = await materializeLocalArtifact({
      objective: 'Create a launch plan',
      desiredReality: 'A launch plan exists',
      currentReality: 'Only intent is known',
      outcome: 'Launch plan',
      candidates: [target],
      fetchImpl: async () => new Response('nope', { status: 500 }),
    })

    expect(result.ok).toBe(false)
    expect(result.content).toBe('')
    expect(result.failures[0]).toMatch(/No configured model/)
  })
})
