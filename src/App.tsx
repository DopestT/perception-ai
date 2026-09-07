import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Compass, LogOut, Mail, Search, Sparkles, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { PlasmaPortal, type ExperienceMode, type PlasmaMode } from './PlasmaPortal'
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

const PENDING_OBJECTIVE_KEY = 'perception:pending-objective:v1'
const PENDING_TTL_MS = 30 * 60 * 1000
const targetStages = [
  'UNDERSTOOD',
  'PROJECT WORLD CREATED',
  'REALITY ROUTE CREATED',
  'CAPABILITY ROUTED',
  'ACTION STARTED',
  'RESULT VERIFIED',
  'PROJECT WORLD UPDATED',
]

const experienceModes: Array<{
  id: ExperienceMode
  label: string
  invitation: string
  placeholder: string
  action: string
}> = [
  {
    id: 'discover',
    label: 'DISCOVER',
    invitation: 'FIND THE POSSIBILITY',
    placeholder: "I don't know where to begin...",
    action: 'DISCOVER',
  },
  {
    id: 'perceive',
    label: 'PERCEIVE',
    invitation: 'THE FRONT DOOR TO IMAGINATION',
    placeholder: 'I have an idea...',
    action: 'PERCEIVE IT',
  },
  {
    id: 'search',
    label: 'SEARCH',
    invitation: 'FIND WHAT IS TRUE AND USEFUL',
    placeholder: "I'm looking for...",
    action: 'SEARCH',
  },
]

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function savePendingObjective(statement: string) {
  localStorage.setItem(PENDING_OBJECTIVE_KEY, JSON.stringify({ statement, savedAt: Date.now() }))
}

function readPendingObjective(): string | null {
  try {
    const raw = localStorage.getItem(PENDING_OBJECTIVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { statement?: string; savedAt?: number }
    if (!parsed.statement || !parsed.savedAt || Date.now() - parsed.savedAt > PENDING_TTL_MS) {
      localStorage.removeItem(PENDING_OBJECTIVE_KEY)
      return null
    }
    return parsed.statement
  } catch {
    localStorage.removeItem(PENDING_OBJECTIVE_KEY)
    return null
  }
}

function clearPendingObjective() {
  localStorage.removeItem(PENDING_OBJECTIVE_KEY)
}

function inferCompletedStages(world: ProjectWorld | null, runtimeResult: ObjectiveRuntimeResult | null) {
  const completed = new Set(runtimeResult?.stages ?? [])
  if (!world) return completed
  if (world.objectives.length) completed.add('UNDERSTOOD')
  if (world.project?.id) completed.add('PROJECT WORLD CREATED')
  if (world.routes.length) completed.add('REALITY ROUTE CREATED')
  if (world.events.some((event) => event.event_type === 'capability.routed')) completed.add('CAPABILITY ROUTED')
  if (world.worker_runs.length) completed.add('ACTION STARTED')
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
  const [authOpen, setAuthOpen] = useState(false)
  const [authSent, setAuthSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>('perceive')
  const [portalMode, setPortalMode] = useState<PlasmaMode>('idle')
  const [typingEnergy, setTypingEnergy] = useState(0)
  const resumeInFlight = useRef(false)
  const typingTimer = useRef<number | null>(null)

  const completedStages = useMemo(() => inferCompletedStages(world, runtimeResult), [world, runtimeResult])
  const activeExperience = experienceModes.find((mode) => mode.id === experienceMode) ?? experienceModes[1]

  const loadLatestWorld = useCallback(async () => {
    const latest = await getLatestProjectWorld()
    setWorld(latest)
  }, [])

  const processObjective = useCallback(async (statement: string) => {
    if (resumeInFlight.current) return
    resumeInFlight.current = true
    setBusy(true)
    setError('')
    setNotice('')
    setPortalMode('charging')

    try {
      const request = submitObjective(statement)
      await delay(280)
      setPortalMode('absorbing')
      const result = await request
      if (!result.ok || !result.project_id) throw new Error(result.stage || 'Perception could not verify the first action.')

      const nextWorld = await getProjectWorld(result.project_id)
      setRuntimeResult(result)
      setWorld(nextWorld)
      clearPendingObjective()
      setInput('')
      setPortalMode('transitioning')
      await delay(620)
      setPortalMode('idle')
      setNotice('Perception verified the first bounded action and updated Project World.')
      window.setTimeout(() => document.getElementById('project-world')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (cause) {
      setPortalMode('focused')
      setError(cause instanceof Error ? cause.message : 'Perception could not process this objective.')
    } finally {
      resumeInFlight.current = false
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!backendConfigured || !supabase) {
      setLoading(false)
      return
    }

    let active = true

    const acceptSession = async (nextSession: Session | null) => {
      if (!active) return
      setSession(nextSession)
      if (!nextSession) return
      setAuthOpen(false)
      setAuthSent(false)
      const pending = readPendingObjective()
      if (pending) {
        await processObjective(pending)
      } else {
        await loadLatestWorld()
      }
    }

    getSession()
      .then(acceptSession)
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not restore the Perception session.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      void acceptSession(nextSession).catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not continue the Perception session.')
      })
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [loadLatestWorld, processObjective])

  useEffect(() => () => {
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const statement = input.trim()
    if (!statement || busy) return

    if (!session) {
      savePendingObjective(statement)
      setPortalMode('charging')
      await delay(260)
      setPortalMode('auth')
      setAuthOpen(true)
      return
    }

    await processObjective(statement)
  }

  const requestSignIn = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    if (!address || authBusy) return
    setAuthBusy(true)
    setError('')
    try {
      await requestEmailSignIn(address)
      setAuthSent(true)
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
      setSession(null)
      setWorld(null)
      setRuntimeResult(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign out.')
    }
  }

  const onInputChange = (value: string) => {
    setInput(value)
    const activity = Math.min(1, 0.16 + value.length * 0.008)
    setTypingEnergy(activity)
    if (portalMode !== 'auth' && portalMode !== 'charging' && portalMode !== 'absorbing') setPortalMode('typing')
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(() => {
      setTypingEnergy(Math.max(0.08, activity * 0.35))
      setPortalMode('focused')
    }, 420)
  }

  const closeAuth = () => {
    setAuthOpen(false)
    setAuthSent(false)
    setPortalMode(input ? 'focused' : 'idle')
  }

  const selectExperienceMode = (nextMode: ExperienceMode) => {
    if (busy || nextMode === experienceMode) return
    setExperienceMode(nextMode)
    setError('')
    setNotice('')
    if (portalMode !== 'auth') setPortalMode(input ? 'focused' : 'idle')
  }

  return (
    <main className="perception-shell">
      <header className="home-header">
        <button className="wordmark" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="wordmark-mark">P</span>
          <span>PERCEPTION</span>
        </button>
        {session ? (
          <div className="account-actions">
            <button className="quiet-action" type="button" onClick={() => document.getElementById('project-world')?.scrollIntoView({ behavior: 'smooth' })}>PROJECT WORLD</button>
            <button className="icon-action" type="button" onClick={logout} aria-label="Sign out"><LogOut size={15} /></button>
          </div>
        ) : (
          <button className="sign-in-link" type="button" onClick={() => { setPortalMode('auth'); setAuthOpen(true) }}>SIGN IN</button>
        )}
      </header>

      <section className={`portal-hero portal-hero--${portalMode} portal-hero--experience-${experienceMode}`}>
        <div className="portal-stage">
          <PlasmaPortal mode={portalMode} experienceMode={experienceMode} energy={typingEnergy} />
          <div className="portal-fallback" aria-hidden="true" />
          <div className="portal-reflection" aria-hidden="true" />

          <div className="hero-content">
            <p className="hero-kicker">{activeExperience.invitation}</p>
            <div className="experience-switcher" role="group" aria-label="Choose how Perception helps">
              {experienceModes.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={experienceMode === mode.id}
                  className={experienceMode === mode.id ? 'experience-tab experience-tab--active' : 'experience-tab'}
                  onClick={() => selectExperienceMode(mode.id)}
                  disabled={busy}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <form className="hero-input-shell" onSubmit={submit}>
              <input
                value={input}
                onChange={(event) => onInputChange(event.target.value)}
                onFocus={() => { if (portalMode !== 'auth') setPortalMode('focused') }}
                onBlur={() => { if (!input && portalMode !== 'auth') setPortalMode('idle') }}
                placeholder={activeExperience.placeholder}
                aria-label={`${activeExperience.label}: ${activeExperience.placeholder}`}
                disabled={busy}
              />
              <button type="submit" disabled={busy || !input.trim()}>
                <span>{busy ? 'WORKING' : activeExperience.action}</span>
                {experienceMode === 'discover' ? <Compass size={15} /> : experienceMode === 'search' ? <Search size={15} /> : <Sparkles size={15} />}
              </button>
            </form>
            <p className="track-line">SEE <span>•</span> HEAR <span>•</span> UNDERSTAND <span>•</span> BUILD</p>
            {notice && <p className="hero-notice" role="status"><Check size={14} /> {notice}</p>}
            {error && !authOpen && <p className="hero-error" role="alert">{error}</p>}
          </div>
        </div>
      </section>

      {world && (
        <section className="world-section" id="project-world">
          <div className="world-heading">
            <div>
              <p className="section-kicker">PROJECT WORLD</p>
              <h1>{world.project.name || 'Your idea is in motion.'}</h1>
              <p>{world.project.current_reality || 'Perception has established the first durable project state.'}</p>
            </div>
            <div className="world-status"><strong>{completedStages.size}/7</strong><span>verified stages</span></div>
          </div>

          <div className="stage-strip" aria-label="Perception verified runtime">
            {targetStages.map((stage, index) => (
              <div className={completedStages.has(stage) ? 'stage-chip stage-chip--done' : 'stage-chip'} key={stage}>
                <span>{completedStages.has(stage) ? '✓' : index + 1}</span>
                <small>{stage}</small>
              </div>
            ))}
          </div>

          <div className="world-grid">
            <article className="world-card world-card--wide">
              <p className="card-label">CURRENT REALITY</p>
              <h2>{world.project.current_reality}</h2>
              <p>Only verified effects can advance this state.</p>
            </article>
            <article className="world-card">
              <p className="card-label">OBJECTIVE</p>
              <h3>{world.objectives.at(-1)?.statement || '—'}</h3>
              <span>{world.objectives.at(-1)?.status || 'active'}</span>
            </article>
            <article className="world-card">
              <p className="card-label">PORTABLE WORKER</p>
              <h3>{world.worker_runs.at(-1)?.worker_key || 'Waiting'}</h3>
              <span>{world.worker_runs.at(-1)?.status || 'not started'}</span>
            </article>
            <article className="world-card">
              <p className="card-label">VERIFICATION</p>
              <h3>{world.verifications.at(-1)?.passed ? 'PASS' : 'PENDING'}</h3>
              <span>{world.verifications.at(-1)?.evidence.length ?? 0} evidence checks</span>
            </article>
            <article className="world-card">
              <p className="card-label">AUDIT TRAIL</p>
              <h3>{world.events.length} events</h3>
              <span>append-oriented Project World history</span>
            </article>
          </div>
        </section>
      )}

      {!world && session && !loading && (
        <section className="empty-world">
          <p>Signed in. Your first idea will create a durable Project World.</p>
        </section>
      )}

      {authOpen && (
        <div className="auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAuth() }}>
          <section className="auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="auth-close" type="button" onClick={closeAuth} aria-label="Close sign in"><X size={18} /></button>
            <div className="auth-icon"><Mail size={18} /></div>
            {!authSent ? (
              <>
                <p className="section-kicker">SAVE YOUR PROJECT WORLD</p>
                <h2 id="auth-title">Perception has your idea.</h2>
                <p>Sign in so Perception can remember what happens next. Your idea will continue automatically.</p>
                <form onSubmit={requestSignIn} className="auth-form">
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" required autoFocus />
                  <button type="submit" disabled={authBusy || !email.trim()}>{authBusy ? 'SENDING…' : 'CONTINUE'}</button>
                </form>
              </>
            ) : (
              <>
                <p className="section-kicker">CHECK YOUR EMAIL</p>
                <h2 id="auth-title">Your idea is waiting here.</h2>
                <p>Open the secure Perception sign-in link we sent to <strong>{email}</strong>. When you return, the original idea will continue automatically.</p>
                <button className="auth-secondary" type="button" onClick={() => setAuthSent(false)}>USE A DIFFERENT EMAIL</button>
              </>
            )}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <small>Authentication protects durable Project World ownership. Perception does not need your password.</small>
          </section>
        </div>
      )}

      <footer className="home-footer">
        <span>PERCEPTION</span>
        <p>Workers produce evidence. Perception owns truth. Verified effects update Project World.</p>
      </footer>
    </main>
  )
}

export default App
