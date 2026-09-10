import { useEffect, useMemo, useState } from 'react'
import { Activity, Gauge, Layers3, ShieldCheck } from 'lucide-react'
import {
  getForecastCalibrationDashboard,
  type Forecast,
  type ForecastCalibrationDashboard,
  type ForecastCalibrationProfile,
} from './lib/perception-backend'
import './forecast-self-calibration.css'

function brier(value: number | null) {
  return value == null ? '—' : value.toFixed(4)
}

function multiplier(value: number) {
  return `×${value.toFixed(2)}`
}

function stageLabel(stage: ForecastCalibrationDashboard['learning_stage']) {
  if (stage === 'cold_start') return 'COLD START'
  if (stage === 'warming') return 'WARMING'
  if (stage === 'calibrating') return 'CALIBRATING'
  return 'MATURE'
}

function scopeLabel(profile: ForecastCalibrationProfile) {
  if (profile.scope_type === 'model_family') return 'MODEL FAMILY'
  if (profile.scope_type === 'evidence_kind') return 'EVIDENCE TYPE'
  return profile.scope_type.toUpperCase().replace('_', ' ')
}

function profileMetric(profile: ForecastCalibrationProfile) {
  if (profile.scope_type === 'evidence_kind') {
    return profile.posterior_accuracy == null ? 'accuracy —' : `accuracy ${Math.round(profile.posterior_accuracy * 100)}%`
  }
  return `Brier ${brier(profile.posterior_brier)}`
}

export function ForecastSelfCalibrationPanel({ forecast }: { forecast: Forecast }) {
  const [dashboard, setDashboard] = useState<ForecastCalibrationDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    getForecastCalibrationDashboard()
      .then((result) => {
        if (active) setDashboard(result)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Calibration state unavailable.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [forecast.id, forecast.status, forecast.updated_at])

  const visibleProfiles = useMemo(() => {
    if (!dashboard) return []
    const priority: Record<ForecastCalibrationProfile['scope_type'], number> = {
      provider: 0,
      model_family: 1,
      horizon: 2,
      evidence_kind: 3,
      global: 4,
      model_key: 5,
    }
    return [...dashboard.profiles]
      .filter((profile) => profile.scope_type !== 'model_key')
      .sort((a, b) => priority[a.scope_type] - priority[b.scope_type] || b.sample_count - a.sample_count)
      .slice(0, 10)
  }, [dashboard])

  const resolved = dashboard?.resolved_forecasts ?? 0
  const cold = !dashboard || dashboard.learning_stage === 'cold_start'

  return (
    <section className="forecast-learning" aria-label="Forecast self-calibration">
      <div className="forecast-learning-heading">
        <div>
          <p className="card-label"><Activity size={14} /> SELF-CALIBRATION</p>
          <h3>Perception learns who deserves weight.</h3>
          <p>Resolved forecasts score every contributing model and directional evidence source. Future consensus weights change only from measured performance.</p>
        </div>
        <span className={`forecast-learning-stage forecast-learning-stage--${dashboard?.learning_stage || 'cold_start'}`}>
          {loading ? 'LOADING' : stageLabel(dashboard?.learning_stage || 'cold_start')}
        </span>
      </div>

      {error ? (
        <p className="forecast-learning-error">{error}</p>
      ) : (
        <>
          <div className="forecast-learning-metrics">
            <div>
              <ShieldCheck size={16} />
              <span>RESOLVED</span>
              <strong>{resolved}</strong>
            </div>
            <div>
              <Layers3 size={16} />
              <span>MODEL SCORES</span>
              <strong>{dashboard?.model_score_count ?? 0}</strong>
            </div>
            <div>
              <Gauge size={16} />
              <span>MEAN MODEL BRIER</span>
              <strong>{brier(dashboard?.mean_model_brier ?? null)}</strong>
            </div>
          </div>

          {cold ? (
            <div className="forecast-learning-cold">
              <strong>Weights are still neutral.</strong>
              <p>Perception has not resolved enough forecasts to justify changing model influence. Early results are shrunk toward the neutral 0.25 Brier baseline instead of being overfit.</p>
            </div>
          ) : visibleProfiles.length ? (
            <div className="forecast-learning-profiles">
              {visibleProfiles.map((profile) => (
                <div className="forecast-learning-profile" key={`${profile.scope_type}:${profile.scope_key}`}>
                  <div>
                    <small>{scopeLabel(profile)}</small>
                    <strong>{profile.scope_key}</strong>
                    <span>{profileMetric(profile)} · {profile.sample_count} sample{profile.sample_count === 1 ? '' : 's'}</span>
                  </div>
                  <b>{multiplier(profile.weight_multiplier)}</b>
                </div>
              ))}
            </div>
          ) : null}

          <p className="forecast-learning-footnote">
            Lower Brier is better. The learner uses {dashboard?.shrinkage_prior_samples ?? 12} neutral pseudo-samples and keeps applied adaptive multipliers bounded, so a small streak cannot dominate the ensemble.
          </p>
        </>
      )}
    </section>
  )
}
