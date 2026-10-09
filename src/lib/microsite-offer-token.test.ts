import { describe, expect, it } from 'vitest'
import {
  hashOfferToken,
  signOfferToken,
  verifyOfferToken,
} from '../../supabase/functions/_shared/microsite-offer-token'

const SECRET = '0123456789abcdef0123456789abcdef'
const payload = {
  offerId: 'offer-1',
  routeId: 'route-1',
  expiresAt: '2026-10-09T20:00:00.000Z',
}
const beforeExpiry = new Date('2026-10-09T19:00:00.000Z')

describe('microsite offer tokens', () => {
  it('signs deterministically and verifies the exact bounded payload', async () => {
    const a = await signOfferToken(payload, SECRET)
    const b = await signOfferToken(payload, SECRET)
    expect(a).toBe(b)

    const result = await verifyOfferToken(a, SECRET, beforeExpiry)
    expect(result).toEqual({ ok: true, payload })
  })

  it('rejects payload tampering, including another offer or route', async () => {
    const token = await signOfferToken(payload, SECRET)
    const [encoded, signature] = token.split('.')
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    decoded.offerId = 'offer-2'
    decoded.routeId = 'route-2'
    const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url')

    await expect(verifyOfferToken(`${tamperedPayload}.${signature}`, SECRET, beforeExpiry)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('rejects signature tampering', async () => {
    const token = await signOfferToken(payload, SECRET)
    const [encoded, signature] = token.split('.')
    const first = signature[0] === 'A' ? 'B' : 'A'
    const tampered = `${encoded}.${first}${signature.slice(1)}`

    expect(await verifyOfferToken(tampered, SECRET, beforeExpiry)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejects expired tokens', async () => {
    const token = await signOfferToken(payload, SECRET)
    expect(await verifyOfferToken(token, SECRET, new Date('2026-10-09T20:00:00.001Z'))).toEqual({
      ok: false,
      reason: 'expired',
    })
  })

  it('hashes the raw token for safe correlation without storing it', async () => {
    const token = await signOfferToken(payload, SECRET)
    const hash = await hashOfferToken(token)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).toBe(await hashOfferToken(token))
    expect(hash).not.toContain(token)
  })
})
