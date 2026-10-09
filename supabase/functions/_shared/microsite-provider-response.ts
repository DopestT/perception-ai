import { hashOfferToken, verifyOfferToken } from './microsite-offer-token.ts'

export type ProviderOfferContext = {
  id: string
  routeId: string
  status: string
  expiresAt: string
}

export interface ProviderResponseRepository {
  getOffer(offerId: string): Promise<ProviderOfferContext | null>
  resolvePass(offerId: string, idempotencyKey: string): Promise<{ status: string }>
  acceptOffer(offerId: string, idempotencyKey: string): Promise<{ status: string; provider_id?: string }>
}

export type ProviderResponseResult = {
  statusCode: number
  body: { ok: boolean; status?: string; error?: string }
}

export async function handleMicrositeProviderResponse(
  input: { token: string; response: string },
  repo: ProviderResponseRepository,
  secret: string,
  now = new Date(),
): Promise<ProviderResponseResult> {
  const response = String(input.response ?? '').trim().toUpperCase()
  if (response !== 'ACCEPT' && response !== 'PASS') {
    return { statusCode: 400, body: { ok: false, error: 'invalid_response' } }
  }
  const token = String(input.token ?? '').trim()
  if (!token) return { statusCode: 401, body: { ok: false, error: 'token_required' } }

  const verified = await verifyOfferToken(token, secret, now)
  if (!verified.ok) {
    return { statusCode: 403, body: { ok: false, error: verified.reason } }
  }

  const offer = await repo.getOffer(verified.payload.offerId)
  if (!offer) return { statusCode: 404, body: { ok: false, error: 'offer_not_found' } }
  if (offer.routeId !== verified.payload.routeId) {
    return { statusCode: 403, body: { ok: false, error: 'token_scope_mismatch' } }
  }

  if (offer.status === 'EXPIRED' || Date.parse(offer.expiresAt) <= now.getTime()) {
    return { statusCode: 200, body: { ok: true, status: 'expired' } }
  }

  const tokenHash = await hashOfferToken(token)
  if (response === 'PASS') {
    const result = await repo.resolvePass(offer.id, `pass:${offer.id}:${tokenHash.slice(0, 20)}`)
    return { statusCode: 200, body: { ok: true, status: result.status } }
  }

  const result = await repo.acceptOffer(offer.id, `accept:${offer.id}:${tokenHash.slice(0, 20)}`)
  return { statusCode: 200, body: { ok: true, status: result.status } }
}
