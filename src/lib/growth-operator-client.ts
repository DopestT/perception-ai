import { supabase } from './perception-backend'

export type GrowthSite = {
  id: string
  project_id: string
  site_url: string
  repository: string | null
  primary_goal: string
  conversion_event: string
  publishing_mode: 'draft' | 'approval' | 'autopilot'
  enabled: boolean
}

export type GrowthRun = {
  id: string
  status: 'running' | 'succeeded' | 'partial' | 'failed'
  pages_discovered: number
  pages_scanned: number
  baseline: Record<string, unknown>
  started_at: string
  finished_at: string | null
  error: string | null
}

export type GrowthOpportunity = {
  id: string
  opportunity_key: string
  kind: string
  target_url: string
  target_path: string
  title: string
  rationale: string
  score: number
  status: 'proposed' | 'queued' | 'in_progress' | 'verified' | 'dismissed' | 'failed'
  bounded_job: Record<string, unknown>
}

export type GrowthDashboard = {
  site: GrowthSite | null
  latest_run: GrowthRun | null
  opportunities: GrowthOpportunity[]
}

function client() {
  if (!supabase) throw new Error('Perception backend is not configured.')
  return supabase
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().functions.invoke<T>('growth-operator', { body })
  if (error) throw error
  if (!data) throw new Error('Growth Operator returned no data.')
  const payload = data as T & { error?: string }
  if (payload.error) throw new Error(payload.error)
  return payload
}

export async function getGrowthDashboard(projectId: string) {
  const result = await invoke<{ ok: boolean; dashboard: GrowthDashboard }>({
    action: 'status',
    project_id: projectId,
  })
  return result.dashboard
}

export async function configureGrowthSite(input: {
  projectId: string
  siteUrl: string
  repository: string
  primaryGoal: string
  conversionEvent: string
  publishingMode?: 'draft' | 'approval' | 'autopilot'
}) {
  const result = await invoke<{ ok: boolean; site: GrowthSite }>({
    action: 'configure',
    project_id: input.projectId,
    site_url: input.siteUrl,
    repository: input.repository,
    primary_goal: input.primaryGoal,
    conversion_event: input.conversionEvent,
    publishing_mode: input.publishingMode ?? 'approval',
  })
  return result.site
}

export async function scanGrowthSite(projectId: string, maxPages = 24) {
  return invoke<{
    ok: boolean
    run_id: string
    baseline: Record<string, unknown>
    top_opportunities: GrowthOpportunity[]
  }>({
    action: 'scan',
    project_id: projectId,
    max_pages: maxPages,
    trigger: 'ui',
  })
}

export async function queueTopGrowthOpportunities(projectId: string, limit = 10) {
  return invoke<{ ok: boolean; queued: GrowthOpportunity[] }>({
    action: 'queue_top',
    project_id: projectId,
    limit,
  })
}
