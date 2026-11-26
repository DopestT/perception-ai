import { describe, expect, it } from 'vitest'
import {
  MAX_WEB_QUERY_LENGTH,
  normalizeWebQuery,
  normalizeWebSearchPage,
  safePublicResultUrl,
} from './web-search-contract'

const retrievedAt = '2026-11-26T18:50:00.000Z'
const hit = {
  title: 'Official Example Source',
  url: 'https://example.com/news?topic=test&utm_source=provider#summary',
  description: 'An attributed public web snippet.',
  published_at: '2026-11-25',
}

describe('conventional guest web search contract — offline only', () => {
  it('accepts ordinary questions without any session, token, or Project World', () => {
    const data = normalizeWebSearchPage({
      query: '   How do tides work?  ',
      retrievedAt,
      providerHits: [hit],
    })
    expect(data.query).toBe('How do tides work?')
    expect(data.status).toBe('results')
    expect(data.results).toHaveLength(1)
    expect(data.results[0]).toMatchObject({
      rank: 1,
      source: 'example.com',
      title: 'Official Example Source',
      snippet: 'An attributed public web snippet.',
    })
    expect(JSON.stringify(data)).not.toMatch(/model[_ -]?response|auth|project_id|summary/i)
  })

  it('bounds and cleans the query, rejecting empty or excessive text', () => {
    expect(normalizeWebQuery(' new\n  search  ')).toBe('new search')
    expect(() => normalizeWebQuery('  ')).toThrow()
    expect(() => normalizeWebQuery('a'.repeat(MAX_WEB_QUERY_LENGTH + 1))).toThrow()
    expect(() => normalizeWebQuery({ q: 'untrusted' })).toThrow()
  })

  it('keeps ordinary clickable HTTPS source links, not a provider redirect', () => {
    const result = normalizeWebSearchPage({ query: 'News', retrievedAt, providerHits: [hit] })
    expect(result.results[0].url).toBe('https://example.com/news?topic=test')
    expect(result.results[0].publishedAt).toBe('2026-11-25T00:00:00.000Z')
  })

  it('rejects script, non-TLS, credentialed, local and direct-IP URLs', () => {
    for (const url of [
      'javascript:alert(1)', 'http://example.com/', 'ftp://example.com/',
      'https://user:password@example.com/', 'https://localhost/',
      'https://intranet.local/', 'https://internal.test/',
      'https://127.0.0.1/', 'https://192.168.0.2/',
      'https://[::1]/', 'https://example.com:443/',
    ]) expect(safePublicResultUrl(url)).toBeNull()
  })

  it('does not invent titles, snippets or citations for empty provider responses', () => {
    const result = normalizeWebSearchPage({
      query: 'unanswerable question',
      retrievedAt,
      providerHits: [
        { url: 'https://valid.example.net/item', title: '' },
        { url: 'https://bad.example.net/item', title: 'Bad', snippet: 'No' },
      ],
    })
    expect(result.status).toBe('results')
    expect(result.results).toHaveLength(1)
    expect(result.results[0].title).toBe('Bad')
    expect(result.results[0].snippet).toBe('No')
    expect(result).not.toHaveProperty('answer')
    expect(result).not.toHaveProperty('citations')
  })

  it('returns an honest empty state when no usable sources exist', () => {
    const result = normalizeWebSearchPage({
      query: 'unknown',
      retrievedAt,
      providerHits: [{ title: 'Private address', url: 'http://localhost' }, {}],
    })
    expect(result).toEqual({ query: 'unknown', retrievedAt, results: [], status: 'empty' })
  })

  it('deduplicates and retains provider ranking without fabricating scores', () => {
    const result = normalizeWebSearchPage({
      query: 'relevant research',
      retrievedAt,
      providerHits: [
        hit, { ...hit, title: 'Same URL', url: 'https://example.com/news?topic=test' },
        { title: 'Second', url: 'https://another.org/path' },
      ],
    })
    expect(result.results.map((r) => r.title)).toEqual(['Official Example Source', 'Second'])
    expect(result.results.map((r) => r.rank)).toEqual([1, 2])
    expect(result.results[0]).not.toHaveProperty('score')
  })

  it('caps output at a controlled 1 to 10 results', () => {
    const providerHits = Array.from({ length: 25 }, (_, i) => ({
      url: `https://news.example.org/item/${i}`, title: `Item ${i}`,
    }))
    expect(normalizeWebSearchPage({ query: 'x', retrievedAt, providerHits }).results).toHaveLength(10)
    expect(normalizeWebSearchPage({ query: 'x', retrievedAt, providerHits, limit: 3 }).results).toHaveLength(3)
    expect(normalizeWebSearchPage({ query: 'x', retrievedAt, providerHits, limit: -2 }).results).toHaveLength(1)
  })

  it('does not invent a source publication date when provider dates are missing', () => {
    const data = normalizeWebSearchPage({ query: 'x', retrievedAt, providerHits: [
      { title: 'One', url: 'https://one.com', published_at: 'not a date' },
    ] })
    expect(data.results[0].publishedAt).toBeNull()
    expect(() => normalizeWebSearchPage({ query: 'x', retrievedAt: '', providerHits: [] })).toThrow()
  })

  it('does not turn search into mandatory Perception analysis', () => {
    const result = normalizeWebSearchPage({ query: 'plain web links', retrievedAt, providerHits: [hit] })
    expect(result.results[0].url).toContain('example.com')
    expect('analysis' in result).toBe(false)
    expect('account' in result).toBe(false)
  })
})
