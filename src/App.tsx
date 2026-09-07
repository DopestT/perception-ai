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
import { runFirstActionCycle } from './lib/perception-flow'
import { getRouteReadiness, reviewStaleness } from './lib/perception-review'
import {
  clearWorkspace,
  getActiveModel,
  getActiveRuntime,
  loadWorkspace,
  saveWorkspace,
  setRuntimeCycle,
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

const routeSteps = [
  'EXPRESS',
  'PERCEIVE',
  'RESOLVE',
  'REALITY MAP',
  'ROUTE',
  'CREATE',
  'CONNECT',
  'EXECUTE',
  'VERIFY',
  'ADAPT',
  'REALIZE',
  'LEARN',
]

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
    const loaded = loadWorkspace('')
    return updateActiveModel(loaded, (model) => reviewStaleness(model))
  })
  const [input, setInput] = useState('')
  const model = useMemo(() => getActiveModel(workspace), [workspace])
  const runtime = useMemo(() => getActiveRuntime(workspace), [workspace])
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

  const completedRouteSteps = useMemo(() => {
    const completed = new Set<string>()
    if (readiness.trustedSignals > 0) {
      completed.add('EXPRESS')
      completed.add('PERCEIVE')
    }
    if (readiness.level >= 1) completed.add('RESOLVE')
    if (readiness.level >= 2) completed.add('REALITY MAP')
    if (readiness.level >= 3) completed.add('ROUTE')
    if (runtime?.verification.passed) {
      completed.add('CREATE')
      completed.add('EXECUTE')
      completed.add('VERIFY')
    }
    return completed
  }, [readiness, runtime])

  const activeRouteStep = runtime?.verification.passed
    ? 'VERIFY'
    : readiness.level === 3
      ? 'ROUTE'
      : readiness.level === 2
        ? 'REALITY MAP'
        : readiness.level === 1
          ? 'RESOLVE'
          : 'EXPRESS'

  const updateModel = (updater: Parameters<typeof updateActiveModel>[1]) => {
    setWorkspace((current) => updateActiveModel(current, updater))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const statement = input.trim()
    if (!statement) return

    setWorkspace((current) => {
      const modeled = updateActiveModel(current, (currentModel) => perceiveInput(currentModel, statement))
      const nextModel = getActiveModel(modeled)
      const nextReadiness = getRouteReadiness(nextModel)
      if (!nextReadiness.canRoute) return modeled

      const cycle = runFirstActionCycle(nextModel, statement)
      return setRuntimeCycle(modeled, nextModel.goal.id, cycle)
    })
    setInput('')
  }

  const updateBelief = (beliefId: string, state: BeliefState) => {
    updateModel((current) => setBeliefState(current, beliefId, state))
  }

  const reset = () => {
    setWorkspace(clearWorkspace(''))
    setInput('')
  }

  return (
    <main>
      <header className="site-header">
        <div className="brand">PERCEPTION</div>
        <div className="header-status"><span /> Runtime proof v0.1 · local Project World</div>
      </header>

      <section className="hero">
        <div className="orb" aria-hidden="true"><div className="orb__core" /></div>
        <p className="eyebrow">THE FRONT DOOR TO IMAGINATION</p>
        <h1>Tell me the idea exactly as it exists in your head.</h1>
        <p className="hero__copy">Perception separates evidence from inference, selects the smallest safe route, starts one reversible action, verifies it, and records the result.</p>
        <form className="perceive-box" onSubmit={submit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={runtime ? 'Add a new objective…' : 'I have an idea…'}
            aria-label="Describe your idea or objective"
          />
          <button type="submit">PERCEIVE IT <Sparkles size={15} /></button>
        </form>
      </section>

      <section className="model-panel" aria-labelledby="model-title">
        <div className="model-panel__heading">
          <div>
            <p className="eyebrow"><Eye size={14} /> WHAT PERCEPTION SEES</p>
            <h2 id="model-title">{model.goal.name}</h2>
            <p>{model.goal.currentReality}</p>
            <p><small>Project truth is persisted locally on this device until the dedicated Perception backend is connected.</small></p>
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
          {grouped.length === 0 ? (
            <section className="belief-group">
              <div className="belief-group__title"><h3>Waiting for an idea</h3></div>
              <div className="belief-grid"><article className="belief"><p>No project evidence has been captured yet.</p><small>Start with “I want…” or “My goal is…” to give Perception a routeable objective.</small></article></div>
            </section>
          ) : grouped.map(({ state, items }) => (
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
            <h2>{runtime?.verification.passed ? 'VERIFIED PROGRESS' : `LEVEL ${readiness.level} — ${readiness.label}`}</h2>
          </div>
          <span className="you-are-here">YOU ARE HERE</span>
        </div>
        <div className="route-line" aria-label="Route to Reality" style={{ gridTemplateColumns: 'repeat(12, minmax(72px, 1fr))' }}>
          {routeSteps.map((step, index) => {
            const active = step === activeRouteStep
            const done = completedRouteSteps.has(step) && !active
            return (
              <div className={`route-node ${done ? 'done' : active ? 'active' : ''}`} key={step}>
                <span>{done ? '✓' : index + 1}</span>
                <small>{step}</small>
              </div>
            )
          })}
        </div>
        <div className="distance">
          <HelpCircle size={17} />
          <div>
            <strong>Distance to Reality:</strong> {runtime?.verification.passed ? runtime.worldUpdate.nextAction : readiness.reason}{' '}
            <small>{readiness.trustedSignals} trusted signals · {readiness.unresolvedSignals} unresolved · {readiness.correctedSignals} corrected</small>
          </div>
        </div>
      </section>

      {runtime && (
        <section className="model-panel" aria-labelledby="runtime-title">
          <div className="model-panel__heading">
            <div>
              <p className="eyebrow">EXECUTION RUNTIME</p>
              <h2 id="runtime-title">Understood → Routed → Action Started → Verified</h2>
              <p>{runtime.worldUpdate.summary}</p>
            </div>
            <div className="certainty">
              <strong>{runtime.verification.passed ? 'PASS' : 'FAIL'}</strong>
              <span>verification</span>
            </div>
          </div>

          <div className="integrity-strip">
            <span><b>✓</b> understood</span>
            <span><b>✓</b> routed</span>
            <span><b>✓</b> action started</span>
            <span><b>✓</b> verified</span>
            <span><b>✓</b> Project World updated</span>
          </div>

          <div className="belief-groups">
            <section className="belief-group">
              <div className="belief-group__title"><h3>Route nodes</h3><p>Every node completed through the runtime state machine.</p></div>
              <div className="belief-grid">
                {runtime.nodes.map((node) => (
                  <article className="belief belief--confirmed" key={node.id}>
                    <div className="belief__topline"><span className="belief__state">{node.status}</span><span className="belief__confidence">{node.permissionLevel} · {node.capability}</span></div>
                    <p>{node.label}</p>
                    <small>{node.outcome}</small>
                  </article>
                ))}
              </div>
            </section>

            <section className="belief-group">
              <div className="belief-group__title"><h3>Verified artifact</h3><p>{runtime.artifact.title}</p></div>
              <div className="belief-grid">
                <article className="belief belief--confirmed">
                  {runtime.artifact.content.split('\n').map((line) => <p key={line}>{line}</p>)}
                </article>
                <article className="belief belief--confirmed">
                  <div className="belief__topline"><span className="belief__state">Verification evidence</span><span className="belief__confidence">{runtime.verification.evidence.length} checks</span></div>
                  {runtime.verification.evidence.map((evidence) => <p key={evidence}>✓ {evidence}</p>)}
                </article>
              </div>
            </section>

            <section className="belief-group">
              <div className="belief-group__title"><h3>Project World</h3><p>Durable local update</p></div>
              <div className="belief-grid">
                <article className="belief belief--confirmed">
                  <p>{runtime.worldUpdate.summary}</p>
                  <small>Verified {new Date(runtime.worldUpdate.verifiedAt).toLocaleString()}</small>
                </article>
                <article className="belief">
                  <p>{runtime.worldUpdate.nextAction}</p>
                  <small>The broader objective remains active; this first proof does not falsely mark it realized.</small>
                </article>
              </div>
            </section>
          </div>
        </section>
      )}

      <footer>
        <p><strong>Integrity rule:</strong> Perception never silently upgrades a guess into a fact, and never counts unverified work as progress.</p>
        <button type="button" onClick={reset}><RotateCcw size={14} /> Reset Project World</button>
      </footer>
    </main>
  )
}

export default App
