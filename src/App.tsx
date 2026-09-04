import { FormEvent, useMemo, useState } from 'react'
import { Check, Eye, HelpCircle, RotateCcw, Sparkles, X } from 'lucide-react'
import {
  Belief,
  BeliefState,
  createModel,
  perceiveInput,
  setBeliefState,
  stateOrder,
  summarizeModel,
} from './lib/perception-model'

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
  const [model, setModel] = useState(() => createModel('deer'))
  const [input, setInput] = useState('')
  const summary = useMemo(() => summarizeModel(model), [model])

  const grouped = useMemo(
    () =>
      stateOrder
        .map((state) => ({ state, items: model.goal.beliefs.filter((belief) => belief.state === state) }))
        .filter((group) => group.items.length > 0),
    [model],
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!input.trim()) return
    setModel((current) => perceiveInput(current, input))
    setInput('')
  }

  const updateBelief = (beliefId: string, state: BeliefState) => {
    setModel((current) => setBeliefState(current, beliefId, state))
  }

  return (
    <main>
      <header className="site-header">
        <div className="brand">PERCEPTION</div>
        <div className="header-status"><span /> User/Goal Model v0.1</div>
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
            <h2>LEVEL 1 — UNDERSTANDING</h2>
          </div>
          <span className="you-are-here">YOU ARE HERE</span>
        </div>
        <div className="route-line" aria-label="Route to Reality">
          {['IDEA', 'UNDERSTOOD', 'MAPPED', 'ROUTED', 'BUILT', 'CONNECTED', 'EXECUTED', 'VERIFIED', 'REALIZED'].map((step, index) => (
            <div className={`route-node ${index === 0 ? 'done' : index === 1 ? 'active' : ''}`} key={step}>
              <span>{index === 0 ? '✓' : index + 1}</span>
              <small>{step}</small>
            </div>
          ))}
        </div>
        <div className="distance">
          <HelpCircle size={17} />
          <div><strong>Distance to Reality:</strong> intent still needs to be resolved before a reliable route should be selected.</div>
        </div>
      </section>

      <footer>
        <p><strong>Integrity rule:</strong> Perception never silently upgrades a guess into a fact.</p>
        <button type="button" onClick={() => setModel(createModel('deer'))}><RotateCcw size={14} /> Reset deer test</button>
      </footer>
    </main>
  )
}

export default App
