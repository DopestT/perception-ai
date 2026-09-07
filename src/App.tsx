import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Eye, HelpCircle, LogOut, Mail, Sparkles } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import {
  backendConfigured,
  getLatestProjectWorld,
  getProjectWorld,
  getSession,
  requestEmailSignIn,
  signOut,
  submitObjective,
  supabase,
  type ObjectiveRuntimeResult,
  type ProjectWorld,
} from './lib/perception-backend'

const targetStages = [
  'UNDERSTOOD',
  'PROJECT WORLD CREATED',
  'REALITY ROUTE CREATED',
  'CAPABILITY ROUTED',
  'ACTION STARTED',
  'RESULT VERIFIED',
  'PROJECT WORLD UPDATED',
]

function inferCompletedStages(world: ProjectWorld | null): Set<string> {
  const completed = new Set<string>()
  if (!world) return completed

  if (world.objectives.length > 0) completed.add('UNDERSTOOD')
  if (world.project?.id) completed.add('PROJECT WORLD CREATED')
  if (world.routes.length > 0) completed.add('REALITY ROUTE CREATED')
  if (world.events.some((event) => event.event_type === 'capability.routed')) completed.add('CAPABILITY ROUTED')
  if (world.worker_runs.length > 0) completed.add('ACTION STARTED')
  if (world.verifications.some((verification) => verification.passed)) completed.add('RESULT VERIFIED')
  if (world.events.some((event) => event.event_type === 'project_world.updated')) completed.add('PROJECT WORLD UPDATED')

  return completed
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [world, setWorld] = useState<ProjectWorld | null>(null)
  const [runtimeResult, setRuntimeResult] = useState<ObjectiveRuntimeResult | null>(null)
  const [input, setInput] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const loadLatestWorld = async () => {
    const latest = await getLatestProjectWorld()
    setWorld(latest)
  }

  useEffect(() => {
    if (!backendConfigured || !supabase) {
      setLoading(false)
      return
    }

    let active = true

    getSession()
      .then(async (currentSession) => {
        if (!active) return
        setSession(currentSession)
        if (currentSession) await loadLatestWorld()
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not restore the Perception session.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setRuntimeResult(null)
      if (nextSession) {
        void loadLatestWorld().catch((cause) => {
          if (active) setError(cause instanceof Error ? cause.message : 'Could not load Project World.')
        })
      } else {
        setWorld(null)
      }
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const completedStages = useMemo(() => {
    const inferred = inferCompletedStages(world)
    for (const stage of runtimeResult?.stages ?? []) inferred.add(stage)
    return inferred
  }, [runtimeResult, world])

  const latestArtifact = world?.artifacts.at(-1)
  const latestVerification = world?.verifications.at(-1)
  const latestWorker = world?.worker_runs.at(-1)
  const latestObjective = world?.objectives.at(-1)
  const certainty = world?.beliefs.length
    ? Math.round((world.beliefs.reduce((sum, belief) => sum + belief.confidence, 0) / world.beliefs.length) * 100)
    : 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const statement = input.trim()
    if (!statement || !session || busy) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const result = await submitObjective(statement)
      if (!result.ok || !result.project_id) {
        throw new Error(result.stage || 'Perception could not verify the first action.')
      }

      const nextWorld = await getProjectWorld(result.project_id)
      setRuntimeResult(result)
      setWorld(nextWorld)
      setInput('')
      setNotice('Verified progress was written to Project World.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perception could not process this objective.')
    } finally {
      setBusy(false)
    }
  }

  const requestSignIn = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    if (!address || authBusy) return

    setAuthBusy(true)
    setError('')
    setNotice('')
    try {
      await requestEmailSignIn(address)
      setNotice('Check your email for the Perception sign-in link. Your Project World will load after authentication.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the sign-in link.')
    } finally {
      setAuthBusy(false)
    }
  }

  const logout = async () => {
    setError('')
    try {
      await signOut()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out.')
    }
  }

  return (
    <main>
      <header className="site-header">
        <div className="brand">PERCEPTION</div>
        <div className="header-status">
          <span /> {session ? 'Durable Project World · authenticated' : 'Supabase Project World · sign-in required'}
        </div>
      </header>

      <section className="hero">
        <div className="orb" aria-hidden="true"><div className="orb__core" /></div>
        <p className="eyebrow">THE FRONT DOOR TO IMAGINATION</p>
        <h1>Tell me the idea exactly as it exists in your head.</h1>
        <p className="hero__copy">Perception captures intent, creates a Reality Route, starts a bounded worker, verifies its evidence, and only then updates Project World.</p>

        <form className="perceive-box" onSubmit={submit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="I have an idea…"
            aria-label="Describe your idea or objective"
            disabled={!session || busy}
          />
          <button type="submit" disabled={!session || busy || !input.trim()}>
            {busy ? 'PERCEIVING…' : 'PERCEIVE IT'} <Sparkles size={15} />
          </button>
        </form>

        {notice && <p className="hero__copy" role="status">{notice}</p>}
        {error && <p className="hero__copy" role="alert">{error}</p>}
      </section>

      {!backendConfigured && (
        <section className="model-panel">
          <div className="model-panel__heading">
            <div>
              <p className="eyebrow">BACKEND CONNECTION</p>
              <h2>Canonical Supabase is selected; the browser publishable key still needs the deployment environment.</h2>
              <p>Set VITE_SUPABASE_PUBLISHABLE_KEY in the frontend deployment. No private server credential belongs in browser code.</p>
            </div>
          </div>
        </section>
      )}

      {backendConfigured && !session && !loading && (
        <section className="model-panel">
          <div className="model-panel__heading">
            <div>
              <p className="eyebrow"><Mail size={14} /> PROJECT WORLD SIGN-IN</p>
              <h2>Sign in so Perception can remember what actually happened.</h2>
              <p>Your authenticated Supabase identity owns your projects through row-level security.</p>
            </div>
          </div>
          <form className="perceive-box" onSubmit={requestSignIn}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              required
            />
            <button type="submit" disabled={authBusy || !email.trim()}>
              {authBusy ? 'SENDING…' : 'EMAIL SIGN-IN LINK'}
            </button>
          </form>
        </section>
      )}

      {session && (
        <section className="model-panel" aria-labelledby="world-title">
          <div className="model-panel__heading">
            <div>
              <p className="eyebrow"><Eye size={14} /> PROJECT WORLD</p>
              <h2 id="world-title">{world?.project.name || 'Waiting for your first objective'}</h2>
              <p>{world?.project.current_reality || 'No verified project state exists yet.'}</p>
              <p><small>Supabase is authoritative. Browser state is only presentation; it does not own project truth.</small></p>
            </div>
            <div className="certainty">
              <strong>{certainty}%</strong>
              <span>evidence confidence</span>
            </div>
          </div>

          <div className="integrity-strip">
            <span><b>{world?.beliefs.filter((belief) => belief.state === 'observed').length ?? 0}</b> observed</span>
            <span><b>{world?.beliefs.filter((belief) => belief.state === 'confirmed').length ?? 0}</b> confirmed</span>
            <span><b>{world?.beliefs.filter((belief) => belief.state === 'inferred').length ?? 0}</b> inferred</span>
            <span><b>{world?.verifications.filter((verification) => verification.passed).length ?? 0}</b> verified effects</span>
            <span><b>{world?.events.length ?? 0}</b> audit events</span>
          </div>

          <div className="belief-groups">
            <section className="belief-group">
              <div className="belief-group__title">
                <h3>Current evidence</h3>
                <p>Observed, inferred, and verified state remain explicit.</p>
              </div>
              <div className="belief-grid">
                {(world?.beliefs ?? []).length === 0 ? (
                  <article className="belief"><p>No project evidence has been captured yet.</p><small>Enter an objective above to create the first Project World.</small></article>
                ) : (world?.beliefs ?? []).map((belief) => (
                  <article className={`belief belief--${belief.state}`} key={belief.id}>
                    <div className="belief__topline">
                      <span className="belief__state">{belief.state}</span>
                      <span className="belief__confidence">{Math.round(belief.confidence * 100)}% confidence</span>
                    </div>
                    <p>{belief.statement}</p>
                    <small>{belief.route_impact}</small>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}

      <section className="route-panel">
        <div className="route-panel__title">
          <div>
            <p className="eyebrow">PRODUCTION VERTICAL SLICE</p>
            <h2>{completedStages.has('PROJECT WORLD UPDATED') ? 'VERIFIED PROGRESS' : 'ROUTE TO VERIFIED PROGRESS'}</h2>
          </div>
          <span className="you-are-here">{completedStages.size}/7 COMPLETE</span>
        </div>
        <div className="route-line" aria-label="Verified Perception runtime" style={{ gridTemplateColumns: 'repeat(7, minmax(105px, 1fr))' }}>
          {targetStages.map((stage, index) => {
            const done = completedStages.has(stage)
            const active = !done && targetStages.find((candidate) => !completedStages.has(candidate)) === stage
            return (
              <div className={`route-node ${done ? 'done' : active ? 'active' : ''}`} key={stage}>
                <span>{done ? '✓' : index + 1}</span>
                <small>{stage}</small>
              </div>
            )
          })}
        </div>
        <div className="distance">
          <HelpCircle size={17} />
          <div>
            <strong>Distance to Reality:</strong>{' '}
            {completedStages.has('PROJECT WORLD UPDATED')
              ? 'First bounded action verified. The broader objective remains active.'
              : session
                ? 'Submit an objective to start the verified runtime.'
                : 'Authenticate to create a durable Project World.'}
            {latestObjective && <small> Objective status: {latestObjective.status}</small>}
          </div>
        </div>
      </section>

      {world && (
        <section className="model-panel" aria-labelledby="runtime-title">
          <div className="model-panel__heading">
            <div>
              <p className="eyebrow">EXECUTION RUNTIME</p>
              <h2 id="runtime-title">Worker evidence → verification → Project World</h2>
              <p>{world.project.current_reality}</p>
            </div>
            <div className="certainty">
              <strong>{latestVerification?.passed ? 'PASS' : '—'}</strong>
              <span>latest verification</span>
            </div>
          </div>

          <div className="belief-groups">
            <section className="belief-group">
              <div className="belief-group__title"><h3>Reality Route</h3><p>{world.routes.at(-1)?.reason}</p></div>
              <div className="belief-grid">
                {world.route_nodes.map((node) => (
                  <article className={`belief ${node.status === 'completed' ? 'belief--confirmed' : ''}`} key={node.id}>
                    <div className="belief__topline">
                      <span className="belief__state">{node.status}</span>
                      <span className="belief__confidence">{node.permission_level} · {node.capability}</span>
                    </div>
                    <p>{node.label}</p>
                    <small>{node.outcome}</small>
                  </article>
                ))}
              </div>
            </section>

            <section className="belief-group">
              <div className="belief-group__title"><h3>Portable worker</h3><p>Workers produce evidence; they do not own shared truth.</p></div>
              <div className="belief-grid">
                <article className={`belief ${latestWorker?.status === 'succeeded' ? 'belief--confirmed' : ''}`}>
                  <div className="belief__topline">
                    <span className="belief__state">{latestWorker?.status || 'not started'}</span>
                    <span className="belief__confidence">{latestWorker ? `${latestWorker.permission_level} · ${latestWorker.capability}` : '—'}</span>
                  </div>
                  <p>{latestWorker?.worker_key || 'No worker run yet.'}</p>
                  <small>The worker output cannot advance Project World until verification passes.</small>
                </article>
              </div>
            </section>

            <section className="belief-group">
              <div className="belief-group__title"><h3>{latestArtifact?.title || 'Verified artifact'}</h3><p>Evidence produced by the bounded worker.</p></div>
              <div className="belief-grid">
                <article className="belief belief--confirmed">
                  {(latestArtifact?.content || 'No artifact yet.').split('\n').map((line, index) => <p key={`${index}-${line}`}>{line}</p>)}
                </article>
                <article className={latestVerification?.passed ? 'belief belief--confirmed' : 'belief'}>
                  <div className="belief__topline">
                    <span className="belief__state">Verification evidence</span>
                    <span className="belief__confidence">{latestVerification?.passed ? 'passed' : 'not verified'}</span>
                  </div>
                  {(latestVerification?.evidence ?? []).map((evidence, index) => <p key={`${index}-${evidence}`}>✓ {evidence}</p>)}
                </article>
              </div>
            </section>
          </div>
        </section>
      )}

      <footer>
        <p><strong>Integrity rule:</strong> Workers produce evidence. Perception owns truth. Actions do not update truth; verified effects update truth.</p>
        {session && <button type="button" onClick={logout}><LogOut size={14} /> Sign out</button>}
      </footer>
    </main>
  )
}

export default App
