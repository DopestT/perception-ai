import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Clock3, Compass, KeyRound, LogOut, Search, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { Session } from '@supabase/supabase-js'
import { ForecastPanel } from './ForecastPanel'
import { PlasmaPortal, type ExperienceMode, type PlasmaMode } from './PlasmaPortal'
import {
  attachKalshiMarketSignal,
  backendConfigured,
  createForecast,
  getForecastCalibration,
  getLatestForecast,
  getLatestProjectWorld,
  getPendingPerceptionGitHubSelfTest,
  getProjectLedgers,
  getProjectWorld,
  getSession,
  requestEmailSignIn,
  registerPasskey,
  resolveForecast,
  resumeObjective,
  signInWithOAuthProvider,
  signInWithPasskey,
  signInWithPassword,
  signUpWithPassword,
  runAutonomousForecast,
  denyPerceptionGitHubSelfTest,
  executePerceptionGitHubSelfTest,
  preparePerceptionGitHubSelfTest,
  signOut,
  submitObjective,
  supabase,
  type Forecast,
  type ForecastCalibration,
  type GitHubOperatorSelfTestPlan,
  type ObjectiveRuntimeResult,
  type ProjectLedgers,
  type ProjectWorld,
} from './lib/perception-backend'

const PENDING_OBJECTIVE_KEY = 'perception:pending-objective:v2'
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
  id: Exclude<ExperienceMode, 'forecast'>
  label: string
  invitation: string
  placeholder: string
  action: string
}> = [
  { id: 'discover', label: 'DISCOVER', invitation: 'FIND THE POSSIBILITY', placeholder: "I don't know where to begin...", action: 'DISCOVER' },
  { id: 'perceive', label: 'PERCEIVE', invitation: 'THE FRONT DOOR TO IMAGINATION', placeholder: 'I have an idea...', action: 'PERCEIVE IT' },
  { id: 'search', label: 'SEARCH', invitation: 'FIND WHAT IS TRUE AND USEFUL', placeholder: "I'm looking for...", action: 'SEARCH' },
]

const forecastExperience = {
  id: 'forecast' as const,
  label: 'FORECAST',
  invitation: 'MAP WHAT IS MOST LIKELY NEXT',
  placeholder: 'Will this happen by the resolution date?',
  action: 'FORECAST',
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function defaultForecastDeadline() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return date.toISOString().slice(0, 10)
}

type AuthMode = 'signin' | 'signup' | 'magic'

type PendingObjective = {
  statement: string
  savedAt: number
  mode: ExperienceMode
  deadline?: string
}

function savePendingObjective(statement: string, mode: ExperienceMode, deadline?: string) {
  localStorage.setItem(PENDING_OBJECTIVE_KEY, JSON.stringify({ statement, mode, deadline, savedAt: Date.now() }))
}

function readPendingObjective(): PendingObjective | null {
  try {
    const raw = localStorage.getItem(PENDING_OBJECTIVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingObjective>
    if (!parsed.statement || !parsed.savedAt || Date.now() - parsed.savedAt > PENDING_TTL_MS) {
      localStorage.removeItem(PENDING_OBJECTIVE_KEY)
      return null
    }
    return {
      statement: parsed.statement,
      savedAt: parsed.savedAt,
      mode: parsed.mode || 'perceive',
      deadline: parsed.deadline,
    }
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
  const [ledgers, setLedgers] = useState<ProjectLedgers | null>(null)
  const [runtimeResult, setRuntimeResult] = useState<ObjectiveRuntimeResult | null>(null)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [calibration, setCalibration] = useState<ForecastCalibration | null>(null)
  const [forecastDeadline, setForecastDeadline] = useState(defaultForecastDeadline)
  const [input, setInput] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  const [authOpen, setAuthOpen] = useState(false)
  const [authSent, setAuthSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resolvingForecast, setResolvingForecast] = useState(false)
  const [attachingMarket, setAttachingMarket] = useState(false)
  const [runningIntelligence, setRunningIntelligence] = useState(false)
  const [runningOperatorTest, setRunningOperatorTest] = useState(false)
  const [continuingRoute, setContinuingRoute] = useState(false)
  const [operatorPlan, setOperatorPlan] = useState<GitHubOperatorSelfTestPlan | null>(null)
  const [registeringPasskey, setRegisteringPasskey] = useState(false)
  const [marketNote, setMarketNote] = useState('')
  const [intelligenceNote, setIntelligenceNote] = useState('')
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
  const activeExperience =
    experienceMode === 'forecast'
      ? forecastExperience
      : experienceModes.find((mode) => mode.id === experienceMode) ?? experienceModes[1]

  const loadLatestWorld = useCallback(async () => {
    const [latest, pendingApproval] = await Promise.all([
      getLatestProjectWorld(),
      getPendingPerceptionGitHubSelfTest(),
    ])
    setWorld(latest)
    setLedgers(latest ? await getProjectLedgers(latest.project.id) : null)
    setOperatorPlan(pendingApproval)
  }, [])

  const loadForecastState = useCallback(async () => {
    try {
      const [latestForecast, nextCalibration] = await Promise.all([getLatestForecast(), getForecastCalibration()])
      setForecast(latestForecast)
      setCalibration(nextCalibration)
    } catch (cause) {
      console.warn('Perception forecast state is not available yet.', cause)
    }
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
      const [nextWorld, nextLedgers] = await Promise.all([
        getProjectWorld(result.project_id),
        getProjectLedgers(result.project_id),
      ])
      setRuntimeResult(result)
      setWorld(nextWorld)
      setLedgers(nextLedgers)
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

  const handleContinueRoute = useCallback(async () => {
    if (!world || busy || continuingRoute) return
    const objective = world.objectives.at(-1)
    if (!objective?.id) {
      setError('No objective is available to continue.')
      return
    }

    setContinuingRoute(true)
    setBusy(true)
    setError('')
    setNotice('')
    setPortalMode('charging')

    try {
      const request = resumeObjective(world.project.id, objective.id)
      await delay(220)
      setPortalMode('absorbing')
      const result = await request
      if (!result.ok || !result.project_id) throw new Error(result.stage || 'Perception could not continue this route.')

      const [nextWorld, nextLedgers] = await Promise.all([
        getProjectWorld(result.project_id),
        getProjectLedgers(result.project_id),
      ])
      setRuntimeResult(result)
      setWorld(nextWorld)
      setLedgers(nextLedgers)
      setPortalMode('transitioning')
      await delay(420)
      setPortalMode('idle')

      const execution = result.local_executions?.at(-1)
      const phase = execution && typeof execution.phase === 'string' ? execution.phase : null
      if (phase === 'in_progress') {
        setNotice('This route already has an active leased worker. Perception did not start a duplicate.')
      } else if (phase === 'retry_wait') {
        setNotice('The previous attempt is inside its bounded retry window. Perception did not duplicate the work.')
      } else if (phase === 'retry_exhausted') {
        setNotice('This route reached its bounded retry limit. The failure remains explicit in Project World.')
      } else {
        setNotice('Perception continued the existing Project World and verified the next bounded work it could safely complete.')
      }
    } catch (cause) {
      setPortalMode('focused')
      setError(cause instanceof Error ? cause.message : 'Perception could not continue this route.')
    } finally {
      setContinuingRoute(false)
      setBusy(false)
    }
  }, [busy, continuingRoute, world])

  const processForecast = useCallback(async (question: string, deadline: string) => {
    if (resumeInFlight.current) return
    if (!deadline) {
      setError('Choose a resolution date for this forecast.')
      return
    }
    const deadlineDate = new Date(`${deadline}T23:59:59`)
    if (Number.isNaN(deadlineDate.getTime()) || deadlineDate.getTime() <= Date.now()) {
      setError('Forecast resolution date must be in the future.')
      return
    }

    resumeInFlight.current = true
    setBusy(true)
    setError('')
    setNotice('')
    setMarketNote('')
    setIntelligenceNote('')
    setPortalMode('charging')

    try {
      const request = createForecast(question, deadlineDate.toISOString(), 0.5)
      await delay(280)
      setPortalMode('absorbing')
      const result = await request
      if (!result.ok || !result.project_id) throw new Error('Perception could not open this forecast.')

      const [nextWorld, nextCalibration, nextLedgers] = await Promise.all([
        getProjectWorld(result.project_id),
        getForecastCalibration(),
        getProjectLedgers(result.project_id),
      ])
      setRuntimeResult(null)
      setForecast(result.forecast)
      setCalibration(nextCalibration)
      setWorld(nextWorld)
      setLedgers(nextLedgers)
      clearPendingObjective()
      setInput('')
      setPortalMode('transitioning')
      await delay(620)
      setPortalMode('idle')
      setNotice('Forecast opened. Run autonomous intelligence to find independent signals.')
      window.setTimeout(() => document.getElementById('forecast-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (cause) {
      setPortalMode('focused')
      setError(cause instanceof Error ? cause.message : 'Perception could not create this forecast.')
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
        setExperienceMode(pending.mode)
        if (pending.mode === 'forecast') await processForecast(pending.statement, pending.deadline || defaultForecastDeadline())
        else await processObjective(pending.statement)
      } else {
        await Promise.all([loadLatestWorld(), loadForecastState()])
      }
    }

    getSession()
      .then(acceptSession)
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not restore the Perception session.') })
      .finally(() => { if (active) setLoading(false) })

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
  }, [loadForecastState, loadLatestWorld, processForecast, processObjective])

  useEffect(() => () => {
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const statement = input.trim()
    if (!statement || busy) return

    if (!session) {
      savePendingObjective(statement, experienceMode, experienceMode === 'forecast' ? forecastDeadline : undefined)
      setPortalMode('charging')
      await delay(260)
      setPortalMode('auth')
      setAuthOpen(true)
      return
    }

    if (experienceMode === 'forecast') {
      await processForecast(statement, forecastDeadline)
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

  const handleOAuthSignIn = async (provider: 'google' | 'apple') => {
    if (authBusy) return
    setAuthBusy(true)
    setError('')
    try {
      await signInWithOAuthProvider(provider)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not continue with ${provider}.`)
      setAuthBusy(false)
    }
  }

  const handlePasskeySignIn = async () => {
    if (authBusy) return
    setAuthBusy(true)
    setError('')
    try {
      await signInWithPasskey()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Passkey sign-in is not available yet.')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleRegisterPasskey = async () => {
    if (registeringPasskey) return
    setRegisteringPasskey(true)
    setError('')
    setNotice('')
    try {
      await registerPasskey()
      setNotice('Passkey enabled. Next time, you can sign in with Face ID, Touch ID, your device PIN, or a security key.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perception could not register a passkey on this device.')
    } finally {
      setRegisteringPasskey(false)
    }
  }

  const handlePasswordAuth = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    if (!address || password.length < 8 || authBusy) return

    setAuthBusy(true)
    setError('')
    setNotice('')

    try {
      if (authMode === 'signup') {
        const result = await signUpWithPassword(address, password)
        if (result.requiresEmailConfirmation) {
          setAuthSent(true)
          setNotice('Check your email once to confirm this account. After that, use your password or passkey.')
        }
      } else {
        await signInWithPassword(address, password)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not authenticate this account.')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleRunIntelligence = async () => {
    if (!forecast || forecast.status !== 'open' || runningIntelligence) return
    setRunningIntelligence(true)
    setError('')
    setIntelligenceNote('')
    try {
      const result = await runAutonomousForecast(forecast.id)
      const nextWorld = await getProjectWorld(forecast.project_id)
      setForecast(result.forecast)
      setWorld(nextWorld)
      const providers = result.markets.map((market) => market.provider).join(' + ')
      const pieces = [
        result.markets.length ? `${result.markets.length} market signal${result.markets.length === 1 ? '' : 's'} (${providers})` : 'no confident market match',
        `${result.news.recorded} recent evidence item${result.news.recorded === 1 ? '' : 's'}`,
        result.base_rate ? `internal base rate from ${result.base_rate.matched_forecasts} resolved analogs` : 'base-rate abstention',
      ]
      setIntelligenceNote(`${pieces.join(' · ')}. Consensus ${Math.round(result.forecast.current_probability * 100)}%.`)
      setNotice('Autonomous forecast intelligence completed and the auditable consensus was updated.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perception could not complete the autonomous forecast run.')
    } finally {
      setRunningIntelligence(false)
    }
  }

  const handleAttachMarket = async (ticker: string) => {
    if (!forecast || attachingMarket || forecast.status !== 'open') return
    setAttachingMarket(true)
    setError('')
    setMarketNote('')
    try {
      const result = await attachKalshiMarketSignal(forecast.id, ticker)
      const nextForecast = result.result.forecast
      const nextWorld = await getProjectWorld(forecast.project_id)
      setForecast(nextForecast)
      setWorld(nextWorld)
      setMarketNote(`${result.market.title}: Kalshi ${Math.round(result.market.implied_probability * 100)}% · Perception consensus ${Math.round(nextForecast.current_probability * 100)}%.`)
      setNotice('External prediction-market signal recorded and consensus recalculated.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perception could not attach that market signal.')
    } finally {
      setAttachingMarket(false)
    }
  }

  const handleResolveForecast = async (outcome: boolean) => {
    if (!forecast || resolvingForecast) return
    setResolvingForecast(true)
    setError('')
    try {
      const result = await resolveForecast(forecast.id, outcome)
      const [nextCalibration, nextWorld] = await Promise.all([
        getForecastCalibration(),
        getProjectWorld(forecast.project_id),
      ])
      setForecast(result.forecast)
      setCalibration(nextCalibration)
      setWorld(nextWorld)
      setNotice(`Forecast resolved ${outcome ? 'YES' : 'NO'} and calibration updated.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perception could not resolve this forecast.')
    } finally {
      setResolvingForecast(false)
    }
  }

  const handlePrepareOperatorProof = async () => {
    if (runningOperatorTest || busy) return
    setRunningOperatorTest(true)
    setBusy(true)
    setError('')
    setNotice('Materializing a bounded GitHub proof for review…')
    setPortalMode('charging')

    try {
      const plan = await preparePerceptionGitHubSelfTest()
      setOperatorPlan(plan)
      setPortalMode('focused')
      setNotice('P1 planning verified. Review the exact P2 action contract before execution.')
    } catch (cause) {
      setPortalMode('focused')
      setError(cause instanceof Error ? cause.message : 'Perception could not prepare the GitHub proof.')
      setNotice('')
    } finally {
      setRunningOperatorTest(false)
      setBusy(false)
    }
  }

  const handleApproveOperatorProof = async () => {
    if (!operatorPlan || runningOperatorTest || busy) return
    setRunningOperatorTest(true)
    setBusy(true)
    setError('')
    setNotice('Executing the approved bounded GitHub proof…')
    setPortalMode('charging')

    try {
      const result = await executePerceptionGitHubSelfTest(operatorPlan)
      const [nextWorld, nextLedgers] = await Promise.all([
        getProjectWorld(result.project_id),
        getProjectLedgers(result.project_id),
      ])
      setRuntimeResult(null)
      setWorld(nextWorld)
      setLedgers(nextLedgers)
      setOperatorPlan(null)
      setPortalMode('transitioning')
      await delay(420)
      setPortalMode('idle')
      const commit = result.commit_sha ? result.commit_sha.slice(0, 8) : 'observed commit'
      setNotice(`Operator proof verified: ${commit} on ${result.branch}. main was not modified and the temporary P2 grant was revoked.`)
      window.setTimeout(() => document.getElementById('project-world')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (cause) {
      setPortalMode('focused')
      setError(cause instanceof Error ? cause.message : 'Perception could not complete the approved GitHub proof.')
      setNotice('')
    } finally {
      setRunningOperatorTest(false)
      setBusy(false)
    }
  }

  const handleDenyOperatorProof = async () => {
    if (!operatorPlan || runningOperatorTest || busy) return
    setRunningOperatorTest(true)
    setBusy(true)
    setError('')
    setNotice('')

    try {
      const deniedProjectId = operatorPlan.project_id
      await denyPerceptionGitHubSelfTest(operatorPlan)
      setOperatorPlan(null)
      if (world?.project.id === deniedProjectId) {
        setLedgers(await getProjectLedgers(deniedProjectId))
      }
      setPortalMode('idle')
      setNotice('Operator action denied. The decision is now recorded in the Execution Ledger.')
    } catch (cause) {
      setPortalMode('focused')
      setError(cause instanceof Error ? cause.message : 'Perception could not record the denial.')
    } finally {
      setRunningOperatorTest(false)
      setBusy(false)
    }
  }

  const logout = async () => {
    setError('')
    try {
      await signOut()
      setSession(null)
      setWorld(null)
      setLedgers(null)
      setRuntimeResult(null)
      setForecast(null)
      setCalibration(null)
      setMarketNote('')
      setIntelligenceNote('')
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
    setPassword('')
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
            <button className="quiet-action" type="button" onClick={handlePrepareOperatorProof} disabled={runningOperatorTest || busy}>
              {runningOperatorTest ? 'PREPARING…' : 'PREPARE OPERATOR PROOF'}
            </button>
            <button className="quiet-action" type="button" onClick={() => document.getElementById('project-world')?.scrollIntoView({ behavior: 'smooth' })}>PROJECT WORLD</button>
            <button className="quiet-action" type="button" onClick={handleRegisterPasskey} disabled={registeringPasskey}>
              {registeringPasskey ? 'ADDING PASSKEY…' : 'ENABLE PASSKEY'}
            </button>
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
            <div className="capability-launcher">
              <button
                type="button"
                className={experienceMode === 'forecast' ? 'capability-link capability-link--active' : 'capability-link'}
                onClick={() => selectExperienceMode(experienceMode === 'forecast' ? 'perceive' : 'forecast')}
                disabled={busy}
                aria-pressed={experienceMode === 'forecast'}
              >
                <Clock3 size={12} />
                <span>{experienceMode === 'forecast' ? 'FORECAST WORKSPACE · EXIT' : 'SPECIALIZED · FORECAST'}</span>
              </button>
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
                {experienceMode === 'discover' ? <Compass size={15} /> : experienceMode === 'search' ? <Search size={15} /> : experienceMode === 'forecast' ? <Clock3 size={15} /> : <Sparkles size={15} />}
              </button>
            </form>
            {experienceMode === 'forecast' && (
              <div className="forecast-deadline-field">
                <label htmlFor="forecast-deadline">RESOLUTION DATE</label>
                <input id="forecast-deadline" type="date" value={forecastDeadline} min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} onChange={(event) => setForecastDeadline(event.target.value)} disabled={busy} />
              </div>
            )}
            <p className="track-line">SEE <span>•</span> HEAR <span>•</span> UNDERSTAND <span>•</span> BUILD</p>
            {notice && <p className="hero-notice" role="status"><Check size={14} /> {notice}</p>}
            {error && !authOpen && <p className="hero-error" role="alert">{error}</p>}
          </div>
        </div>
      </section>

      {forecast && (
        <ForecastPanel
          forecast={forecast}
          calibration={calibration}
          resolving={resolvingForecast}
          attachingMarket={attachingMarket}
          runningIntelligence={runningIntelligence}
          marketNote={marketNote}
          intelligenceNote={intelligenceNote}
          onResolve={handleResolveForecast}
          onAttachMarket={handleAttachMarket}
          onRunIntelligence={handleRunIntelligence}
        />
      )}

      {world && (
        <section className="world-section" id="project-world">
          <div className="world-heading">
            <div>
              <p className="section-kicker">PROJECT WORLD</p>
              <h1>{world.project.name || 'Your idea is in motion.'}</h1>
              <p>{world.project.current_reality || 'Perception has established the first durable project state.'}</p>
            </div>
            <div className="world-heading-actions">
              <div className="world-status"><strong>{completedStages.size}/7</strong><span>verified stages</span></div>
              {!forecast && world.objectives.at(-1) && !['realized', 'superseded'].includes(world.objectives.at(-1)?.status || '') && (
                <button className="continue-route" type="button" onClick={handleContinueRoute} disabled={busy || continuingRoute}>
                  {continuingRoute ? 'CONTINUING…' : 'CONTINUE ROUTE'}
                </button>
              )}
            </div>
          </div>

          <div className="stage-strip" aria-label="Perception verified runtime">
            {targetStages.map((stage, index) => (
              <div className={completedStages.has(stage) ? 'stage-chip stage-chip--done' : 'stage-chip'} key={stage}>
                <span>{completedStages.has(stage) ? '✓' : index + 1}</span>
                <small>{stage}</small>
              </div>
            ))}
          </div>

          {ledgers && (
            <div className="trust-summary" aria-label="Perception trust state">
              <div>
                <span>KNOWN</span>
                <strong>{ledgers.epistemic.filter((entry) => entry.state === 'observed' || entry.state === 'confirmed').length}</strong>
                <small>trusted claims</small>
              </div>
              <div>
                <span>INFERRED</span>
                <strong>{ledgers.epistemic.filter((entry) => entry.state === 'inferred').length}</strong>
                <small>revisable claims</small>
              </div>
              <div>
                <span>ATTEMPTED</span>
                <strong>{ledgers.execution.filter((entry) => entry.phase === 'attempted').length}</strong>
                <small>execution attempts</small>
              </div>
              <div>
                <span>VERIFIED</span>
                <strong>{ledgers.execution.filter((entry) => entry.phase === 'verified').length}</strong>
                <small>verified effects</small>
              </div>
            </div>
          )}

          <div className="world-grid">
            <article className="world-card world-card--wide">
              <p className="card-label">CURRENT REALITY</p>
              <h2>{world.project.current_reality}</h2>
              <p>Only verified effects can advance this state.</p>
            </article>
            <article className="world-card">
              <p className="card-label">OBJECTIVE</p>
              <h3>{world.objectives.at(-1)?.statement || forecast?.question || '—'}</h3>
              <span>
                {world.objectives.at(-1)?.meaning_source
                  ? `${world.objectives.at(-1)?.status || 'active'} · meaning ${world.objectives.at(-1)?.meaning_source} ${Math.round((world.objectives.at(-1)?.meaning_confidence ?? 0) * 100)}%`
                  : world.objectives.at(-1)?.status || forecast?.status || 'active'}
              </span>
            </article>
            <article className="world-card">
              <p className="card-label">PORTABLE WORKER</p>
              <h3>{world.worker_runs.at(-1)?.worker_key || (forecast ? 'forecast_runtime' : 'Waiting')}</h3>
              <span>{world.worker_runs.at(-1)?.status || (forecast ? 'tracking' : 'not started')}</span>
            </article>
            <article className="world-card">
              <p className="card-label">VERIFICATION</p>
              <h3>{world.verifications.at(-1)?.passed ? 'PASS' : forecast?.status === 'resolved' ? 'RESOLVED' : 'PENDING'}</h3>
              <span>{world.verifications.at(-1)?.evidence.length ?? 0} evidence checks</span>
            </article>
            <article className="world-card">
              <p className="card-label">AUDIT TRAIL</p>
              <h3>{world.events.length} events</h3>
              <span>append-oriented Project World history</span>
            </article>
          </div>

          {ledgers && (ledgers.epistemic.length > 0 || ledgers.execution.length > 0) && (
            <div className="ledger-panel">
              <article>
                <div className="ledger-heading">
                  <p className="card-label">EPISTEMIC LEDGER</p>
                  <span>{ledgers.epistemic.length} claims</span>
                </div>
                <div className="ledger-list">
                  {ledgers.epistemic.slice(-5).reverse().map((entry) => (
                    <div className="ledger-row" key={entry.id}>
                      <span className={`ledger-state ledger-state--${entry.state}`}>{entry.state}</span>
                      <div>
                        <strong>{entry.statement}</strong>
                        <small>{Math.round(entry.confidence * 100)}% confidence · {entry.claim_key}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article>
                <div className="ledger-heading">
                  <p className="card-label">EXECUTION LEDGER</p>
                  <span>{ledgers.execution.length} effects</span>
                </div>
                <div className="ledger-list">
                  {ledgers.execution.slice(-7).reverse().map((entry) => (
                    <div className="ledger-row" key={entry.id}>
                      <span className={`ledger-state ledger-state--${entry.phase}`}>{entry.phase}</span>
                      <div>
                        <strong>{entry.capability || 'runtime'} · {entry.permission_level}</strong>
                        <small>{entry.action_key}</small>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          )}
        </section>
      )}

      {!world && session && !loading && (
        <section className="empty-world">
          <p>Signed in. Your first idea will create a durable Project World.</p>
        </section>
      )}

      {operatorPlan && (
        <div className="approval-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !runningOperatorTest) setOperatorPlan(null)
        }}>
          <section className="approval-card" role="dialog" aria-modal="true" aria-labelledby="operator-approval-title">
            <button className="auth-close" type="button" onClick={() => setOperatorPlan(null)} disabled={runningOperatorTest} aria-label="Close approval review"><X size={18} /></button>
            <div className="approval-icon"><ShieldCheck size={18} /></div>
            <p className="section-kicker">P2 · EXPLICIT APPROVAL</p>
            <h2 id="operator-approval-title">Review the exact GitHub change.</h2>
            <p className="approval-intro">P1 has only inspected and planned. Closing this review does not approve or deny it; the pending action will remain recoverable from the Execution Ledger.</p>

            <div className="approval-grid">
              <div><span>STATUS</span><strong>AWAITING YOUR DECISION</strong></div>
              <div><span>PERMISSION WINDOW</span><strong>15 minutes after approval · revoked after execution</strong></div>
              <div><span>REPOSITORY</span><strong>{operatorPlan.contract.repository}</strong></div>
              <div><span>BASE</span><strong>{operatorPlan.contract.base_branch} · {operatorPlan.contract.base_sha?.slice(0, 10)}</strong></div>
              <div className="approval-wide"><span>WORKING BRANCH</span><strong>{operatorPlan.contract.working_branch}</strong></div>
              <div className="approval-wide"><span>PLANNED FILES</span><strong>{operatorPlan.files.map((file) => file.path).join(', ')}</strong></div>
              <div className="approval-wide"><span>TESTS</span><strong>{operatorPlan.contract.tests.join(' · ') || 'Bounded scope and independent GitHub observation'}</strong></div>
              <div className="approval-wide"><span>VERIFICATION</span><strong>{operatorPlan.contract.verification.requirements.join(' · ')}</strong></div>
              <div><span>PERMISSION</span><strong>{operatorPlan.contract.permission.level} · {operatorPlan.contract.permission.capability}</strong></div>
              <div><span>ROLLBACK</span><strong>Delete working branch · main remains untouched</strong></div>
            </div>

            <div className="approval-guardrail">
              <ShieldCheck size={14} />
              <span>If {operatorPlan.contract.base_branch} no longer matches the pinned commit, execution stops and Perception must rematerialize the plan.</span>
            </div>

            <div className="approval-actions">
              <button type="button" className="approval-cancel" onClick={() => setOperatorPlan(null)} disabled={runningOperatorTest}>NOT NOW</button>
              <button type="button" className="approval-deny" onClick={handleDenyOperatorProof} disabled={runningOperatorTest}>DENY</button>
              <button type="button" className="approval-run" onClick={handleApproveOperatorProof} disabled={runningOperatorTest}>
                {runningOperatorTest ? 'EXECUTING…' : 'APPROVE P2 & RUN PROOF'}
              </button>
            </div>
          </section>
        </div>
      )}

      {authOpen && (
        <div className="auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeAuth() }}>
          <section className="auth-card auth-card--modern" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="auth-close" type="button" onClick={closeAuth} aria-label="Close sign in"><X size={18} /></button>
            <div className="auth-icon"><KeyRound size={18} /></div>

            {!authSent ? (
              <>
                <p className="section-kicker">YOUR PERCEPTION ACCOUNT</p>
                <h2 id="auth-title">Continue your Project World.</h2>
                <p>Sign in with the email attached to your Perception account. Your existing Perception history stays attached to the same verified account.</p>

                {authMode !== 'magic' ? (
                  <>
                    <div className="auth-mode-switch" role="tablist" aria-label="Email authentication mode">
                      <button type="button" className={authMode === 'signin' ? 'auth-mode-tab auth-mode-tab--active' : 'auth-mode-tab'} onClick={() => setAuthMode('signin')}>SIGN IN</button>
                      <button type="button" className={authMode === 'signup' ? 'auth-mode-tab auth-mode-tab--active' : 'auth-mode-tab'} onClick={() => setAuthMode('signup')}>CREATE ACCOUNT</button>
                    </div>
                    <form onSubmit={handlePasswordAuth} className="auth-password-form">
                      <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="Email address"
                        autoComplete="email"
                        required
                      />
                      <input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={authMode === 'signup' ? 'Create a password' : 'Password'}
                        autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                        minLength={8}
                        required
                      />
                      <button type="submit" disabled={authBusy || !email.trim() || password.length < 8}>
                        {authBusy ? 'WORKING…' : authMode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}
                      </button>
                    </form>
                    <button className="auth-text-action" type="button" onClick={() => { setAuthMode('magic'); setAuthSent(false); setPassword('') }}>
                      Email me a sign-in link instead
                    </button>
                  </>
                ) : (
                  <>
                    <form onSubmit={requestSignIn} className="auth-password-form">
                      <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" autoComplete="email" required autoFocus />
                      <button type="submit" disabled={authBusy || !email.trim()}>{authBusy ? 'SENDING…' : 'SEND SIGN-IN LINK'}</button>
                    </form>
                    <button className="auth-text-action" type="button" onClick={() => setAuthMode('signin')}>Use password or another method</button>
                  </>
                )}
              </>
            ) : (
              <>
                <p className="section-kicker">CHECK YOUR EMAIL</p>
                <h2 id="auth-title">{authMode === 'signup' ? 'Confirm your account.' : 'Your Project World is waiting.'}</h2>
                <p>
                  We sent a secure message to <strong>{email}</strong>.
                  {authMode === 'signup'
                    ? ' Confirm it once, then you can sign in with your password and add a passkey.'
                    : ' Open the newest sign-in link and you will return here automatically.'}
                </p>
                <button className="auth-secondary" type="button" onClick={() => setAuthSent(false)}>BACK TO SIGN IN</button>
              </>
            )}

            {error && <p className="auth-error" role="alert">{error}</p>}
            <small>Email/password is active now. If you do not have a password yet, request a fresh email sign-in link.</small>
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
