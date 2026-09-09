import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Gauge, RefreshCw, ShieldCheck } from 'lucide-react'
import { supabase } from './lib/perception-backend'
import './token-efficiency.css'

type WindowStats = {
  input_tokens: number | string
  cached_input_tokens: number | string
  output_tokens: number | string
  reasoning_tokens?: number | string
  estimated_cost_usd: number | string
  baseline_cost_usd?: number | string
  saved_cost_usd: number | string
  cache_ratio?: number | string
  requests: number | string
}

type TokenDecision = {
  capability: string
  budget_tier: 'tiny' | 'normal' | 'deep' | 'max'
  model_lane: 'economy' | 'balanced' | 'deep'
  max_context_tokens: number
  max_output_tokens: number
  estimated_input_tokens: number
  reasons: string[]
  created_at: string
}

type TokenDashboard = {
  automatic_cost_control: boolean
  policy: {
    enabled: boolean
    default_tier: string
    daily_budget_usd: number | null
    lane_overrides: Record<string, string>
  }
  today: WindowStats
  last_7_days: WindowStats
  latest_decision: TokenDecision | null
  top_consumers: Array<{
    capability: string
    model: string
    requests: number
    tokens: number | string
    estimated_cost_usd: number | string
  }>
  generated_at: string
}

const numberValue = (value: number | string | undefined) => Number(value ?? 0)

function compactNumber(value: number | string | undefined) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(numberValue(value))
}

function money(value: number | string | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(numberValue(value))
}

export function TokenEfficiencyPanel() {
  const [dashboard, setDashboard] = useState<TokenDashboard | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  const loadDashboard = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    setError('')
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const session = sessionData.session
      if (!session) {
        setUserId(null)
        setProjectId(null)
        setDashboard(null)
        return
      }
      setUserId(session.user.id)

      const { data: project, error: projectError } = await supabase
        .from('perception_projects')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (projectError) throw projectError

      const nextProjectId = project?.id ?? null
      setProjectId(nextProjectId)
      if (!nextProjectId) {
        setDashboard(null)
        return
      }

      const { data, error: dashboardError } = await supabase.rpc('perception_get_token_dashboard', {
        p_project_id: nextProjectId,
      })
      if (dashboardError) throw dashboardError
      setDashboard(data as TokenDashboard)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Token controls are temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
    if (!supabase) return

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void loadDashboard()
    })
    const interval = window.setInterval(() => void loadDashboard(), 30_000)

    return () => {
      authListener.subscription.unsubscribe()
      window.clearInterval(interval)
    }
  }, [loadDashboard])

  const setAutomaticControl = async (enabled: boolean) => {
    if (!supabase || !userId || updating) return
    setUpdating(true)
    setError('')
    try {
      const { data: existing, error: readError } = await supabase
        .from('perception_token_policies')
        .select('id')
        .eq('user_id', userId)
        .is('project_id', null)
        .maybeSingle()
      if (readError) throw readError

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('perception_token_policies')
          .update({ enabled, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from('perception_token_policies').insert({
          user_id: userId,
          project_id: null,
          enabled,
          default_tier: 'normal',
        })
        if (insertError) throw insertError
      }

      await loadDashboard()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update automatic cost control.')
    } finally {
      setUpdating(false)
    }
  }

  if (!userId || (!dashboard && !error)) return null

  const today = dashboard?.today
  const week = dashboard?.last_7_days
  const decision = dashboard?.latest_decision
  const enabled = dashboard?.automatic_cost_control ?? true

  return (
    <aside className={expanded ? 'token-panel token-panel--expanded' : 'token-panel'} aria-label="Token efficiency controls">
      <div className="token-panel__header">
        <button className="token-panel__title" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          <span className="token-panel__icon"><Gauge size={16} /></span>
          <span>
            <strong>TOKEN CONTROL</strong>
            <small>{enabled ? 'AUTOMATIC · ON' : 'AUTOMATIC · OFF'}</small>
          </span>
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="token-panel__body">
          <div className="token-panel__switch-row">
            <span><ShieldCheck size={15} /> Automatic cost control</span>
            <button
              type="button"
              className={enabled ? 'token-switch token-switch--on' : 'token-switch'}
              onClick={() => void setAutomaticControl(!enabled)}
              disabled={updating}
              aria-pressed={enabled}
            >
              <span />
            </button>
          </div>

          <div className="token-panel__metrics">
            <div><small>TODAY</small><strong>{money(today?.estimated_cost_usd)}</strong><span>{compactNumber(numberValue(today?.input_tokens) + numberValue(today?.output_tokens))} tokens</span></div>
            <div><small>7 DAYS</small><strong>{money(week?.estimated_cost_usd)}</strong><span>{compactNumber(week?.requests)} requests</span></div>
            <div><small>CACHE</small><strong>{Math.round(numberValue(today?.cache_ratio) * 100)}%</strong><span>input reused</span></div>
            <div><small>SAVED</small><strong>{money(week?.saved_cost_usd)}</strong><span>vs baseline</span></div>
          </div>

          <div className="token-panel__decision">
            <small>LATEST ROUTING DECISION</small>
            {decision ? (
              <>
                <div className="token-panel__badges">
                  <span>{decision.budget_tier.toUpperCase()}</span>
                  <span>{decision.model_lane.toUpperCase()}</span>
                </div>
                <p>{compactNumber(decision.max_context_tokens)} context · {compactNumber(decision.max_output_tokens)} output max</p>
              </>
            ) : (
              <p>No governed request recorded yet.</p>
            )}
          </div>

          {dashboard?.top_consumers?.length ? (
            <div className="token-panel__consumers">
              <small>TOP CONSUMERS · 7 DAYS</small>
              {dashboard.top_consumers.slice(0, 3).map((consumer) => (
                <div key={`${consumer.capability}:${consumer.model}`}>
                  <span>{consumer.capability} · {consumer.model}</span>
                  <strong>{money(consumer.estimated_cost_usd)}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {error && <p className="token-panel__error">{error}</p>}
          <button className="token-panel__refresh" type="button" onClick={() => void loadDashboard()} disabled={loading}>
            <RefreshCw size={13} /> {loading ? 'REFRESHING' : 'REFRESH'}
          </button>
          <small className="token-panel__project">Project {projectId?.slice(0, 8)}</small>
        </div>
      )}
    </aside>
  )
}
