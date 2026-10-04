import { describe, expect, it } from 'vitest'
import {
  buildSignedEvaluationResultRequest,
  prepareDataCenterBenchmarkCase,
} from '../../supabase/functions/_shared/datacenter-forums-evaluation-feedback'
import {
  verifyDataCenterSignature,
} from '../../supabase/functions/_shared/datacenter-forums-bridge'

describe('DataCenter.Forums evaluation feedback', () => {
  it('parses a valid benchmark case from the observation payload', () => {
    const result = prepareDataCenterBenchmarkCase({
      benchmark: {
        evaluationId: '148',
        evalType: 'verification',
        caseKey: 'sec-verification:test',
        subjectType: 'filing',
        subjectKey: 'test',
        inputState: { sourceSystem: 'sec_edgar' },
        expectedState: { provenanceClass: 'primary_regulatory_filing' },
      },
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        externalEvaluationId: '148',
        evalType: 'verification',
        caseKey: 'sec-verification:test',
      },
    })
  })

  it('rejects malformed benchmark identity', () => {
    expect(
      prepareDataCenterBenchmarkCase({
        benchmark: {
          evaluationId: '',
          evalType: 'verification',
          caseKey: 'case',
        },
      }),
    ).toMatchObject({ ok: false })
  })

  it('builds a body-bound HMAC result callback', async () => {
    const secret = 's'.repeat(32)
    const timestamp = '1791086400'
    const signed = await buildSignedEvaluationResultRequest({
      evalType: 'verification',
      caseKey: 'sec-verification:test',
      outcome: 'pass',
      score: 0.95,
      observedState: { provenanceClass: 'primary_regulatory_filing' },
      notes: 'Matched expected provenance.',
    }, secret, timestamp)

    expect(signed.headers['x-perception-client']).toBe('perception-runtime')
    expect(signed.headers['x-perception-timestamp']).toBe(timestamp)
    await expect(
      verifyDataCenterSignature(
        secret,
        timestamp,
        signed.body,
        signed.headers['x-perception-signature'],
      ),
    ).resolves.toBe(true)
  })
})
