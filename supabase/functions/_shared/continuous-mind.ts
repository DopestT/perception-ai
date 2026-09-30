export type LearningSourceType = 'rss' | 'atom' | 'json_feed' | 'webpage' | 'api'

export type ParsedStudyItem = {
  id: string
  title: string
  summary: string
  excerpt: string
  url: string
  publishedAt: string | null
}

export type StudyContext = {
  projectName: string
  desiredReality: string
  currentReality: string
}

export type StudyMetrics = {
  relevance: number
  impact: number
  novelty: number
  confidence: number
  urgency: number
  noise: number
  materiality: number
  whyItMatters: string
}

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'and', 'are', 'because', 'been',
  'before', 'being', 'between', 'both', 'but', 'can', 'could', 'does', 'each',
  'from', 'have', 'into', 'its', 'more', 'most', 'not', 'only', 'other', 'our',
  'should', 'some', 'such', 'than', 'that', 'the', 'their', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'under', 'very', 'was', 'were',
  'what', 'when', 'where', 'which', 'while', 'will', 'with', 'would', 'your',
])

const IMPACT_TERMS = new Set([
  'announce', 'breaking', 'change', 'changed', 'deprecate', 'deprecated', 'launch',
  'launched', 'migration', 'new', 'policy', 'release', 'released', 'require',
  'required', 'security', 'update', 'updated', 'upgrade', 'verified',
])

const URGENCY_TERMS = new Set([
  'breaking', 'critical', 'deadline', 'immediately', 'incident', 'now', 'outage',
  'required', 'security', 'urgent', 'vulnerability',
])

const CLICKBAIT_TERMS = [
  'you won\'t believe', 'shocking', 'one weird trick', 'must see', 'click here',
]

const entityMap: Record<string, string> = {
  amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value))
}

function round(value: number) {
  return Math.round(clamp(value) * 10_000) / 10_000
}

function decodeEntities(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) => {
      const radix = code.toLowerCase().startsWith('x') ? 16 : 10
      const normalized = radix === 16 ? code.slice(1) : code
      const point = Number.parseInt(normalized, radix)
      return Number.isFinite(point)
        && point >= 0
        && point <= 0x10ffff
        && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point)
        : ''
    })
    .replace(/&([a-z]+);/gi, (_match, name: string) => entityMap[name.toLowerCase()] ?? ' ')
}

export function plainText(value: unknown, limit = 8_000) {
  if (typeof value !== 'string') return ''
  return decodeEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function normalizedDate(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function absoluteHttpsUrl(value: unknown, baseUrl: string) {
  if (typeof value !== 'string' || !value.trim()) return baseUrl
  try {
    const url = new URL(value.trim(), baseUrl)
    return url.protocol === 'https:' && isSafeStudyUrl(url.href) ? url.href : baseUrl
  } catch {
    return baseUrl
  }
}

function xmlField(block: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const expression = new RegExp(
      `<(?:[\\w-]+:)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${escaped}>`,
      'i',
    )
    const match = block.match(expression)
    if (match?.[1]) return match[1]
  }
  return ''
}

function xmlLink(block: string) {
  const atomLink = block.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/i)
  return atomLink?.[1] || xmlField(block, ['link', 'guid'])
}

function parseXml(body: string, sourceUrl: string) {
  const itemBlocks = [...body.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1])
  const entryBlocks = itemBlocks.length
    ? []
    : [...body.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((match) => match[1])

  return [...itemBlocks, ...entryBlocks].map((block, index): ParsedStudyItem | null => {
    const rawTitle = xmlField(block, ['title'])
    const rawSummary = xmlField(block, ['summary', 'description', 'content', 'encoded'])
    const title = plainText(rawTitle, 500)
    const excerpt = plainText(rawSummary || rawTitle)
    const summary = plainText(rawSummary || rawTitle, 2_000)
    const url = absoluteHttpsUrl(xmlLink(block), sourceUrl)
    const id = plainText(xmlField(block, ['id', 'guid']), 1_000) || url || `${sourceUrl}#${index}`
    const publishedAt = normalizedDate(xmlField(block, ['published', 'updated', 'pubDate', 'date']))
    if (!summary) return null
    return { id, title: title || summary.slice(0, 160), summary, excerpt, url, publishedAt }
  }).filter((item): item is ParsedStudyItem => item !== null)
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

function parseJson(body: string, sourceUrl: string) {
  const parsed = JSON.parse(body) as unknown
  let records: Array<Record<string, unknown>> = []
  if (Array.isArray(parsed)) {
    records = recordArray(parsed)
  } else if (parsed && typeof parsed === 'object') {
    const root = parsed as Record<string, unknown>
    records = recordArray(root.items)
    if (!records.length) records = recordArray(root.entries)
    if (!records.length) records = recordArray(root.results)
    if (!records.length) records = recordArray(root.data)
    if (!records.length) records = [root]
  }

  return records.map((item, index): ParsedStudyItem | null => {
    const rawTitle = firstString(item.title, item.name, item.headline)
    const rawSummary = firstString(
      item.summary,
      item.content_text,
      item.description,
      item.excerpt,
      item.content_html,
      rawTitle,
    )
    const title = plainText(rawTitle, 500)
    const summary = plainText(rawSummary, 2_000)
    const excerpt = plainText(firstString(item.content_text, item.content_html, item.description, rawSummary))
    const url = absoluteHttpsUrl(firstString(item.url, item.external_url, item.link), sourceUrl)
    const id = firstString(item.id, item.guid, item.uuid) || url || `${sourceUrl}#${index}`
    const publishedAt = normalizedDate(
      item.date_published ?? item.published_at ?? item.published ?? item.updated_at ?? item.date,
    )
    if (!summary) return null
    return { id: String(id), title: title || summary.slice(0, 160), summary, excerpt, url, publishedAt }
  }).filter((item): item is ParsedStudyItem => item !== null)
}

function htmlMeta(body: string, key: string) {
  const tags = body.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const property = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]
    if (property?.toLowerCase() !== key.toLowerCase()) continue
    return tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? ''
  }
  return ''
}

function parseWebpage(body: string, sourceUrl: string): ParsedStudyItem[] {
  const rawTitle = htmlMeta(body, 'og:title')
    || body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
    || ''
  const rawSummary = htmlMeta(body, 'description')
    || htmlMeta(body, 'og:description')
    || body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || body.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]
    || rawTitle
  const title = plainText(rawTitle, 500)
  const summary = plainText(rawSummary, 2_000)
  if (!summary) return []
  const publishedAt = normalizedDate(
    htmlMeta(body, 'article:published_time') || htmlMeta(body, 'date') || htmlMeta(body, 'datePublished'),
  )
  return [{
    id: sourceUrl,
    title: title || summary.slice(0, 160),
    summary,
    excerpt: plainText(rawSummary),
    url: sourceUrl,
    publishedAt,
  }]
}

export function parseStudyDocument(input: {
  body: string
  contentType?: string | null
  sourceType: LearningSourceType
  sourceUrl: string
  maxItems?: number
}): ParsedStudyItem[] {
  const contentType = (input.contentType ?? '').toLowerCase()
  const trimmed = input.body.trim()
  const isJson = input.sourceType === 'json_feed'
    || input.sourceType === 'api'
    || contentType.includes('json')
    || trimmed.startsWith('{')
    || trimmed.startsWith('[')
  const isXml = input.sourceType === 'rss'
    || input.sourceType === 'atom'
    || contentType.includes('xml')
    || /^<\?xml\b/i.test(trimmed)
    || /^<(rss|feed)\b/i.test(trimmed)

  let parsed: ParsedStudyItem[]
  try {
    parsed = isJson ? parseJson(trimmed, input.sourceUrl)
      : isXml ? parseXml(trimmed, input.sourceUrl)
        : parseWebpage(trimmed, input.sourceUrl)
  } catch {
    parsed = isXml ? parseXml(trimmed, input.sourceUrl) : parseWebpage(trimmed, input.sourceUrl)
  }

  const unique = new Map<string, ParsedStudyItem>()
  for (const item of parsed) {
    const key = `${item.id}\u0000${item.title}\u0000${item.summary}`
    if (!unique.has(key)) unique.set(key, item)
  }
  return [...unique.values()].slice(0, clamp(input.maxItems ?? 10, 1, 25))
}

function tokenSet(value: string) {
  const tokens = value.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []
  return new Set(tokens.filter((token) => !STOP_WORDS.has(token)))
}

function overlapRatio(subject: Set<string>, context: Set<string>) {
  if (!context.size) return 0.35
  let shared = 0
  for (const token of subject) if (context.has(token)) shared += 1
  return shared / Math.max(4, Math.min(subject.size, context.size))
}

function publishedRecency(publishedAt: string | null, now: Date) {
  if (!publishedAt) return 0.55
  const timestamp = new Date(publishedAt).getTime()
  if (!Number.isFinite(timestamp)) return 0.55
  const ageMilliseconds = now.getTime() - timestamp
  if (ageMilliseconds < -86_400_000) return 0.4
  const ageDays = Math.max(0, ageMilliseconds) / 86_400_000
  if (ageDays <= 1) return 1
  if (ageDays <= 7) return 0.9
  if (ageDays <= 30) return 0.75
  if (ageDays <= 180) return 0.55
  return 0.35
}

export function learningMateriality(input: Omit<StudyMetrics, 'materiality' | 'whyItMatters'>) {
  const positive = input.relevance * input.impact * input.novelty * input.confidence * input.urgency
  return round(positive - input.noise)
}

export function scoreStudyItem(
  item: ParsedStudyItem,
  context: StudyContext,
  trustWeight: number,
  now = new Date(),
): StudyMetrics {
  const itemText = `${item.title} ${item.summary}`
  const contextText = `${context.projectName} ${context.desiredReality} ${context.currentReality}`
  const itemTokens = tokenSet(itemText)
  const contextTokens = tokenSet(contextText)
  const titleTokens = tokenSet(item.title)
  const overlap = overlapRatio(itemTokens, contextTokens)
  const titleOverlap = overlapRatio(titleTokens, contextTokens)
  const recency = publishedRecency(item.publishedAt, now)
  const impactMatches = [...itemTokens].filter((token) => IMPACT_TERMS.has(token)).length
  const urgencyMatches = [...itemTokens].filter((token) => URGENCY_TERMS.has(token)).length
  const length = item.summary.length
  const lower = itemText.toLowerCase()
  const clickbait = CLICKBAIT_TERMS.some((phrase) => lower.includes(phrase))

  const relevance = round(0.28 + overlap * 1.45 + titleOverlap * 0.35)
  const impact = round(0.38 + overlap * 0.85 + Math.min(impactMatches, 4) * 0.07)
  const novelty = round(0.72 + (item.publishedAt ? 0.1 : 0) + (item.url ? 0.06 : 0))
  const confidence = round(clamp(trustWeight) * (
    0.76 + (item.url ? 0.09 : 0) + (item.title ? 0.08 : 0) + (item.publishedAt ? 0.07 : 0)
  ))
  const urgency = round(0.28 + recency * 0.6 + Math.min(urgencyMatches, 3) * 0.06)
  const noise = round(
    0.015
    + (overlap === 0 ? 0.14 : 0)
    + (length < 60 ? 0.1 : 0)
    + (clickbait ? 0.16 : 0)
    - clamp(trustWeight) * 0.015,
  )

  const matched = [...itemTokens].filter((token) => contextTokens.has(token)).slice(0, 4)
  const whyItMatters = matched.length
    ? `This approved source overlaps the Project World on ${matched.join(', ')} and may change assumptions or the active route.`
    : 'This approved source produced a new finding; it is retained with evidence until its Project World relevance is confirmed.'
  const base = { relevance, impact, novelty, confidence, urgency, noise }
  return { ...base, materiality: learningMateriality(base), whyItMatters }
}

function parseIpv4(hostname: string) {
  const parts = hostname.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null
  const numbers = parts.map(Number)
  return numbers.every((part) => part >= 0 && part <= 255) ? numbers : null
}

function parseIpv6(hostname: string) {
  let value = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!value.includes(':') || value.includes('%')) return null

  if (value.includes('.')) {
    const separator = value.lastIndexOf(':')
    const ipv4 = parseIpv4(value.slice(separator + 1))
    if (!ipv4) return null
    value = `${value.slice(0, separator)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`
  }
  if (!/^[0-9a-f:]+$/.test(value) || value.indexOf('::') !== value.lastIndexOf('::')) return null

  const compressed = value.includes('::')
  const [left = '', right = ''] = value.split('::')
  const leftGroups = left ? left.split(':') : []
  const rightGroups = right ? right.split(':') : []
  const missing = 8 - leftGroups.length - rightGroups.length
  if ((!compressed && missing !== 0) || (compressed && missing < 1)) return null

  const groups = [
    ...leftGroups,
    ...Array.from({ length: missing }, () => '0'),
    ...rightGroups,
  ].map((group) => Number.parseInt(group, 16))
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? groups
    : null
}

export function isPrivateNetworkAddress(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  const ipv4 = parseIpv4(host)
  if (ipv4) {
    const [a, b] = ipv4
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && ipv4[2] === 100)))
      || (a === 203 && b === 0 && ipv4[2] === 113)
  }

  if (!host.includes(':')) return false
  const ipv6 = parseIpv6(host)
  if (!ipv6) return true
  const [first, second] = ipv6
  return ipv6.every((group) => group === 0)
    || ipv6.slice(0, 7).every((group) => group === 0)
    || ipv6.slice(0, 5).every((group) => group === 0)
    || (first & 0xfe00) === 0xfc00
    || (first & 0xffc0) === 0xfe80
    || (first & 0xffc0) === 0xfec0
    || (first & 0xff00) === 0xff00
    || (first === 0x0064 && second === 0xff9b)
    || first === 0x2002
    || (first === 0x2001 && (second === 0x0000 || second === 0x0002 || second === 0x000d || second === 0x0db8))
}

export function isSafeStudyUrl(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (url.protocol !== 'https:' || url.username || url.password || !host) return false
    if (isPrivateNetworkAddress(host)) return false
    if (host === 'localhost' || host === 'metadata.google.internal' || host === '169.254.169.254') return false
    if (/\.(localhost|local|internal|home|lan|test|invalid)$/.test(host)) return false
    return true
  } catch {
    return false
  }
}
