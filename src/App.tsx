import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Check, Eye, HelpCircle, RotateCcw, Sparkles, X } from 'lucide-react'
import {
  Belief,
  BeliefState,
  perceiveInput,
  setBeliefState,
  stateOrder,
  summarizeModel,
} from './lib/perception-model'
import { getRouteReadiness, reviewStaleness } from './lib/perception-review'
import {
  clearWorkspace,
  getActiveModel,
  loadWorkspace,
  saveWorkspace,
  updateActiveModel,
} from './lib/perception-store'

const labels: Record<BeliefState, string> = {
  observed: 'Observed',
  inferred: 'What I think',
  confirmed: 'Confirmed',
  unknown: 'Still unknown',
  rejected: 'Corrected',
  stale: 'Needs re-check',
}

const descriptions: Partial<Record<BeliefState, string>> = {
  confirmed: 'You explicitly validated this.',
  observed: 'You said this directly or Perception has direct evidence.',
  inferred: 'Perception is interpreting the evidence. This can be wrong.',
  unknown: 'Perception knows it does not know this yet.',
  stale: 'This may have been true, but needs fresh evidence.',
  rejected: 'An earlier interpretation was corrected and should not guide the route.',
}

const routeSteps = ['IDEA', 'UNDERSTOOD', 'MAPPED', 'ROUTED', 'BUILT', 'CONNECTED', 'EXECUTED', 'VERIFIED', 'REALIZED']

function BeliefCard({
  belief,
  onChange,
}: {
  belief: Belief
  onChange: (id: string, state: BeliefState) => void
}) {
  return (
    <article className={`belief belief--${belief.state}`}>
      <div className="belief__topline">
        <span className="belief__state">{labels[belief.state]}</span>
        <span className="belief__confidence">{Math.round(belief.confidence * 100)}% confidence</span>
      </div>
      <p>{belief.statement}</p>
      <small>{belief.routeImpact}</small>
      {belief.state === 'inferred' && (
        <div className="belief__actions">
          <button type="button" onClick={() => onChange(belief.id, 'confirmed')}>
            <Check size={14} /> Yes, keep this
          </button>
          <button type="button" onClick={() => onChange(belief.id, 'rejected')}>
            <X size={14} /> No, that’s wrong
          </button>
        </div>
      )}
    </article>
  )
}

function App() {
  const [workspace, setWorkspace] = useState(() => {
    const loaded = loadWorkspace('deer')
    return updateActiveModel(loaded, (model) => reviewStaleness(model))
  })
  const [input, setInput] = useState('')
  const model = useMemo(() => getActiveModel(workspace), [workspace])
  const summary = useMemo(() => summarizeModel(model), [model])
  const readiness = useMemo(() => getRouteReadiness(model), [model])

  useEffect(() => {
    saveWorkspace(workspace)
  }, [workspace])

  const grouped = useMemo(
    () =>
      stateOrder
        .map((state) => ({ state, items: model.goal.beliefs.filter((belief) => belief.state === state) }))
        .filter((group) => group.items.length > 0),
    [model],
  )

  const updateModel = (updater: Parameters<typeof updateActiveModel>[1]) => {
    setWorkspace((current) => updateActiveModel(current, updater))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!input.trim()) return
    updateModel((current) => perceiveInput(current, input))
    setInput('')
  }

  const updateBelief = (beliefId: string, state: BeliefState) => {
    updateModel((current) => setBeliefState(current, beliefId, state))
  }

  const reset = () => {
    setWorkspace(clearWorkspace('deer'))
    setInput('')
  }

  return (
    <main>
      <header className="site-header">
        <div className="brand">PERCEPTION</div>
        <div className="header-status"><span /> User/Goal Model v0.2 · persistent</div>
      </header>

      <section className="hero">
        <div className="orb" aria-hidden="true"><div className="orb__core" /></div>
        <p className="eyebrow">THE FRONT DOOR TO IMAGINATION</p>
        <h1>Tell me what exists in your head.</h1>
        <p className="hero__copy">Before I route it, I’ll show you what I know, what I’m inferring, and what I still don’t understand.</p>
        <form className="perceive-box" onSubmit={submit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Add context to ‘deer’…"
            aria-label="Add context"
          />
          <button type="submit">PERCEIVE IT <Sparkles size={15} /></button>
        </form>
      </section>

      <section className="model-panel" aria-labelledby="model-title">
        <div className="model-panel__heading">
          <div>
            <p className="eyebrow"><Eye size={14} /> WHAT PERCEPTION SEES</p>
            <h2 id="model-title">My current model of this goal</h2>
            <p>{model.goal.currentReality}</p>
            <p><small>Continuity is active on this device. Perception restores this project model when you return.</small></p>
          </div>
          <div className="certainty">
            <strong>{summary.certainty}%</strong>
            <span>model confidence</span>
          </div>
        </div>

        <div className="integrity-strip">
          <span><b>{summary.confirmed}</b> confirmed</span>
          <span><b>{summary.observed}</b> observed</span>
          <span><b>{summary.inferred}</b> inferred</span>
          <span><b>{summary.unknown}</b> unknown</span>
          <span><b>{summary.rejected}</b> corrected</span>
        </div>

        <div className="belief-groups">
          {grouped.map(({ state, items }) => (
            <section className="belief-group" key={state}>
              <div className="belief-group__title">
                <h3>{labels[state]}</h3>
                <p>{descriptions[state]}</p>
              </div>
              <div className="belief-grid">
                {items.map((belief) => (
                  <BeliefCard key={belief.id} belief={belief} onChange={updateBelief} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="route-panel">
        <div className="route-panel__title">
          <div>
            <p className="eyebrow">REALITY ROUTE</p>
            <h2>LEVEL {readiness.level} — {readiness.label}</h2>
          </div>
          <span className="you-are-here">YOU ARE HERE</span>
        </div>
        <div className="route-line" aria-label="Route to Reality">
          {routeSteps.map((step, index) => (
            <div
              className={`route-node ${index < readiness.level ? 'done' : index === readiness.level ? 'active' : ''}`}
              key={step}
            >
              <span>{index < readiness.level ? '✓' : index + 1}</span>
              <small>{step}</small>
            </div>
          ))}
        </div>
        <div className="distance">
          <HelpCircle size={17} />
          <div>
            <strong>Distance to Reality:</strong> {readiness.reason}{' '}
            <small>{readiness.trustedSignals} trusted signals · {readiness.unresolvedSignals} unresolved · {readiness.correctedSignals} corrected</small>
          </div>
        </div>
      </section>

      <footer>
        <p><strong>Integrity rule:</strong> Perception never silently upgrades a guess into a fact.</p>
        <button type="button" onClick={reset}><RotateCcw size={14} /> Reset deer test</button>
      </footer>
    </main>
  )
}

export default App
