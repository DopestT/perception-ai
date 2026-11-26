import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WebSearchResults } from './WebSearchResults'
import type { WebSearchPage } from './lib/web-search-contract'

const page: WebSearchPage = {
  query: 'how do tides work?',
  retrievedAt: '2026-11-26T18:50:00.000Z',
  status: 'results',
  results: [{
    rank: 1,
    title: 'Understanding ocean tides',
    url: 'https://www.example.org/ocean/tides',
    source: 'www.example.org',
    snippet: 'Tides are influenced by lunar gravity.',
    publishedAt: null,
  }],
}

describe('ordinary results-first SEARCH UI', () => {
  it('shows clickable public links and snippets without a sign-in step', () => {
    const html = renderToStaticMarkup(<WebSearchResults page={page}/>)
    expect(html).toContain('Understanding ocean tides')
    expect(html).toContain('href="https://www.example.org/ocean/tides"')
    expect(html).toContain('Tides are influenced by lunar gravity.')
    expect(html).not.toMatch(/sign in|sign up|account required/i)
    expect(html).not.toContain('Analyze with PERCEPTION')
  })

  it('only offers deeper analysis when the host supplies an explicit handler', () => {
    const html = renderToStaticMarkup(<WebSearchResults page={page} onAnalyze={() => undefined}/>)
    expect(html).toContain('Analyze with PERCEPTION (optional)')
    expect(html).toContain('external sources, not independently verified claims')
  })

  it('does not show optional analysis for empty provider results', () => {
    const empty: WebSearchPage = { query: 'unknown', retrievedAt: page.retrievedAt, status: 'empty', results: [] }
    const html = renderToStaticMarkup(<WebSearchResults page={empty} onAnalyze={() => undefined}/>)
    expect(html).toContain('No matching web results were returned')
    expect(html).not.toContain('Analyze with PERCEPTION')
    expect(html).not.toContain('Understanding ocean tides')
  })

  it('escapes untrusted titles instead of rendering provider HTML', () => {
    const unsafe: WebSearchPage = {
      ...page,
      results: [{ ...page.results[0], title: '<script>alert(1)</script>' }],
    }
    const html = renderToStaticMarkup(<WebSearchResults page={unsafe}/>)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
