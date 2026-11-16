import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pages = readFileSync(new URL('./PublicPages.tsx', import.meta.url), 'utf8')
const router = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./public-pages.css', import.meta.url), 'utf8')
const homeStyles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

const paths = ['/about', '/possibilities', '/how-it-works', '/your-work',
  '/trust', '/agents', '/test-lab', '/faq']

describe('complete PERCEPTION public pages', () => {
  it('keeps authenticated work routes on the original home app', () => {
    expect(router).toContain("resolvePublicPage(window.location.pathname)")
    expect(router).toContain('<PublicPages page={publicPage} /> : <App />')
    expect(router).toContain("const App = lazy(() => import('./App'))")
    expect(router).toContain("await import('./PublicPages')")
    expect(router).toContain('role="status"')
    expect(app).toContain('<PlasmaPortal mode={portalMode}')
    expect(app).toContain('<PerceptionVision onStart=')
  })

  it('deploys every published page through the existing Vite frontend', () => {
    expect(vercel.rewrites.map(item => item.source).sort()).toEqual([...paths].sort())
    expect(vercel.rewrites.every(item => item.destination === '/index.html')).toBe(true)
    for (const path of paths) expect(pages).toContain("page === '" + path + "'")
  })

  it('shows every route through the homepage sitemap', () => {
    for (const path of paths) expect(app).toContain('href="' + path + '"')
    expect(app).toContain('home-public-nav')
    expect(homeStyles).toContain('background: rgba(10, 29, 41, .97)')
    expect(homeStyles).toContain('scroll-margin-top: 95px')
  })

  it('provides 20 usable prompts and honest scoring without implied execution', () => {
    const start = pages.indexOf('const labTests = [')
    const end = pages.indexOf('] as const', start)
    const prompts = pages.slice(start, end)
    const count = (prompts.match(/^  \['/gm) || []).length
    expect(count).toBe(20)
    expect(pages).toContain('navigator.clipboard.writeText(prompt)')
    expect(pages).toContain('starterHref(prompt,')
    expect(pages).toContain('0 = failed or fabricated; 1 = useful but incomplete; 2 = correct and independently evidenced')
  })

  it('keeps forthcoming agent capabilities explicitly marked as development', () => {
    expect(pages).toContain('PERCEPTION AGENT LAB · DEVELOPMENT')
    expect(pages).toContain('not a claim of universal live autonomous execution')
    expect(pages).toContain('Not reliably as a universal product promise today')
    expect(pages).toContain('existing Project World')
    expect(pages).toContain('subject to verification and authorization')
  })

  it('provides accessible, responsive page navigation', () => {
    expect(pages).toContain('aria-label="Site navigation"')
    expect(pages).toContain('aria-label="All public pages"')
    expect(pages).toContain('aria-current=')
    expect(styles).toContain('prefers-reduced-motion:reduce')
    expect(styles).toContain('@media(max-width:650px)')
    expect(styles).toContain('focus-visible')
  })

  it('does not expose or modify authentication or project data on public pages', () => {
    for (const forbidden of [
      'getProjectWorld(', 'getSession(', 'signInWithPassword(', 'localStorage.setItem(',
      'supabase.from(', 'fetch(', 'navigator.geolocation',
    ]) expect(pages).not.toContain(forbidden)
  })
})
