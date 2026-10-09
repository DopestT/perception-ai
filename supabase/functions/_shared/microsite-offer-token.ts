export type OfferTokenPayload = {
  offerId: string
  routeId: string
  expiresAt: string
}

export type OfferTokenVerification =
  | { ok: true; payload: OfferTokenPayload }
  | { ok: false; reason: 'invalid' | 'expired' }

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid base64url')
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function canonicalPayload(payload: OfferTokenPayload): OfferTokenPayload {
  return {
    offerId: String(payload.offerId ?? '').trim(),
    routeId: String(payload.routeId ?? '').trim(),
    expiresAt: String(payload.expiresAt ?? '').trim(),
  }
}

async function hmac(value: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const max = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let index = 0; index < max; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0)
  }
  return diff === 0
}

function validSecret(secret: string) {
  return String(secret ?? '').trim().length >= 16
}

export async function signOfferToken(payload: OfferTokenPayload, secret: string): Promise<string> {
  if (!validSecret(secret)) throw new Error('Offer token secret must be at least 16 characters')
  const normalized = canonicalPayload(payload)
  if (!normalized.offerId || !normalized.routeId || !Number.isFinite(Date.parse(normalized.expiresAt))) {
    throw new Error('Invalid offer token payload')
  }
  const encodedPayload = encodeBase64Url(encoder.encode(JSON.stringify(normalized)))
  const signature = await hmac(encodedPayload, secret)
  return `${encodedPayload}.${encodeBase64Url(signature)}`
}

export async function verifyOfferToken(
  token: string,
  secret: string,
  now = new Date(),
): Promise<OfferTokenVerification> {
  if (!validSecret(secret) || typeof token !== 'string') return { ok: false, reason: 'invalid' }
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'invalid' }

  try {
    const expected = await hmac(parts[0], secret)
    const provided = decodeBase64Url(parts[1])
    if (!constantTimeEqual(expected, provided)) return { ok: false, reason: 'invalid' }

    const parsed = JSON.parse(decoder.decode(decodeBase64Url(parts[0]))) as Partial<OfferTokenPayload>
    const payload = canonicalPayload({
      offerId: parsed.offerId ?? '',
      routeId: parsed.routeId ?? '',
      expiresAt: parsed.expiresAt ?? '',
    })
    const expiresAt = Date.parse(payload.expiresAt)
    if (!payload.offerId || !payload.routeId || !Number.isFinite(expiresAt)) return { ok: false, reason: 'invalid' }
    if (expiresAt <= now.getTime()) return { ok: false, reason: 'expired' }
    return { ok: true, payload }
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}

export async function hashOfferToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
