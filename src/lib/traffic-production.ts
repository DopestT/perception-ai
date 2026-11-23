import type { GrowthDashboard, GrowthOpportunity } from './growth-operator-client'

export type TrafficDraft = {
  id: string
  channel: 'search' | 'short_video' | 'community'
  label: string
  title: string
  evidenceUrl: string
  destination: string
  hook: string
  assetBrief: string
  copy: string
  conversionEvent: string
  opportunityScore: number
  status: 'review_only'
}
export type TrafficPack = {
  status: 'needs_site' | 'project_mismatch' | 'needs_scan' | 'no_evidence' | 'review_ready'
  message: string
  drafts: TrafficDraft[]
}

function safeDestination(siteUrl: string, targetUrl: string): URL | null {
  try {
    const site = new URL(siteUrl)
    const target = new URL(targetUrl)
    if (site.protocol !== 'https:' || target.protocol !== 'https:') return null
    if (target.host !== site.host || target.username || target.password) return null
    target.hash = ''
    return target
  } catch {
    return null
  }
}

function makeLink(target: URL, channel: TrafficDraft['channel'], key: string) {
  const url = new URL(target)
  if (channel === 'search') return url.href
  url.searchParams.set('utm_source', 'traffic_production_manual')
  url.searchParams.set('utm_medium', channel)
  url.searchParams.set('utm_campaign', key.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64))
  return url.href
}

function draftContent(channel: TrafficDraft['channel'], gap: GrowthOpportunity, link: string) {
  const observation = gap.rationale.trim()
  if (channel === 'search') return {
    hook: 'Answer a real customer question: ' + gap.title,
    assetBrief: 'Validate a real question, write an original answer, provide a tested example and cite sources. Never mass-generate duplicate SEO pages.',
    copy: [
      'WORKING TITLE: ' + gap.title,
      'USER QUESTION: [Verify using Search Console or first-party feedback]',
      'OBSERVED SITE GAP: ' + observation,
      'ORIGINAL EXAMPLE: [Document a real demonstration]',
      'NEXT STEP: ' + link,
    ].join('\n'),
  }
  if (channel === 'short_video') return {
    hook: 'Show a practical result: ' + gap.title,
    assetBrief: 'Record a 20–40 second genuine demonstration. Show the actual before-state and an outcome only after checking it. Add captions and an accurate CTA.',
    copy: [
      'HOOK: ' + gap.title,
      'SHOW: ' + observation,
      'DEMONSTRATE: [Film a real example]',
      'PROOF: [Insert verified result; never invent metrics or testimonials]',
      'NEXT STEP: ' + link,
    ].join('\n'),
  }
  return {
    hook: 'Answer an existing community question about ' + gap.title,
    assetBrief: 'Find a real relevant question, answer helpfully before including a link, and comply with community rules. No bulk unsolicited posts.',
    copy: [
      'QUESTION: [Link to an actual relevant thread]',
      'HELPFUL CHECK: ' + observation,
      'PERSONAL EXAMPLE: [Use a verifiable example]',
      'OPTIONAL RESOURCE IF ALLOWED: ' + link,
      'FOLLOW-UP: What part is unclear?',
    ].join('\n'),
  }
}

export function buildTrafficPack(projectId: string, dashboard: GrowthDashboard | null): TrafficPack {
  if (!dashboard?.site) return {
    status: 'needs_site', message: 'Connect one owned site to this Project World first.', drafts: [],
  }
  const site = dashboard.site
  if (site.project_id !== projectId) return {
    status: 'project_mismatch', message: 'Project isolation failed; no drafts generated.', drafts: [],
  }
  if (!dashboard.latest_run || !['succeeded', 'partial'].includes(dashboard.latest_run.status)) return {
    status: 'needs_scan',
    message: 'Run the existing safe site scan. Configuration alone is not evidence of demand or traffic.',
    drafts: [],
  }
  const observed = dashboard.opportunities
    .filter(gap => gap.status === 'proposed' && Boolean(safeDestination(site.site_url, gap.target_url)))
    .sort((a, b) => b.score - a.score)
  if (!observed.length) return {
    status: 'no_evidence', message: 'No open same-site opportunity. Do not manufacture a content backlog.', drafts: [],
  }
  const channels = [
    { channel: 'search', label: 'Search answer' },
    { channel: 'short_video', label: 'Short-form demo' },
    { channel: 'community', label: 'Community answer' },
  ] as const
  const drafts: TrafficDraft[] = channels.map((item, index) => {
    const gap = observed[index % observed.length]
    const target = safeDestination(site.site_url, gap.target_url)!
    const destination = makeLink(target, item.channel, gap.opportunity_key)
    const content = draftContent(item.channel, gap, destination)
    return {
      id: item.channel + ':' + gap.opportunity_key,
      channel: item.channel,
      label: item.label,
      title: gap.title,
      evidenceUrl: target.href,
      destination,
      hook: content.hook,
      assetBrief: content.assetBrief,
      copy: content.copy,
      conversionEvent: site.conversion_event || 'unverified_conversion',
      opportunityScore: gap.score,
      status: 'review_only',
    }
  })
  return {
    status: 'review_ready',
    message: 'Three grounded campaign drafts. Scores measure observed site gaps, not market demand or expected visitors. Each needs original proof, channel approval, audience checks and actual conversion measurement.',
    drafts,
  }
}
