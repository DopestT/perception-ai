import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, BrainCircuit, CheckCircle2, CircleDot, Link2, Scale } from 'lucide-react'
import { ForecastAutopilotPanel } from './ForecastAutopilotPanel'
import { ForecastSelfCalibrationPanel } from './ForecastSelfCalibrationPanel'
import type { Forecast, ForecastCalibration, ForecastModelState } from './lib/perception-backend'
import './forecast.css'

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

function dateLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function TrendIcon({ trend }: { trend: Forecast['trend'] }) {
  if (trend === 'up') return <ArrowUp size={15} />
  if (trend === 'down') return <ArrowDown size={15} />
  return <ArrowRight size={15} />
}

function modelState(value: unknown): ForecastModelState | null {
  return value && typeof value === 'object' ? value as ForecastModelState : null
}

export function ForecastPanel({
  forecast,
  calibration,
  resolving,
  attachingMarket,
  runningIntelligence,
  marketNote,
  intelligenceNote,
  onResolve,
  onAttachMarket,
  onRunIntelligence,
}: {
  forecast: Forecast
  calibration: ForecastCalibration | null
  resolving: boolean
  attachingMarket: boolean
  runningIntelligence: boolean
  marketNote?: string
  intelligenceNote?: string
  onResolve: (outcome: boolean) => void
  onAttachMarket: (ticker: string) => void
  onRunIntelligence: () => void
}) {
  const [ticker, setTicker] = useState('')
  const autoStarted = useRef(new Set<string>())
  const evidenceCount = forecast.supporting_evidence.length + forecast.contradicting_evidence.length + forecast.watch_signals.length
  const score = forecast.brier_score
  const consensus = modelState(forecast.model_breakdown._consensus)
  const models = useMemo(() => Object.entries(forecast.model_breakdown).flatMap(([key, value]) => {
    if (key === '_consensus') return []
    const state = modelState(value)
    return state?.probability != null ? [[key, state] as const] : []
  }), [forecast.model_breakdown])

  useEffect(() => {
    if (
      forecast.status !== 'open'
      || models.length > 0
      || runningIntelligence
      || attachingMarket
      || autoStarted.current.has(forecast.id)
    ) return

    autoStarted.current.add(forecast.id)
    const timer = window.setTimeout(() => onRunIntelligence(), 180)
    return () => window.clearTimeout(timer)
  }, [attachingMarket, forecast.id, forecast.status, models.length, onRunIntelligence, runningIntelligence])

  const submitTicker = (event: FormEvent) => {
    event.preventDefault()
    const normalized = ticker.trim()
    if (!normalized || attachingMarket) return
    onAttachMarket(normalized)
  }

  const allEvidence = useMemo(() => [
    ...forecast.supporting_evidence.map((item) => ({ ...item, stance: 'FOR' })),
    ...forecast.contradicting_evidence.map((item) => ({ ...item, stance: 'AGAINST' })),
    ...forecast.watch_signals.map((item) => ({ ...item, stance: 'WATCH' })),
  ].sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, 8), [forecast])

  return (
    <section className="forecast-section" id="forecast-result">
      <div className="forecast-heading">
        <div>
          <p className="section-kicker">PERCEPTION FORECAST</p>
          <h1>{forecast.question}</h1>
          <p>Probability is a forecast, not a guarantee. Every revision is preserved for calibration.</p>
        </div>
        <div className={`forecast-status forecast-status--${forecast.status}`}>
          <CircleDot size={14} />
          <span>{forecast.status.toUpperCase()}</span>
        </div>
      </div>

      <div className="forecast-grid">
        <article className="forecast-card forecast-card--probability">
          <p className="card-label">CURRENT PROBABILITY</p>
          <strong>{pct(forecast.current_probability)}</strong>
          <div className="forecast-meter" aria-label={`${pct(forecast.current_probability)} probability`}>
            <span style={{ width: pct(forecast.current_probability) }} />
          </div>
          <div className="forecast-inline">
            <span><TrendIcon trend={forecast.trend} /> {forecast.trend}</span>
            <span>{forecast.confidence} confidence</span>
          </div>
        </article>

        <article className="forecast-card">
          <p className="card-label">RESOLUTION DATE</p>
          <h3>{dateLabel(forecast.deadline)}</h3>
          <span>Original probability {pct(forecast.original_probability)}</span>
        </article>

        <article className="forecast-card">
          <p className="card-label">EVIDENCE SNAPSHOT</p>
          <h3>{evidenceCount} signals</h3>
          <span>{forecast.supporting_evidence.length} supporting · {forecast.contradicting_evidence.length} contradicting · {forecast.watch_signals.length} neutral</span>
        </article>

        <article className="forecast-card">
          <p className="card-label">ENSEMBLE</p>
          <h3>{consensus?.model_count ?? (models.length || 'PRIOR')}</h3>
          <span>{consensus?.model_count ? `independent model keys · disagreement ${pct(consensus.disagreement ?? 0)}` : 'waiting for independent signals'}</span>
        </article>

        <article className="forecast-card">
          <p className="card-label">CALIBRATION</p>
          <h3>{score == null ? 'UNSCORED' : score.toFixed(4)}</h3>
          <span>{calibration?.resolved_count ? `${calibration.resolved_count} resolved · mean Brier ${calibration.mean_brier_score?.toFixed(4) ?? '—'}` : 'Builds after forecasts resolve'}</span>
        </article>
      </div>

      {forecast.status === 'open' && (
        <div className="forecast-auto-run">
          <div>
            <p className="card-label"><BrainCircuit size={14} /> AUTONOMOUS INTELLIGENCE</p>
            <h3>{runningIntelligence ? 'Scouting automatically…' : 'Find the signals for me.'}</h3>
            <p>New forecasts start intelligence automatically. You can rerun it manually at any time to force a fresh market, evidence, and base-rate scan.</p>
          </div>
          <button type="button" onClick={onRunIntelligence} disabled={runningIntelligence || attachingMarket}>
            <BrainCircuit size={16} /> {runningIntelligence ? 'SCOUTING…' : 'RUN INTELLIGENCE'}
          </button>
          {intelligenceNote && <small>{intelligenceNote}</small>}
        </div>
      )}

      {forecast.status === 'open' && (
        <div className="forecast-market-link">
          <div>
            <p className="card-label"><Link2 size={13} /> MANUAL MARKET SIGNAL</p>
            <p>Optional correction path: attach a specific Kalshi ticker yourself. Perception records the market probability as one weighted input and never places a trade.</p>
          </div>
          <form onSubmit={submitTicker}>
            <input
              value={ticker}
              onChange={(event) => setTicker(event.target.value)}
              placeholder="Kalshi market ticker"
              aria-label="Kalshi market ticker"
              disabled={attachingMarket || runningIntelligence}
              autoCapitalize="characters"
            />
            <button type="submit" disabled={attachingMarket || runningIntelligence || !ticker.trim()}>
              <BarChart3 size={15} /> {attachingMarket ? 'READING…' : 'ADD SIGNAL'}
            </button>
          </form>
          {marketNote && <small>{marketNote}</small>}
        </div>
      )}

      {(models.length > 0 || evidenceCount > 0) && (
        <div className="forecast-intelligence-grid">
          <article className="forecast-intelligence-card">
            <div className="forecast-intelligence-heading">
              <p className="card-label">MODEL DISAGREEMENT</p>
              <span>{consensus?.disagreement != null ? pct(consensus.disagreement) : '—'}</span>
            </div>
            <div className="forecast-model-list">
              {models.map(([key, model]) => (
                <div className="forecast-model-row" key={key}>
                  <div>
                    <strong>{key}</strong>
                    <small>{model.family || 'model'} · weight {typeof model.weight === 'number' ? model.weight.toFixed(2) : '—'}</small>
                  </div>
                  <span>{pct(model.probability ?? 0)}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="forecast-intelligence-card">
            <p className="card-label">STRONGEST EVIDENCE</p>
            <div className="forecast-evidence-list">
              {allEvidence.map((item, index) => (
                <div className="forecast-evidence-row" key={`${item.source_ref || item.label || 'evidence'}-${index}`}>
                  <span>{item.stance}</span>
                  <div>
                    <strong>{String(item.label || 'Signal')}</strong>
                    <small>{String(item.source || item.source_kind || 'source')} · strength {pct(Number(item.score || 0))}</small>
                  </div>
                </div>
              ))}
              {!allEvidence.length && <p className="forecast-empty-copy">No evidence recorded yet.</p>}
            </div>
          </article>
        </div>
      )}

      <ForecastAutopilotPanel forecast={forecast} resolving={resolving} onResolve={onResolve} />
      <ForecastSelfCalibrationPanel forecast={forecast} />

      {forecast.status === 'open' ? (
        <div className="forecast-resolution">
          <div>
            <p className="card-label">RESOLVE OUTCOME</p>
            <p>Use only when the event has objectively resolved. This locks the outcome and calculates the Brier score.</p>
          </div>
          <div className="forecast-resolution-actions">
            <button type="button" disabled={resolving || runningIntelligence} onClick={() => onResolve(true)}><CheckCircle2 size={15} /> YES</button>
            <button type="button" disabled={resolving || runningIntelligence} onClick={() => onResolve(false)}><Scale size={15} /> NO</button>
          </div>
        </div>
      ) : (
        <div className="forecast-resolution forecast-resolution--resolved">
          <CheckCircle2 size={17} />
          <span>Resolved {forecast.outcome ? 'YES' : 'NO'} · Brier score {forecast.brier_score?.toFixed(4)}</span>
        </div>
      )}
    </section>
  )
}
