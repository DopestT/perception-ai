import { describe, expect, it } from 'vitest'
import {
  deterministicMeaning,
  resolveObjectiveMeaning,
} from '../../supabase/functions/_shared/meaning-resolver'

describe('Perception Meaning Resolver', () => {
  it('preserves the direct objective and explicit uncertainty in fallback mode', async () => {
    const meaning = await resolveObjectiveMeaning('Build a launch plan for my project.')

    expect(meaning.source).toBe('deterministic_fallback')
    expect(meaning.desired_reality).toBe('Build a launch plan for my project.')
    expect(meaning.current_reality).toContain('direct objective statement')
    expect(meaning.known_unknowns.length).toBeGreaterThan(0)
    expect(meaning.inferred_claims).toEqual([])
  })

  it('detects urgency conservatively without inventing a deadline', () => {
    const meaning = deterministicMeaning('I need this fixed ASAP.')

    expect(meaning.urgency).toBe('high')
    expect(meaning.constraints).toEqual([])
  })

  it('accepts schema-shaped provider output and normalizes it', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(JSON.stringify({
        output: [{
          content: [{
            type: 'output_text',
            text: JSON.stringify({
              desired_reality: 'A working launch plan',
              current_reality: 'A plan has not been verified yet.',
              constraints: ['Use the existing project'],
              success_criteria: ['A verified launch plan exists'],
              deliverables: ['Launch plan'],
              urgency: 'normal',
              known_unknowns: ['Current launch assets are unknown'],
              inferred_claims: [{
                claim_key: 'objective.requires_existing_project',
                statement: 'The user likely wants to preserve the existing project.',
                confidence: 0.7,
                route_impact: 'Inspect current project state before proposing replacement work.',
              }],
              confidence: 0.82,
            }),
          }],
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    const meaning = await resolveObjectiveMeaning('Build the launch plan.', {
      apiKey: 'test-key',
      model: 'test-model',
      fetchImpl: fakeFetch,
    })

    expect(meaning.source).toBe('openai')
    expect(meaning.model).toBe('test-model')
    expect(meaning.confidence).toBe(0.82)
    expect(meaning.known_unknowns).toEqual(['Current launch assets are unknown'])
    expect(meaning.inferred_claims[0]?.confidence).toBe(0.7)
  })


  it('sends OpenAI meaning requests as non-persistent bounded copies', async () => {
    const captured: { body?: Record<string, unknown> } = {}
    const fakeFetch: typeof fetch = async (_input, init) => {
      captured.body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          desired_reality: 'A bounded result',
          current_reality: 'Only submitted evidence is known.',
          constraints: [],
          success_criteria: ['Bounded result exists'],
          deliverables: ['Result'],
          urgency: 'normal',
          known_unknowns: [],
          inferred_claims: [],
          confidence: 0.8,
        }),
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    await resolveObjectiveMeaning('Create a bounded result.', {
      apiKey: 'test-key',
      model: 'test-model',
      fetchImpl: fakeFetch,
    })

    expect(captured.body?.store).toBe(false)
    const input = captured.body?.input as Array<{ role: string; content: string }>
    expect(input[0]?.content).toContain('non-authoritative working copy')
    expect(captured.body).not.toHaveProperty('conversation')
    expect(captured.body).not.toHaveProperty('previous_response_id')
  })


  it('falls back safely when the provider fails', async () => {
    const fakeFetch: typeof fetch = async () => new Response('nope', { status: 500 })

    const meaning = await resolveObjectiveMeaning('Continue the project.', {
      apiKey: 'test-key',
      model: 'test-model',
      fetchImpl: fakeFetch,
    })

    expect(meaning.source).toBe('deterministic_fallback')
  })
})

describe('safety-critical objective preservation', () => {
  function localModelResponse(overrides: Record<string, unknown> = {}): typeof fetch {
    return async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        desired_reality: 'Model interpretation',
        current_reality: 'Unverified success already happened.',
        constraints: [],
        success_criteria: [],
        deliverables: [],
        urgency: 'normal',
        known_unknowns: [],
        inferred_claims: [],
        confidence: 0.99,
        ...overrides,
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const localTarget = {
    id: 'test-local',
    provider: 'local' as const,
    lane: 'economy' as const,
    model: 'apple-local',
    protocol: 'chat_completions' as const,
    baseUrl: 'http://127.0.0.1:11434/v1',
  }

  it('preserves free access and Friday deadline even when a local model omits them', async () => {
    const meaning = await resolveObjectiveMeaning(
      'Build a free portfolio website by Friday. Do not use any paid services.',
      { candidates: [localTarget], fetchImpl: localModelResponse() },
    )
    const constraints = meaning.constraints.join(' | ').toLowerCase()
    expect(constraints).toContain('friday')
    expect(constraints).toContain('do not use any paid services')
    expect(meaning.source).toBe('local')
  })

  it('preserves the prohibition on transmitting sensitive data', async () => {
    const meaning = await resolveObjectiveMeaning(
      'Make an attendance dashboard, but do not transmit individual attendance data outside our organization.',
      { candidates: [localTarget], fetchImpl: localModelResponse() },
    )
    expect(meaning.constraints.join(' ')).toMatch(/do not transmit individual attendance data outside our organization/i)
  })

  it('treats unprovided revenue numbers as unknown, not proven growth', async () => {
    const meaning = await resolveObjectiveMeaning(
      'Find out whether ExampleCo revenue increased last quarter. I have not provided any sales figures.',
      { candidates: [localTarget], fetchImpl: localModelResponse({ current_reality: 'ExampleCo revenue increased last quarter.' }) },
    )
    expect(meaning.known_unknowns.join(' ')).toMatch(/not provided any sales figures/i)
    expect(meaning.current_reality).not.toMatch(/revenue increased/i)
  })

  it('does not invent current sign-in status when production has not been tested', async () => {
    const meaning = await resolveObjectiveMeaning(
      'Research whether our users can sign in without a password. We have not tested the current production flow.',
      { candidates: [localTarget], fetchImpl: localModelResponse({ current_reality: 'Password required for sign-in.' }) },
    )
    expect(meaning.known_unknowns.join(' ')).toMatch(/not tested the current production flow/i)
    expect(meaning.current_reality).not.toMatch(/password required/i)
  })

  it('retains explicitly numbered course requirements even if the model drops them', async () => {
    const meaning = await resolveObjectiveMeaning(
      'Create a 4-week AI course with 5 quizzes and 15-minute lessons.',
      { candidates: [localTarget], fetchImpl: localModelResponse() },
    )
    const constraints = meaning.constraints.join(' | ')
    expect(constraints).toMatch(/4-week/i)
    expect(constraints).toMatch(/5 quizzes/i)
    expect(constraints).toMatch(/15-minute/i)
  })

  it('preserves no-send restrictions during deterministic fallback', () => {
    const meaning = deterministicMeaning('Draft an email asking for permission. Do not send it.')
    expect(meaning.constraints.join(' ')).toMatch(/do not send it/i)
  })

  it('preserves no-production, no-deletion, and no-permission-change boundaries', () => {
    const meaning = deterministicMeaning('Give me a migration plan, but do not touch production, delete data, or change access permissions.')
    expect(meaning.constraints.join(' ')).toMatch(/production.*delete data.*change access permissions/i)
  })
})

describe('recovery-plan and goal-integrity guardrails', () => {
  it('preserves an explicitly requested rollback plan when provider omits it', async () => {
    const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        desired_reality: 'Donor form fixed',
        current_reality: 'Form repaired',
        constraints: [],
        success_criteria: [],
        deliverables: [],
        urgency: 'normal',
        known_unknowns: [],
        inferred_claims: [],
        confidence: 0.95,
      }) } }],
    }), { status: 200 })
    const meaning = await resolveObjectiveMeaning(
      'Critical: our donor registration form is broken. We need a rollback plan immediately.',
      { candidates: [{ id: 'local', model: 'free-model', provider: 'local', lane: 'economy', protocol: 'chat_completions', baseUrl: 'http://localhost:11434/v1' }], fetchImpl: fakeFetch },
    )
    expect(meaning.deliverables.join(' | ')).toMatch(/rollback plan/i)
    expect(meaning.urgency).toBe('critical')
  })

  it('never turns a question into an asserted desired outcome or invents a migration target', async () => {
    const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        desired_reality: 'Migrate to a new database',
        current_reality: 'Existing database',
        constraints: [],
        success_criteria: [],
        deliverables: [],
        urgency: 'normal',
        known_unknowns: [],
        inferred_claims: [],
        confidence: 0.99,
      }) } }],
    }), { status: 200 })
    const statement = 'Give me a migration plan, but do not touch live production, delete data, or change access permissions.'
    const meaning = await resolveObjectiveMeaning(statement, {
      candidates: [{ id: 'local', model: 'free-model', provider: 'local', lane: 'economy', protocol: 'chat_completions', baseUrl: 'http://localhost:11434/v1' }],
      fetchImpl: fakeFetch,
    })
    expect(meaning.desired_reality).toBe(statement)
    expect(meaning.current_reality).toContain('Only the direct objective statement')
  })
})
