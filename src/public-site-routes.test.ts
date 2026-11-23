import { describe, expect, it } from 'vitest'
import { PUBLIC_SITE_PAGES, publicPageTitle, resolvePublicPage, starterHref } from './public-site-routes'

describe('PERCEPTION public page navigation', () => {
  it('exposes eight unique page paths without replacing the authenticated homepage', () => {
    expect(PUBLIC_SITE_PAGES).toHaveLength(8)
    expect(new Set(PUBLIC_SITE_PAGES.map(p => p.path)).size).toBe(8)
    expect(resolvePublicPage('/')).toBeNull()
    expect(resolvePublicPage('/auth/callback')).toBeNull()
    expect(resolvePublicPage('/favicon.svg')).toBeNull()
  })
  it('routes direct and trailing-slash URLs to the correct editorial page', () => {
    for (const item of PUBLIC_SITE_PAGES) {
      expect(resolvePublicPage(item.path)).toBe(item.path)
      expect(resolvePublicPage(item.path + '/')).toBe(item.path)
      expect(publicPageTitle(item.path)).toContain('PERCEPTION')
    }
  })
  it('creates non-submitting starter links with bounded query contents', () => {
    const href = starterHref('Research data provenance', 'search')
    const url = new URL(href, 'https://perceptionai.io')
    expect(url.pathname).toBe('/')
    expect(url.searchParams.get('idea')).toBe('Research data provenance')
    expect(url.searchParams.get('mode')).toBe('search')
    expect(url.searchParams.get('submit')).toBeNull()
    expect(new URL(starterHref('x'.repeat(1200)), 'https://perceptionai.io')
      .searchParams.get('idea')).toHaveLength(500)
  })
})
