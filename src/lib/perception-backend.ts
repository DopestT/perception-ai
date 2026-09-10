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

export type ForecastEvidence = {
  label?: string
  source?: string
  score?: number
  [key: string]: unknown
}

export type Forecast = {
  id: string
  user_id: string
  project_id: string
  question: string
  deadline: string
  original_probability: number
  current_probability: number
  confidence: 'low' | 'medium' | 'high'
  trend: 'down' | 'steady' | 'up'
  supporting_evidence: ForecastEvidence[]
  contradicting_evidence: ForecastEvidence[]
  watch_signals: ForecastEvidence[]
  model_breakdown: Record<string, unknown>
  status: 'open' | 'resolved' | 'cancelled'
  outcome: boolean | null
  brier_score: number | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type ForecastCalibration = {
  resolved_count: number
  mean_brier_score: number | null
  best_possible: number
  worst_possible: number
}

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
  forecasts?: Forecast[]
  forecast_versions?: Array<{
    id: string
    forecast_id: string
    version: number
    probability: number
    confidence: 'low' | 'medium' | 'high'
    trend: 'down' | 'steady' | 'up'
    rationale: string
    created_at: string
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

type ForecastRuntimeResult = {
  ok: boolean
  project_id?: string
  forecast: Forecast
  version?: number
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
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/?auth=return` : undefined
  const { error } = await client.auth.signInWithOtp({
    email,
    options: redirectTo ? { emailRedirectTo: redirectTo, shouldCreateUser: true } : { shouldCreateUser: true },
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

export async function createForecast(question: string, deadline: string, probability = 0.5): Promise<ForecastRuntimeResult> {
  const client = requireBackend()
  const { data, error } = await client.rpc('perception_create_forecast', {
    p_question: question,
    p_deadline: deadline,
    p_probability: probability,
  })
  if (error) throw error
  if (!data) throw new Error('Forecast runtime returned no result.')
  return data as ForecastRuntimeResult
}

export async function resolveForecast(forecastId: string, outcome: boolean): Promise<ForecastRuntimeResult> {
  const client = requireBackend()
  const { data, error } = await client.rpc('perception_resolve_forecast', {
    p_forecast_id: forecastId,
    p_outcome: outcome,
  })
  if (error) throw error
  if (!data) throw new Error('Forecast resolution returned no result.')
  return data as ForecastRuntimeResult
}

export async function getLatestForecast(): Promise<Forecast | null> {
  const client = requireBackend()
  const { data, error } = await client
    .from('perception_forecasts')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? (data as Forecast) : null
}

export async function getForecastCalibration(): Promise<ForecastCalibration> {
  const client = requireBackend()
  const { data, error } = await client.rpc('perception_forecast_calibration')
  if (error) throw error
  return (data || { resolved_count: 0, mean_brier_score: null, best_possible: 0, worst_possible: 1 }) as ForecastCalibration
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
