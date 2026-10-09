import {
  normalizeEmail,
  normalizePhone,
  submissionFingerprintInput,
} from './microsite-routing.ts'

export type MicrositeLeadIdentityInput = {
  secret: string
  micrositeId: string
  phone: string
  email?: string | null
  zip: string
  issue: string
}

export type MicrositeLeadIdentity = {
  phoneHash: string
  emailHash: string | null
  submissionFingerprint: string
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function buildMicrositeLeadIdentity(
  input: MicrositeLeadIdentityInput,
): Promise<MicrositeLeadIdentity> {
  const secret = String(input.secret ?? '').trim()
  if (!secret) throw new Error('Microsite lead fingerprint secret is required')

  const phone = normalizePhone(input.phone)
  if (!phone) throw new Error('Normalized phone is required')
  const email = normalizeEmail(input.email ?? '')

  const phoneHash = await sha256Hex(`${secret}:phone:${phone}`)
  const emailHash = email
    ? await sha256Hex(`${secret}:email:${email}`)
    : null

  const fingerprintMaterial = submissionFingerprintInput({
    micrositeId: input.micrositeId,
    phoneHash,
    emailHash,
    zip: input.zip,
    issue: input.issue,
  })
  const submissionFingerprint = await sha256Hex(
    `${secret}:submission:${fingerprintMaterial}`,
  )

  return { phoneHash, emailHash, submissionFingerprint }
}
