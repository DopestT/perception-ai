import { supabase } from './perception-backend'

export type PerceptionSourceType =
  | 'github_repo'
  | 'vercel_project'
  | 'supabase_project'
  | 'railway_service'
  | 'notion_page'
  | 'drive_file'
  | 'gmail_thread'
  | 'website'
  | 'api'
  | 'manual'
  | 'other'

export type PerceptionSyncMode = 'manual' | 'poll' | 'webhook' | 'push'

export interface ProjectSourceInput {
  provider: string
  source_type: PerceptionSourceType
  external_id: string
  label?: string
  locator?: string | null
  sync_mode?: PerceptionSyncMode
  metadata?: Record<string, unknown>
}

export interface ProjectObservationInput {
  kind: string
  external_version?: string | null
  summary?: string
  payload?: Record<string, unknown> | unknown[]
  source_ref?: string | null
  observed_at?: string
}

export interface ProjectIngestResult {
  ok: boolean
  source_id: string
  observation_id: string
  inserted: boolean
  project_id: string | null
}

export interface ProjectSourceRecord {
  id: string
  source_type: PerceptionSourceType
  provider: string
  external_id: string
  label: string
  locator: string | null
  enabled: boolean
  sync_mode: PerceptionSyncMode
  trust_weight: number
  freshness_sla_minutes: number
  last_cursor: string | null
  last_observed_at: string | null
  last_synced_at: string | null
  last_error: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

function requireBackend() {
  if (!supabase) throw new Error('Perception backend is not configured.')
  return supabase
}

export async function ingestProjectObservation(
  projectId: string | null,
  source: ProjectSourceInput,
  observation: ProjectObservationInput,
): Promise<ProjectIngestResult> {
  const client = requireBackend()
  const { data, error } = await client.functions.invoke<ProjectIngestResult>('project-ingest', {
    body: {
      project_id: projectId,
      source,
      observation,
    },
  })

  if (error) throw error
  if (!data?.ok) throw new Error('Perception ingestion returned no usable result.')
  return data
}

export async function listDiscoveredSources(): Promise<ProjectSourceRecord[]> {
  const client = requireBackend()
  const { data, error } = await client
    .from('perception_sources')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as ProjectSourceRecord[]
}
