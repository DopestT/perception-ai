import { createClient, type Session } from '@supabase/supabase-js'

export const PERCEPTION_SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://zxmdfmiueapjhktqchts.supabase.co'

// Supabase publishable keys are intentionally browser-safe and remain RLS-scoped.
// Deployment environments can override this canonical key without changing source.
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gwuUH36fdhOFrNZH7gUuKQ_XaV9iHBg'

export const backendConfigured = Boolean(PERCEPTION_SUPABASE_URL && publishableKey)

export const supabase = backendConfigured
  ? createClient(PERCEPTION_SUPABASE_URL, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export type ProjectWorld = {
  project: {
    id: string
    name: string
    desired_reality: string | null
    current_reality: string | null
    active: boolean
    created_at: string
    updated_at: string
  }
  beliefs: Array<{
    id: string
    statement: string
    state: 'observed' | 'inferred' | 'confirmed' | 'unknown' | 'rejected' | 'stale'
    confidence: number
    route_impact: string
    created_at: string
  }>
  objectives: Array<{
    id: string
    statement: string
    status: string
    current_reality: string
    desired_reality: string
    created_at: string
  }>
  routes: Array<{
    id: string
    reason: string
    active: boolean
    version: number
    created_at: string
  }>
  route_nodes: Array<{
    id: string
    label: string
    outcome: string
    status: string
    capability: string
    permission_level: string
    confidence: number
    risk: string
    sort_order: number
  }>
  worker_runs: Array<{
    id: string
    worker_key: string
    capability: string
    permission_level: string
    status: string
    evidence: unknown[]
    started_at: string | null
    finished_at: string | null
  }>
  artifacts: Array<{
    id: string
    title: string
    artifact_type: string
    content: string | null
    metadata: Record<string, unknown>
    created_at: string
  }>
  verifications: Array<{
    id: string
    passed: boolean
    evidence: string[]
    details: Record<string, unknown>
    checked_at: string
  }>
  events: Array<{
    id: string
    event_type: string
    payload: Record<string, unknown>
    created_at: string
  }>
}

export type ObjectiveRuntimeResult = {
  ok: boolean
  stages?: string[]
  project_id?: string
  objective_id?: string
  route_id?: string
  worker_run_id?: string
  artifact_id?: string
  verification_id?: string
  stage?: string
}

function requireBackend() {
  if (!supabase) {
    throw new Error('Perception backend is not configured.')
  }
  return supabase
}

export async function getSession(): Promise<Session | null> {
  const client = requireBackend()
  const { data, error } = await client.auth.getSession()
  if (error) throw error
  return data.session
}

export async function requestEmailSignIn(email: string): Promise<void> {
  const client = requireBackend()
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined
  const { error } = await client.auth.signInWithOtp({
    email,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const client = requireBackend()
  const { error } = await client.auth.signOut()
  if (error) throw error
}

export async function submitObjective(statement: string): Promise<ObjectiveRuntimeResult> {
  const client = requireBackend()
  const { data, error } = await client.functions.invoke<ObjectiveRuntimeResult>('perceive-objective', {
    body: { statement },
  })
  if (error) throw error
  if (!data) throw new Error('Perception runtime returned no result.')
  return data
}

export async function getProjectWorld(projectId: string): Promise<ProjectWorld> {
  const client = requireBackend()
  const { data, error } = await client.rpc('perception_get_project_world', {
    p_project_id: projectId,
  })
  if (error) throw error
  if (!data) throw new Error('Project World was not returned.')
  return data as ProjectWorld
}

export async function getLatestProjectWorld(): Promise<ProjectWorld | null> {
  const client = requireBackend()
  const { data, error } = await client
    .from('perception_projects')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.id ? getProjectWorld(data.id) : null
}
