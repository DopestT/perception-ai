import { describe, expect, it } from 'vitest'
import { mergeSourceRefs, normalizeSourceRefs } from '../supabase/functions/_shared/source-refs'

describe('source ref normalization', () => {
  it('keeps only bounded allowlisted source context', () => {
    const refs = normalizeSourceRefs([
      {
        kind: 'netizens_world',
        ref: 'netizens://place/local/entity/123',
        source: 'netizens',
        place_id: 'local',
        entity_id: '123',
        ignored: 'do-not-copy',
      },
      null,
      { kind: '', ref: 'missing-kind' },
    ])

    expect(refs).toEqual([
      {
        kind: 'netizens_world',
        ref: 'netizens://place/local/entity/123',
        source: 'netizens',
        place_id: 'local',
        entity_id: '123',
      },
    ])
  })

  it('deduplicates existing and incoming refs', () => {
    const merged = mergeSourceRefs(
      [{ kind: 'user_input', ref: 'hello' }],
      [
        { kind: 'user_input', ref: 'hello' },
        { kind: 'netizens_world', ref: 'netizens://place/plans' },
      ],
    )

    expect(merged).toHaveLength(2)
    expect(merged[1]).toEqual({ kind: 'netizens_world', ref: 'netizens://place/plans' })
  })

  it('preserves the complete existing user-input provenance', () => {
    const longStatement = 'x'.repeat(1200)
    const existing = [{ kind: 'user_input', ref: longStatement, observed_at: '2026-10-02T00:00:00Z' }]
    const merged = mergeSourceRefs(existing, [
      { kind: 'netizens_world', ref: 'netizens://place/local' },
    ])

    expect(merged[0]).toEqual(existing[0])
    expect(merged[0].ref).toHaveLength(1200)
    expect(merged[1]).toEqual({ kind: 'netizens_world', ref: 'netizens://place/local' })
  })

  it('caps the number of refs', () => {
    const refs = normalizeSourceRefs(
      Array.from({ length: 20 }, (_, i) => ({ kind: 'test', ref: String(i) })),
      3,
    )
    expect(refs).toHaveLength(3)
  })
})
