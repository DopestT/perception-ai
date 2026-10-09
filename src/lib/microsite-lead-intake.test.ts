import { describe, expect, it } from 'vitest'
import { buildMicrositeLeadIdentity } from '../../supabase/functions/_shared/microsite-intake'

describe('microsite lead identity', () => {
  it('produces the same identity for equivalently normalized contact input', async () => {
    const a = await buildMicrositeLeadIdentity({
      secret: 'test-secret',
      micrositeId: 'site-1',
      phone: '(301) 555-0123',
      email: ' Person@Example.COM ',
      zip: '21740',
      issue: ' No   water ',
    })
    const b = await buildMicrositeLeadIdentity({
      secret: 'test-secret',
      micrositeId: 'site-1',
      phone: '3015550123',
      email: 'person@example.com',
      zip: '21740',
      issue: 'no water',
    })

    expect(a).toEqual(b)
  })

  it('changes submission fingerprint when ZIP or meaningful issue changes', async () => {
    const base = {
      secret: 'test-secret',
      micrositeId: 'site-1',
      phone: '3015550123',
      email: 'person@example.com',
      zip: '21740',
      issue: 'no water',
    }
    const original = await buildMicrositeLeadIdentity(base)
    const changedZip = await buildMicrositeLeadIdentity({ ...base, zip: '21742' })
    const changedIssue = await buildMicrositeLeadIdentity({ ...base, issue: 'low pressure' })

    expect(changedZip.submissionFingerprint).not.toBe(original.submissionFingerprint)
    expect(changedIssue.submissionFingerprint).not.toBe(original.submissionFingerprint)
    expect(changedZip.phoneHash).toBe(original.phoneHash)
    expect(changedIssue.emailHash).toBe(original.emailHash)
  })

  it('returns only hashes and never raw phone or email contact values', async () => {
    const identity = await buildMicrositeLeadIdentity({
      secret: 'test-secret',
      micrositeId: 'site-1',
      phone: '(301) 555-0123',
      email: 'person@example.com',
      zip: '21740',
      issue: 'no water',
    })
    const serialized = JSON.stringify(identity)

    expect(identity.phoneHash).toMatch(/^[a-f0-9]{64}$/)
    expect(identity.emailHash).toMatch(/^[a-f0-9]{64}$/)
    expect(identity.submissionFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(serialized).not.toContain('3015550123')
    expect(serialized).not.toContain('person@example.com')
  })

  it('supports phone-only submissions without inventing an email hash', async () => {
    const identity = await buildMicrositeLeadIdentity({
      secret: 'test-secret',
      micrositeId: 'site-1',
      phone: '3015550123',
      email: '',
      zip: '21740',
      issue: 'no water',
    })

    expect(identity.emailHash).toBeNull()
    expect(identity.phoneHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects an empty fingerprint secret', async () => {
    await expect(buildMicrositeLeadIdentity({
      secret: ' ',
      micrositeId: 'site-1',
      phone: '3015550123',
      email: 'person@example.com',
      zip: '21740',
      issue: 'no water',
    })).rejects.toThrow(/secret/i)
  })
})
