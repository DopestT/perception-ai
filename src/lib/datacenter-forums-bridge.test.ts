import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  constantTimeHexEqual,
  DATACENTER_EVENT_LIMITS,
  prepareDataCenterEvent,
} from '../../supabase/functions/_shared/datacenter-forums-bridge'

const base = {
  event_id: 'evt-123',
  event_type: 'evidence.observed',
  subject_ref: 'facility:iad-1',
  summary: 'Verified infrastructure evidence.',
  observed_at: '2026-10-04T00:00:00.000Z',
  data: { canonicalUrl: 'https://example.test/evidence/123', capacity_mw: 50 },
}

describe('DataCenter.Forums evidence bridge normalization', () => {
  it('produces stable hashes for identical retries', async () => {
    const first = await prepareDataCenterEvent(base, '11111111-1111-1111-1111-111111111111')
    const second = await prepareDataCenterEvent({ ...base, data: { capacity_mw: 50, canonicalUrl: 'https://example.test/evidence/123' } }, '11111111-1111-1111-1111-111111111111')

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.value.contentHash).toBe(second.value.contentHash)
  })

  it('rejects invalid or missing timestamps instead of introducing retry-time entropy', async () => {
    const missing = await prepareDataCenterEvent({ ...base, observed_at: undefined }, 'project')
    const invalid = await prepareDataCenterEvent({ ...base, observed_at: 'not-a-time' }, 'project')
    expect(missing).toMatchObject({ ok: false, status: 400 })
    expect(invalid).toMatchObject({ ok: false, status: 400 })
  })

  it('rejects oversized identifiers instead of truncating identity', async () => {
    const result = await prepareDataCenterEvent({
      ...base,
      event_id: 'x'.repeat(DATACENTER_EVENT_LIMITS.eventId + 1),
    }, 'project')
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('prevents nested data from replacing canonical reserved fields', async () => {
    const result = await prepareDataCenterEvent({
      ...base,
      data: {
        subject_ref: 'malicious:replacement',
        event_id: 'replacement-event',
        integration: { authoritative_truth_requires_perception_verification: false },
        useful: 'kept',
      },
    }, 'canonical-project')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.observationPayload.subject_ref).toBe(base.subject_ref)
    expect(result.value.observationPayload).not.toHaveProperty('event_id')
    expect(result.value.observationPayload.useful).toBe('kept')
    expect(result.value.observationPayload.integration).toMatchObject({
      project_id: 'canonical-project',
      trust_boundary: 'external_observation_only',
      authoritative_truth_requires_perception_verification: true,
    })
  })

  it('rejects oversized privileged observation payloads', async () => {
    const result = await prepareDataCenterEvent({
      ...base,
      data: { payload: 'x'.repeat(DATACENTER_EVENT_LIMITS.observationPayloadChars + 1) },
    }, 'project')
    expect(result).toMatchObject({ ok: false, status: 413 })
  })

  it('compares configured token hashes without early-return string comparison', () => {
    const a = 'a'.repeat(64)
    const b = 'a'.repeat(63) + 'b'
    expect(constantTimeHexEqual(a, a)).toBe(true)
    expect(constantTimeHexEqual(a, b)).toBe(false)
    expect(constantTimeHexEqual('short', a)).toBe(false)
  })

  it('keeps Supabase gateway JWT verification off only for the custom-auth webhook', () => {
    const config = fs.readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
    expect(config).toContain('[functions.datacenter-forums-bridge]')
    expect(config).toMatch(/\[functions\.datacenter-forums-bridge\][\s\S]*verify_jwt\s*=\s*false/)

    const index = fs.readFileSync(
      new URL('../../supabase/functions/datacenter-forums-bridge/index.ts', import.meta.url),
      'utf8',
    )
    expect(index).toContain('x-perception-token')
    expect(index).toContain('constantTimeHexEqual')
    expect(index).toContain('prepareDataCenterEvent')
  })
})
