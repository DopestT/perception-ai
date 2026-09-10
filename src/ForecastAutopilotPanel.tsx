import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, CheckCircle2, Clock3, Power, ShieldCheck, X } from 'lucide-react'
import { supabase, type Forecast } from './lib/perception-backend'
import './forecast-autopilot.css'

type ForecastVersion = {
  id: string
  version: number
  probability: number
  confidence: 'low' | 'medium' | 'high'
  trend: 'down' | 'steady' | 'up'
  rationale: string
  created_at: string
}

type ResolutionProposal = {
  id: string
  proposed_outcome: boolean
  provider: string
  source_ref: string | null
  match_score: number
  confidence: number
  rationale: string
  status: 'pending' | 'accepted' | 'rejected' | 'superseded'
  proposed_at: string
  last_seen_at: string
}

type AutopilotForecast = Forecast & {
  autopilot_enabled?: boolean
  last_autopilot_at?: string | null
  next_autopilot_at?: string | null
  autopilot_failures?: number
  autopilot_last_error?: string | null
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

function timeLabel(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function chartPoints(history: ForecastVersion[]) {
  if (!history.length) return ''
  const width = 640
  const height = 148
  const padX = 8
  const padY = 12
  const spanX = width - padX * 2
  const spanY = height - padY * 2
  return history.map((item, index) => {
    const x = history.length === 1 ? width / 2 : padX + (index / (history.length - 1)) * spanX
    const y = padY + (1 - item.probability) * spanY
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

export function ForecastAutopilotPanel({
  forecast,
  resolving,
  onResolve,
}: {
  forecast: Forecast
  resolving: boolean
  onResolve: (outcome: boolean) => void
}) {
  const autopilotForecast = forecast as AutopilotForecast
  const [history, setHistory] = useState<ForecastVersion[]>([])
  const [proposal, setProposal] = useState<ResolutionProposal | null>(null)
  const [autopilotEnabled, setAutopilotEnabled] = useState(autopilotForecast.autopilot_enabled ?? true)
  const [nextRun, setNextRun] = useState<string | null>(autopilotForecast.next_autopilot_at ?? null)
  const [lastRun, setLastRun] = useState<string | null>(autopilotForecast.last_autopilot_at ?? null)
  const [failures, setFailures] = useState(autopilotForecast.autopilot_failures ?? 0)
  const [lastError, setLastError] = useState<string | null>(autopilotForecast.autopilot_last_error ?? null)
  const [loading, setLoading] = useState(true)
  const [toggleBusy, setToggleBusy] = useState(false)
  const [dismissBusy, setDismissBusy] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    try {
      const [versionsResult, proposalResult, forecastResult] = await Promise.all([
        supabase
          .from('perception_forecast_versions')
          .select('id,version,probability,confidence,trend,rationale,created_at')
          .eq('forecast_id', forecast.id)
          .order('version', { ascending: true })
          .limit(120),
        supabase
          .from('perception_forecast_resolution_proposals')
          .select('id,proposed_outcome,provider,source_ref,match_score,confidence,rationale,status,proposed_at,last_seen_at')
          .eq('forecast_id', forecast.id)
          .eq('status', 'pending')
          .order('proposed_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('perception_forecasts')
          .select('autopilot_enabled,last_autopilot_at,next_autopilot_at,autopilot_failures,autopilot_last_error')
          .eq('id', forecast.id)
          .maybeSingle(),
      ])

      if (!versionsResult.error) setHistory((versionsResult.data ?? []) as ForecastVersion[])
      if (!proposalResult.error) setProposal(proposalResult.data as ResolutionProposal | null)
      if (!forecastResult.error && forecastResult.data) {
        setAutopilotEnabled(Boolean(forecastResult.data.autopilot_enabled))
        setLastRun(forecastResult.data.last_autopilot_at ?? null)
        setNextRun(forecastResult.data.next_autopilot_at ?? null)
        setFailures(Number(forecastResult.data.autopilot_failures ?? 0))
        setLastError(forecastResult.data.autopilot_last_error ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [forecast.id])

  useEffect(() => {
    void load()
  }, [load, forecast.updated_at, forecast.status])

  const movement = useMemo(() => {
    if (history.length < 2) return 0
    return history.at(-1)!.probability - history[0].probability
  }, [history])

  const points = useMemo(() => chartPoints(history), [history])

  const toggleAutopilot = async () => {
    if (!supabase || toggleBusy || forecast.status !== 'open') return
    const enabled = !autopilotEnabled
    setToggleBusy(true)
    try {
      const { data, error } = await supabase.rpc('perception_set_forecast_autopilot', {
        p_forecast_id: forecast.id,
        p_enabled: enabled,
      })
      if (error) throw error
      const updated = data && typeof data === 'object' && 'forecast' in data
        ? (data as { forecast?: AutopilotForecast }).forecast
        : null
      setAutopilotEnabled(enabled)
      setNextRun(updated?.next_autopilot_at ?? (enabled ? new Date().toISOString() : null))
      setLastError(null)
    } catch (cause) {
      console.warn('Could not change forecast autopilot.', cause)
    } finally {
      setToggleBusy(false)
    }
  }

  const dismissProposal = async () => {
    if (!supabase || !proposal || dismissBusy) return
    setDismissBusy(true)
    try {
      const { error } = await supabase.rpc('perception_review_forecast_resolution', {
        p_proposal_id: proposal.id,
        p_decision: 'rejected',
      })
      if (error) throw error
      setProposal(null)
    } catch (cause) {
      console.warn('Could not dismiss forecast resolution proposal.', cause)
    } finally {
      setDismissBusy(false)
    }
  }

  return (
    <div className="forecast-autopilot-shell">
      <div className="forecast-autopilot-head">
        <div>
          <p className="card-label"><Activity size={13} /> FORECAST AUTOPILOT</p>
          <h3>{autopilotEnabled ? 'Watching what changes.' : 'Autopilot paused.'}</h3>
          <p>Adaptive background refresh keeps the forecast current without rewriting earlier probabilities.</p>
        </div>
        {forecast.status === 'open' && (
          <button
            className={autopilotEnabled ? 'forecast-autopilot-toggle forecast-autopilot-toggle--on' : 'forecast-autopilot-toggle'}
            type="button"
            aria-pressed={autopilotEnabled}
            disabled={toggleBusy}
            onClick={toggleAutopilot}
          >
            <Power size={14} /> {toggleBusy ? 'UPDATING…' : autopilotEnabled ? 'AUTOPILOT ON' : 'AUTOPILOT OFF'}
          </button>
        )}
      </div>

      <div className="forecast-autopilot-stats">
        <div><span>LAST CHECK</span><strong>{timeLabel(lastRun)}</strong></div>
        <div><span>NEXT CHECK</span><strong>{autopilotEnabled && forecast.status === 'open' ? timeLabel(nextRun) : '—'}</strong></div>
        <div><span>VERSIONS</span><strong>{history.length || (loading ? '…' : '0')}</strong></div>
        <div><span>MOVEMENT</span><strong>{movement === 0 ? '0 pts' : `${movement > 0 ? '+' : ''}${Math.round(movement * 100)} pts`}</strong></div>
      </div>

      {history.length > 0 && (
        <div className="forecast-history-card">
          <div className="forecast-history-head">
            <div>
              <p className="card-label">PROBABILITY HISTORY</p>
              <strong>{pct(history[0].probability)} → {pct(history.at(-1)!.probability)}</strong>
            </div>
            <span>append-only</span>
          </div>
          <svg className="forecast-history-chart" viewBox="0 0 640 148" role="img" aria-label="Forecast probability history">
            <line x1="8" y1="74" x2="632" y2="74" className="forecast-history-midline" />
            <polyline points={points} className="forecast-history-line" />
            {history.length === 1 && <circle cx="320" cy={(12 + (1 - history[0].probability) * 124).toFixed(1)} r="5" className="forecast-history-dot" />}
          </svg>
          <div className="forecast-history-foot">
            <span>{timeLabel(history[0].created_at)}</span>
            <span>{timeLabel(history.at(-1)!.created_at)}</span>
          </div>
        </div>
      )}

      {proposal && forecast.status === 'open' && (
        <div className="forecast-resolution-proposal">
          <div className="forecast-resolution-proposal-icon"><ShieldCheck size={18} /></div>
          <div>
            <p className="card-label">RESOLUTION CANDIDATE</p>
            <h3>{proposal.proposed_outcome ? 'YES' : 'NO'} · {pct(proposal.confidence)} source confidence</h3>
            <p>{proposal.rationale}</p>
            <small>{proposal.provider} · match {pct(proposal.match_score)} · detected {timeLabel(proposal.proposed_at)}</small>
          </div>
          <div className="forecast-resolution-proposal-actions">
            <button type="button" disabled={resolving} onClick={() => onResolve(proposal.proposed_outcome)}>
              <CheckCircle2 size={14} /> CONFIRM {proposal.proposed_outcome ? 'YES' : 'NO'}
            </button>
            <button type="button" disabled={dismissBusy || resolving} onClick={dismissProposal}>
              <X size={14} /> {dismissBusy ? 'DISMISSING…' : 'DISMISS'}
            </button>
          </div>
        </div>
      )}

      {(failures > 0 || lastError) && forecast.status === 'open' && (
        <div className="forecast-autopilot-warning">
          <Clock3 size={14} />
          <span>Autopilot source check failed {failures} time{failures === 1 ? '' : 's'}. It will retry with backoff.{lastError ? ` Last error: ${lastError}` : ''}</span>
        </div>
      )}
    </div>
  )
}
