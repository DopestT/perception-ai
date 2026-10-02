export type GrowthPageSignals = {
  url: string
  path: string
  status: number
  title: string
  metaDescription: string
  canonical: string
  h1: string
  h1Count: number
  wordCount: number
  internalLinks: number
  externalLinks: number
  noindex: boolean
  hasConversionCta: boolean
}

export type GrowthOpportunity = {
  key: string
  kind: string
  targetUrl: string
  targetPath: string
  title: string
  rationale: string
  score: number
  boundedJob: Record<string, unknown>
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function textOnly(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function attr(tag: string, name: string) {
  return tag.match(new RegExp('\\b' + name + '\\s*=\\s*["\\\']([^"\\\']*)["\\\']', 'i'))?.[1] ?? ''
}

function firstTagText(html: string, name: string) {
  return textOnly(html.match(new RegExp('<' + name + '\\b[^>]*>([\\s\\S]*?)<\\/' + name + '>', 'i'))?.[1] ?? '')
}

function metaContent(html: string, key: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = attr(tag, 'name') || attr(tag, 'property')
    if (name.toLowerCase() === key.toLowerCase()) return attr(tag, 'content').trim()
  }
  return ''
}

export function canonicalSiteUrl(raw: string) {
  const parsed = new URL(raw)
  if (parsed.protocol !== 'https:') throw new Error('Growth sites must use HTTPS')
  parsed.hash = ''
  parsed.search = ''
  parsed.pathname = '/'
  return parsed.href
}

export function parseSitemapUrls(xml: string, siteUrl: string, limit = 80) {
  const origin = new URL(siteUrl)
  const urls: string[] = []
  for (const match of xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)) {
    const value = decodeXml(textOnly(match[1] ?? '')).trim()
    if (!value) continue
    try {
      const url = new URL(value, origin)
      if (url.protocol !== 'https:' || url.host !== origin.host) continue
      url.hash = ''
      if (!urls.includes(url.href)) urls.push(url.href)
      if (urls.length >= limit) break
    } catch {
      // Ignore malformed sitemap URLs.
    }
  }
  return urls
}

export function extractPageSignals(input: {
  html: string
  url: string
  status?: number
  primaryGoal?: string
}) : GrowthPageSignals {
  const url = new URL(input.url)
  const title = firstTagText(input.html, 'title')
  const metaDescription = metaContent(input.html, 'description')
  const h1Matches = [...input.html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
  const h1 = textOnly(h1Matches[0]?.[1] ?? '')
  const robots = metaContent(input.html, 'robots').toLowerCase()
  const canonicalTag = (input.html.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i)
    ?? input.html.match(/<link\b[^>]*href\s*=\s*["'][^"']+["'][^>]*rel\s*=\s*["']canonical["'][^>]*>/i))?.[0] ?? ''
  const canonical = attr(canonicalTag, 'href')
  const bodyText = textOnly(
    input.html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
      ?? input.html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1]
      ?? input.html,
  )
  const words = bodyText ? bodyText.split(/\s+/).filter(Boolean) : []
  let internalLinks = 0
  let externalLinks = 0
  for (const tag of input.html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attr(tag, 'href')
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue
    try {
      const linked = new URL(href, url)
      if (linked.host === url.host) internalLinks += 1
      else if (linked.protocol === 'http:' || linked.protocol === 'https:') externalLinks += 1
    } catch {
      // Ignore malformed links.
    }
  }

  const conversionTerms = [
    'subscribe', 'newsletter', 'join', 'sign up', 'signup', 'get the', 'download',
    'start free', 'book a', 'contact us', 'buy', 'checkout',
  ]
  const normalized = bodyText.toLowerCase()
  const hasConversionCta = conversionTerms.some((term) => normalized.includes(term))

  return {
    url: url.href,
    path: url.pathname || '/',
    status: input.status ?? 200,
    title,
    metaDescription,
    canonical,
    h1,
    h1Count: h1Matches.length,
    wordCount: words.length,
    internalLinks,
    externalLinks,
    noindex: robots.includes('noindex'),
    hasConversionCta,
  }
}

export function buildBoundedGrowthJob(input: {
  opportunityKey: string
  kind: string
  targetPath: string
  title: string
  rationale: string
  primaryGoal: string
  repository?: string | null
}) {
  return {
    objective: input.title,
    business_goal: input.primaryGoal,
    repository: input.repository ?? null,
    target_path: input.targetPath,
    opportunity_key: input.opportunityKey,
    constraints: [
      'Inspect current repository context before changing files.',
      'Use the smallest safe change that addresses this opportunity.',
      'Do not alter unrelated routes, branding, analytics, authentication, billing, or deployment configuration.',
      'Do not publish unverified factual claims.',
      'Preserve canonical URLs and existing conversion paths unless the change explicitly targets them.',
    ],
    success_criteria: [
      input.rationale,
      'The affected route still builds successfully.',
      'The change is verifiable from repository or live-page evidence.',
    ],
    permission_level: 'P1',
    publish_policy: 'approval_required',
  }
}

export function opportunitiesForPage(input: {
  page: GrowthPageSignals
  primaryGoal: string
  repository?: string | null
}) : GrowthOpportunity[] {
  const page = input.page
  const opportunities: Array<Omit<GrowthOpportunity, 'boundedJob'>> = []
  const add = (kind: string, score: number, title: string, rationale: string) => {
    const key = `${kind}:${page.path}`
    opportunities.push({
      key,
      kind,
      targetUrl: page.url,
      targetPath: page.path,
      title,
      rationale,
      score,
    })
  }

  if (page.status >= 400) add('broken_page', 100, `Repair ${page.path}`, `The page returned HTTP ${page.status}.`)
  if (page.noindex) add('indexing_blocked', 98, `Review indexing for ${page.path}`, 'The page declares noindex and may be excluded from search.')
  if (!page.title) add('missing_title', 94, `Add a search title to ${page.path}`, 'The page has no HTML title.')
  if (!page.metaDescription) add('missing_meta_description', 82, `Add a meta description to ${page.path}`, 'The page has no meta description.')
  if (page.h1Count === 0) add('missing_h1', 90, `Add a clear H1 to ${page.path}`, 'The page has no H1 heading.')
  if (page.h1Count > 1) add('multiple_h1', 58, `Simplify H1 structure on ${page.path}`, `The page has ${page.h1Count} H1 headings.`)
  if (!page.canonical) add('missing_canonical', 62, `Add a canonical URL to ${page.path}`, 'The page does not expose a canonical link element.')
  const utilityPath = /\/(privacy|terms|contact|thank-you)(\/|$)/i.test(page.path)
  if (!utilityPath && page.wordCount < 250) add('thin_content', 68, `Strengthen useful content on ${page.path}`, `The page exposes about ${page.wordCount} words of visible content.`)
  if (!utilityPath && page.internalLinks < 2) add('weak_internal_linking', 60, `Improve internal links on ${page.path}`, `Only ${page.internalLinks} internal links were detected.`)
  if (!utilityPath && !page.hasConversionCta) add('missing_conversion_path', 76, `Connect ${page.path} to the business goal`, `No clear conversion CTA was detected for the goal: ${input.primaryGoal}.`)

  return opportunities.map((opportunity) => ({
    ...opportunity,
    boundedJob: buildBoundedGrowthJob({
      opportunityKey: opportunity.key,
      kind: opportunity.kind,
      targetPath: opportunity.targetPath,
      title: opportunity.title,
      rationale: opportunity.rationale,
      primaryGoal: input.primaryGoal,
      repository: input.repository,
    }),
  }))
}

export function siteLevelOpportunity(input: {
  kind: 'missing_sitemap' | 'missing_robots' | 'missing_llms'
  siteUrl: string
  primaryGoal: string
  repository?: string | null
}) : GrowthOpportunity {
  const config = {
    missing_sitemap: {
      score: 88,
      path: '/sitemap.xml',
      title: 'Publish a valid sitemap',
      rationale: 'No usable sitemap.xml was found during the scan.',
    },
    missing_robots: {
      score: 66,
      path: '/robots.txt',
      title: 'Publish a robots.txt policy',
      rationale: 'No readable robots.txt was found during the scan.',
    },
    missing_llms: {
      score: 48,
      path: '/llms.txt',
      title: 'Publish an llms.txt discovery file',
      rationale: 'No llms.txt file was found. This is an optional machine-readable discovery aid, not a ranking guarantee.',
    },
  }[input.kind]
  const targetUrl = new URL(config.path, input.siteUrl).href
  const key = `${input.kind}:${config.path}`
  return {
    key,
    kind: input.kind,
    targetUrl,
    targetPath: config.path,
    title: config.title,
    rationale: config.rationale,
    score: config.score,
    boundedJob: buildBoundedGrowthJob({
      opportunityKey: key,
      kind: input.kind,
      targetPath: config.path,
      title: config.title,
      rationale: config.rationale,
      primaryGoal: input.primaryGoal,
      repository: input.repository,
    }),
  }
}

export function rankGrowthOpportunities(opportunities: GrowthOpportunity[], limit = 10) {
  return [...opportunities]
    .sort((a, b) => b.score - a.score || a.kind.localeCompare(b.kind) || a.targetPath.localeCompare(b.targetPath))
    .slice(0, Math.max(1, limit))
}
