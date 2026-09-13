import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, GitBranch, Radar, ShieldAlert } from 'lucide-react'
import { supabase, type Forecast, type ForecastEvidence } from './lib/perception-backend'
import './forecast-scenario.css'

type ForecastScenarioSet = {
  id: string
  forecast_id: string
  forecast_version: number
  probability_snapshot: number
  confidence_snapshot: 'low' | 'medium' | 'high'
  model_count: number
  model_disagreement: number | null
  evidence_count: number
  created_at: string
}

type ForecastScenarioBranch = {
  id: string
  branch_key: 'yes' | 'no'
  outcome: boolean
  probability: number
  role: 'base' | 'alternate'
  label: string
  description: string
  assumptions: ForecastEvidence[]
  trigger_signals: ForecastEvidence[]
  downstream_consequences: string[]
}

type ForecastFailureCheck = {
  id: string
  check_kind: 'counterfactual' | 'shared_assumption' | 'surprise'
  severity: 'low' | 'medium' | 'high'
  title: string
  observation: string
  evidence_refs: ForecastEvidence[] | Record<string, unknown>
}

type ForecastScenarioAnalysis = {
  scenario_set: ForecastScenarioSet
  branches: ForecastScenarioBranch[]
  checks: ForecastFailureCheck[]
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

function evidenceLabel(item: ForecastEvidence, index: number) {
  return String(item.label || item.source || item.source_kind || `Signal ${index + 1}`)
}

function checkIcon(kind: ForecastFailureCheck['check_kind']) {
  if (kind === 'counterfactual') return <ShieldAlert size={16} />
  if (kind === 'shared_assumption') return <AlertTriangle size={16} />
  return <Radar size={16} />
}

export function ForecastScenarioPanel({ forecast }: { forecast: Forecast }) {
  const [analysis, setAnalysis] = useState<ForecastScenarioAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const client = supabase

    if (!client) {
      setLoading(false)
      setError('Scenario intelligence is unavailable because the Perception backend is not configured.')
      return () => { active = false }
    }

    setLoading(true)
    setError('')
    client
      .rpc('perception_refresh_forecast_scenario_analysis', { p_forecast_id: forecast.id })
      .then(({ data, error: rpcError }) => {
        if (!active) return
        if (rpcError) throw rpcError
        if (!data) throw new Error('Scenario intelligence returned no result.')
        setAnalysis(data as ForecastScenarioAnalysis)
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Scenario intelligence is unavailable.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [forecast.id, forecast.updated_at])

  const branches = useMemo(
    () => [...(analysis?.branches || [])].sort((a, b) => b.probability - a.probability),
    [analysis],
  )

  return (
    <section className="forecast-scenarios" aria-label="Forecast scenario tree and failure checks">
      <div className="forecast-scenarios-heading">
        <div>
          <p className="card-label"><GitBranch size={14} /> SCENARIOS + FAILURE TESTS</p>
          <h3>Keep more than one future alive.</h3>
          <p>
            Perception preserves both outcome branches, names what could falsify the leading view, checks for correlated model failure,
            and keeps surprise signals visible. Scenario analysis never changes the calibrated probability by itself.
          </p>
        </div>
        {analysis?.scenario_set && (
          <span className="forecast-scenarios-version">V{analysis.scenario_set.forecast_version}</span>
        )}
      </div>

      {loading ? (
        <div className="forecast-scenarios-loading">Building evidence-bounded scenario paths…</div>
      ) : error ? (
        <div className="forecast-scenarios-error">{error}</div>
      ) : analysis ? (
        <>
          <div className="forecast-scenario-tree">
            {branches.map((branch) => (
              <article className={`forecast-scenario-branch forecast-scenario-branch--${branch.role}`} key={branch.id}>
                <div className="forecast-scenario-branch-topline">
                  <span>{branch.label}</span>
                  <strong>{pct(branch.probability)}</strong>
                </div>
                <p>{branch.description}</p>

                <div className="forecast-scenario-detail">
                  <small>ASSUMPTIONS / EVIDENCE</small>
                  {branch.assumptions.length ? (
                    <ul>
                      {branch.assumptions.slice(0, 3).map((item, index) => (
                        <li key={`${branch.id}-assumption-${index}`}>{evidenceLabel(item, index)}</li>
                      ))}
                    </ul>
                  ) : (
                    <span>No direction-specific evidence recorded yet.</span>
                  )}
                </div>

                <div className="forecast-scenario-detail">
                  <small>TRIGGERS TO WATCH</small>
                  {branch.trigger_signals.length ? (
                    <ul>
                      {branch.trigger_signals.slice(0, 3).map((item, index) => (
                        <li key={`${branch.id}-trigger-${index}`}>{evidenceLabel(item, index)}</li>
                      ))}
                    </ul>
                  ) : (
                    <span>No explicit watch signals recorded yet.</span>
                  )}
                </div>
              </article>
            ))}
          </div>

          <div className="forecast-failure-checks">
            {analysis.checks.map((check) => (
              <article className={`forecast-failure-check forecast-failure-check--${check.severity}`} key={check.id}>
                <div className="forecast-failure-check-heading">
                  <span>{checkIcon(check.check_kind)}</span>
                  <div>
                    <small>{check.severity.toUpperCase()} RISK</small>
                    <strong>{check.title}</strong>
                  </div>
                </div>
                <p>{check.observation}</p>
              </article>
            ))}
          </div>

          <p className="forecast-scenarios-footnote">
            Snapshot V{analysis.scenario_set.forecast_version} · {analysis.scenario_set.model_count} model key{analysis.scenario_set.model_count === 1 ? '' : 's'} · {analysis.scenario_set.evidence_count} evidence signal{analysis.scenario_set.evidence_count === 1 ? '' : 's'}.
            New probability versions create new immutable scenario snapshots.
          </p>
        </>
      ) : null}
    </section>
  )
}
