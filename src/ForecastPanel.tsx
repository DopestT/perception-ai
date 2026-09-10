import { ArrowDown, ArrowRight, ArrowUp, CheckCircle2, CircleDot, Scale } from 'lucide-react'
import type { Forecast, ForecastCalibration } from './lib/perception-backend'
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

export function ForecastPanel({
  forecast,
  calibration,
  resolving,
  onResolve,
}: {
  forecast: Forecast
  calibration: ForecastCalibration | null
  resolving: boolean
  onResolve: (outcome: boolean) => void
}) {
  const evidenceCount = forecast.supporting_evidence.length + forecast.contradicting_evidence.length
  const score = forecast.brier_score

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
          <span>{forecast.supporting_evidence.length} supporting · {forecast.contradicting_evidence.length} contradicting</span>
        </article>

        <article className="forecast-card">
          <p className="card-label">MODEL STATE</p>
          <h3>{Object.keys(forecast.model_breakdown).length ? 'ENSEMBLE' : 'PRIOR'}</h3>
          <span>{Object.keys(forecast.model_breakdown).join(' · ') || 'neutral baseline'}</span>
        </article>

        <article className="forecast-card">
          <p className="card-label">CALIBRATION</p>
          <h3>{score == null ? 'UNSCORED' : score.toFixed(4)}</h3>
          <span>{calibration?.resolved_count ? `${calibration.resolved_count} resolved · mean Brier ${calibration.mean_brier_score?.toFixed(4) ?? '—'}` : 'Builds after forecasts resolve'}</span>
        </article>
      </div>

      {forecast.status === 'open' ? (
        <div className="forecast-resolution">
          <div>
            <p className="card-label">RESOLVE OUTCOME</p>
            <p>Use only when the event has objectively resolved. This locks the outcome and calculates the Brier score.</p>
          </div>
          <div className="forecast-resolution-actions">
            <button type="button" disabled={resolving} onClick={() => onResolve(true)}><CheckCircle2 size={15} /> YES</button>
            <button type="button" disabled={resolving} onClick={() => onResolve(false)}><Scale size={15} /> NO</button>
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
