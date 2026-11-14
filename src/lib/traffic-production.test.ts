import { describe, expect, it } from 'vitest'
import { buildTrafficPack } from './traffic-production'
import type { GrowthDashboard } from './growth-operator-client'

const dashboard: GrowthDashboard = {
  site: {
    id: 's1', project_id: 'project-a', site_url: 'https://example.com/',
    repository: 'owner/example', primary_goal: 'Help beginners', conversion_event: 'verified_signup',
    publishing_mode: 'approval', enabled: true,
  },
  latest_run: {
    id: 'run1', status: 'succeeded', pages_discovered: 1, pages_scanned: 1,
    baseline: {}, started_at: '2026-11-13T00:00:00Z',
    finished_at: '2026-11-13T00:01:00Z', error: null,
  },
  opportunities: [{
    id: 'g1', opportunity_key: 'gap:signup', kind: 'missing_conversion_path',
    target_url: 'https://example.com/guide', target_path: '/guide',
    title: 'Clear next step', rationale: 'No conversion CTA detected.',
    score: 76, status: 'proposed', bounded_job: {},
  }],
}
describe('isolated Traffic Production Machine', () => {
  it('does not assume a baseline exists', () => {
    expect(buildTrafficPack('project-a', { ...dashboard, latest_run: null }).status).toBe('needs_scan')
  })
  it('refuses to mix Project Worlds', () => {
    const result = buildTrafficPack('project-b', dashboard)
    expect(result.status).toBe('project_mismatch')
    expect(result.drafts).toEqual([])
  })
  it('rejects another project website as destination', () => {
    const result = buildTrafficPack('project-a', {
      ...dashboard,
      opportunities: [{ ...dashboard.opportunities[0], target_url: 'https://other.example/guide' }],
    })
    expect(result.status).toBe('no_evidence')
  })
  it('makes three different approval-first drafts with actual source evidence', () => {
    const pack = buildTrafficPack('project-a', dashboard)
    expect(pack.drafts.map(d => d.channel)).toEqual(['search', 'short_video', 'community'])
    expect(pack.drafts.every(d => d.status === 'review_only')).toBe(true)
    expect(pack.drafts.every(d => d.conversionEvent === 'verified_signup')).toBe(true)
    expect(pack.drafts.every(d => d.evidenceUrl === 'https://example.com/guide')).toBe(true)
  })
  it('uses UTMs only on offsite distribution drafts, not search pages', () => {
    const pack = buildTrafficPack('project-a', dashboard)
    expect(pack.drafts[0].destination).toBe('https://example.com/guide')
    expect(pack.drafts[1].destination).toContain('utm_medium=short_video')
    expect(pack.drafts[2].destination).toContain('utm_medium=community')
  })
})
