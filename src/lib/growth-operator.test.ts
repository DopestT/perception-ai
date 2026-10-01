import { describe, expect, it } from 'vitest'
import {
  canonicalSiteUrl,
  extractPageSignals,
  opportunitiesForPage,
  parseSitemapUrls,
  rankGrowthOpportunities,
  siteLevelOpportunity,
} from '../../supabase/functions/_shared/growth-operator'

describe('Growth Operator v0.1', () => {
  it('normalizes HTTPS sites and rejects non-HTTPS sites', () => {
    expect(canonicalSiteUrl('https://example.com/path?q=1')).toBe('https://example.com/')
    expect(() => canonicalSiteUrl('http://example.com')).toThrow(/HTTPS/)
  })

  it('parses only same-host HTTPS sitemap URLs', () => {
    const xml = `
      <urlset>
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/guides/one</loc></url>
        <url><loc>https://other.example/page</loc></url>
        <url><loc>http://example.com/insecure</loc></url>
      </urlset>
    `
    expect(parseSitemapUrls(xml, 'https://example.com/')).toEqual([
      'https://example.com/',
      'https://example.com/guides/one',
    ])
  })

  it('extracts SEO and conversion signals from a page', () => {
    const page = extractPageSignals({
      url: 'https://example.com/guide',
      html: `
        <html>
          <head>
            <title>Useful guide</title>
            <meta name="description" content="A practical guide">
            <link rel="canonical" href="https://example.com/guide">
          </head>
          <body>
            <main>
              <h1>Useful guide</h1>
              <p>Subscribe to get the complete checklist.</p>
              <a href="/next">Next</a>
              <a href="/join">Join</a>
              <a href="https://external.example">Source</a>
            </main>
          </body>
        </html>
      `,
    })

    expect(page.title).toBe('Useful guide')
    expect(page.metaDescription).toBe('A practical guide')
    expect(page.h1Count).toBe(1)
    expect(page.internalLinks).toBe(2)
    expect(page.externalLinks).toBe(1)
    expect(page.hasConversionCta).toBe(true)
  })

  it('turns observable page gaps into bounded jobs', () => {
    const page = extractPageSignals({
      url: 'https://example.com/weak',
      html: '<html><body><main><p>Very short page.</p></main></body></html>',
    })
    const opportunities = opportunitiesForPage({
      page,
      primaryGoal: 'Grow newsletter subscribers',
      repository: 'owner/repo',
    })

    const kinds = opportunities.map((item) => item.kind)
    expect(kinds).toContain('missing_title')
    expect(kinds).toContain('missing_meta_description')
    expect(kinds).toContain('missing_h1')
    expect(kinds).toContain('missing_conversion_path')

    const job = opportunities.find((item) => item.kind === 'missing_h1')?.boundedJob
    expect(job?.permission_level).toBe('P1')
    expect(job?.publish_policy).toBe('approval_required')
    expect(job?.repository).toBe('owner/repo')
  })

  it('prioritizes severe technical gaps ahead of optional discovery aids', () => {
    const page = extractPageSignals({
      url: 'https://example.com/',
      status: 500,
      html: '<html><body></body></html>',
    })
    const pageOpps = opportunitiesForPage({ page, primaryGoal: 'Get leads' })
    const llms = siteLevelOpportunity({
      kind: 'missing_llms',
      siteUrl: 'https://example.com/',
      primaryGoal: 'Get leads',
    })
    const top = rankGrowthOpportunities([...pageOpps, llms], 2)
    expect(top[0].kind).toBe('broken_page')
    expect(top.map((item) => item.kind)).not.toContain('missing_llms')
  })
})
