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
