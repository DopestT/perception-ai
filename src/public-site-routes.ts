/** Public editorial pages. The protected work application remains at /. */
export const PUBLIC_SITE_PAGES = [
  { path: '/about', label: 'About', title: 'Why PERCEPTION exists' },
  { path: '/possibilities', label: 'Possibilities', title: 'Ways to begin' },
  { path: '/how-it-works', label: 'How it works', title: 'From intention to evidence' },
  { path: '/your-work', label: 'Your work', title: 'A place for ideas to grow' },
  { path: '/trust', label: 'Trust', title: 'Human control, verifiable results' },
  { path: '/agents', label: 'Agents', title: 'The agent laboratory' },
  { path: '/test-lab', label: 'Test lab', title: 'Put PERCEPTION to the test' },
  { path: '/faq', label: 'FAQ', title: 'Questions, answered clearly' },
] as const

export type PublicPagePath = typeof PUBLIC_SITE_PAGES[number]['path']

export function resolvePublicPage(pathname: string): PublicPagePath | null {
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '')
  const match = PUBLIC_SITE_PAGES.find(item => item.path === path)
  return match?.path ?? null
}

export function publicPageTitle(path: PublicPagePath): string {
  const entry = PUBLIC_SITE_PAGES.find(item => item.path === path)
  return entry ? `${entry.title} | PERCEPTION` : 'PERCEPTION'
}

/** Only a fixed set of safe example prompts can be passed to the home input. */
export function starterHref(prompt: string, mode: 'discover'|'search'|'perceive'|'forecast' = 'perceive') {
  const query = new URLSearchParams({ idea: prompt.slice(0, 500), mode })
  return `/?${query.toString()}`
}
