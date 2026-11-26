import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../../api/search'

afterEach(() => vi.unstubAllEnvs())

describe('Vercel public search route — disabled by default', () => {
  it('requires neither guest account nor sign-in, but cannot run unapproved provider', async () => {
    vi.stubEnv('PERCEPTION_SEARCH_PUBLIC_ENABLED', '')
    const response = await GET(new Request('https://www.perceptionai.io/api/search?q=weather'))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: 'not_ready' })
    expect(response.headers.get('Cache-Control')).toContain('no-store')
  })

  it('rejects ambiguous or missing parameters', async () => {
    for (const suffix of ['', '?q=two&q=three', '?q=x&other=y']) {
      const response = await GET(new Request('https://www.perceptionai.io/api/search' + suffix))
      expect(response.status).toBe(400)
    }
  })

  it('cannot reach a provider merely from an enabled UI toggle', async () => {
    vi.stubEnv('PERCEPTION_SEARCH_PUBLIC_ENABLED', 'true')
    vi.stubEnv('PERCEPTION_SEARCH_BRAVE_API_KEY', '')
    const response = await GET(new Request('https://www.perceptionai.io/api/search?q=ordinary'))
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe('not_ready')
  })
})
