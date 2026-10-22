from pathlib import Path

APP = Path('src/App.tsx')
STYLES = Path('src/styles.css')

source = APP.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    source = source.replace(old, new, 1)


replace_once(
    "import { GrowthOperatorPanel } from './GrowthOperatorPanel'\nimport { PlasmaPortal, type ExperienceMode, type PlasmaMode } from './PlasmaPortal'\n",
    "import { GrowthOperatorPanel } from './GrowthOperatorPanel'\nimport { TokenEfficiencyPanel } from './TokenEfficiencyPanel'\nimport { PlasmaPortal, type ExperienceMode, type PlasmaMode } from './PlasmaPortal'\nimport { resolveForecastInput, resolveFrontDoorInput } from './lib/front-door-intake'\n",
    'consumer imports',
)

replace_once(
    "const forecastExperience = {\n  id: 'forecast' as const,\n  label: 'FORECAST',\n  invitation: 'MAP WHAT IS MOST LIKELY NEXT',\n  placeholder: 'Will this happen by the resolution date?',\n  action: 'FORECAST',\n}\n",
    "const forecastExperience = {\n  id: 'forecast' as const,\n  label: 'FORECAST',\n  invitation: 'MAP WHAT IS MOST LIKELY NEXT',\n  placeholder: 'Will this happen by the resolution date?',\n  action: 'FORECAST',\n}\n\nconst starterActions: Array<{ label: string; mode: ExperienceMode; prompt: string }> = [\n  { label: 'Plan something', mode: 'perceive', prompt: 'Help me plan ' },\n  { label: 'Research something', mode: 'search', prompt: 'Research ' },\n  { label: 'Build something', mode: 'perceive', prompt: 'Help me build ' },\n  { label: 'Solve a problem', mode: 'perceive', prompt: 'Help me solve ' },\n  { label: 'Forecast an outcome', mode: 'forecast', prompt: 'Will ' },\n]\n",
    'starter actions',
)

replace_once(
    "  const [portalMode, setPortalMode] = useState<PlasmaMode>('idle')\n  const [typingEnergy, setTypingEnergy] = useState(0)\n",
    "  const [portalMode, setPortalMode] = useState<PlasmaMode>('idle')\n  const [typingEnergy, setTypingEnergy] = useState(0)\n  const [resultDepth, setResultDepth] = useState<'summary' | 'depth'>('summary')\n  const [showEvidence, setShowEvidence] = useState(false)\n  const [showSystem, setShowSystem] = useState(false)\n",
    'result disclosure state',
)

replace_once(
    "  const activeExperience =\n    experienceMode === 'forecast'\n      ? forecastExperience\n      : experienceModes.find((mode) => mode.id === experienceMode) ?? experienceModes[1]\n",
    "  const activeExperience =\n    experienceMode === 'forecast'\n      ? forecastExperience\n      : experienceModes.find((mode) => mode.id === experienceMode) ?? experienceModes[1]\n  const latestObjective = world?.objectives.at(-1) ?? null\n  const canContinueObjective = Boolean(latestObjective && !['realized', 'superseded'].includes(latestObjective.status || ''))\n  const verifiedEvidenceCount = world?.verifications.reduce((sum, verification) => sum + (verification.evidence?.length ?? 0), 0) ?? 0\n",
    'result derived state',
)

replace_once(
    "      setRuntimeResult(result)\n      setWorld(nextWorld)\n      setLedgers(nextLedgers)\n      clearPendingObjective()\n",
    "      setRuntimeResult(result)\n      setWorld(nextWorld)\n      setLedgers(nextLedgers)\n      setResultDepth('summary')\n      setShowEvidence(false)\n      setShowSystem(false)\n      clearPendingObjective()\n",
    'objective disclosure reset',
)

replace_once(
    "  const processForecast = useCallback(async (question: string, deadline: string) => {\n    if (resumeInFlight.current) return\n    if (!deadline) {\n      setError('Choose a resolution date for this forecast.')\n      return\n    }\n    const deadlineDate = new Date(`${deadline}T23:59:59`)\n",
    "  const processForecast = useCallback(async (question: string, deadline: string) => {\n    if (resumeInFlight.current) return\n    const forecastIntake = resolveForecastInput(question, deadline)\n    if (forecastIntake.kind === 'ignore') return\n    if (forecastIntake.kind === 'conversation') {\n      setError('')\n      setNotice(forecastIntake.message)\n      setPortalMode('focused')\n      return\n    }\n    if (!forecastIntake.deadline) {\n      setError('Choose a resolution date for this forecast.')\n      return\n    }\n    const resolvedQuestion = forecastIntake.question\n    const deadlineDate = new Date(`${forecastIntake.deadline}T23:59:59`)\n",
    'forecast intake gate',
)

replace_once(
    "      const request = createForecast(question, deadlineDate.toISOString(), 0.5)\n",
    "      const request = createForecast(resolvedQuestion, deadlineDate.toISOString(), 0.5)\n",
    'forecast resolved question',
)

replace_once(
    "      setRuntimeResult(null)\n      setForecast(result.forecast)\n      setCalibration(nextCalibration)\n      setWorld(nextWorld)\n      setLedgers(nextLedgers)\n      clearPendingObjective()\n",
    "      setRuntimeResult(null)\n      setForecast(result.forecast)\n      setCalibration(nextCalibration)\n      setWorld(nextWorld)\n      setLedgers(nextLedgers)\n      setResultDepth('summary')\n      setShowEvidence(false)\n      setShowSystem(false)\n      clearPendingObjective()\n",
    'forecast disclosure reset',
)

old_submit = """  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const statement = input.trim()
    if (!statement || busy) return
    if (intentShadowTimer.current) window.clearTimeout(intentShadowTimer.current)
    intentShadowAbort.current?.abort()
    intentShadowAbort.current = null
    intentShadowGeneration.current += 1

    if (!session) {
      savePendingObjective(statement, experienceMode, experienceMode === 'forecast' ? forecastDeadline : undefined)
      setError('')
      setNotice('Sign in once to execute this objective and keep its Project World.')
      setAuthMode('signup')
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
"""

new_submit = """  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const statement = input.trim()
    if (!statement || busy) return
    if (intentShadowTimer.current) window.clearTimeout(intentShadowTimer.current)
    intentShadowAbort.current?.abort()
    intentShadowAbort.current = null
    intentShadowGeneration.current += 1

    const frontDoor = resolveFrontDoorInput(statement)
    if (frontDoor.kind === 'ignore') return
    if (frontDoor.kind === 'conversation') {
      setError('')
      setNotice(frontDoor.message)
      setPortalMode('focused')
      return
    }

    if (experienceMode === 'forecast') {
      const forecastIntake = resolveForecastInput(statement, forecastDeadline)
      if (forecastIntake.kind !== 'forecast') {
        if (forecastIntake.kind === 'conversation') {
          setError('')
          setNotice(forecastIntake.message)
          setPortalMode('focused')
        }
        return
      }
    }

    if (!session) {
      savePendingObjective(frontDoor.statement, experienceMode, experienceMode === 'forecast' ? forecastDeadline : undefined)
      setError('')
      setNotice('Sign in once to continue and keep your work across devices.')
      setAuthMode('signup')
      setPortalMode('auth')
      setAuthOpen(true)
      return
    }

    if (experienceMode === 'forecast') {
      await processForecast(frontDoor.statement, forecastDeadline)
      return
    }
    await processObjective(frontDoor.statement)
  }
"""
replace_once(old_submit, new_submit, 'submit intake integration')

header_start = source.index('      <header className="home-header">')
header_end = source.index('      </header>', header_start) + len('      </header>')
new_header = """      <header className="home-header">
        <button className="wordmark" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="wordmark-mark">P</span>
          <span>PERCEPTION</span>
        </button>
        {session ? (
          <div className="account-actions">
            <button className="quiet-action" type="button" onClick={() => document.getElementById('project-world')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>MY WORK</button>
            <button className="quiet-action" type="button" onClick={() => {
              setResultDepth('depth')
              setShowSystem(true)
              window.setTimeout(() => document.getElementById('project-world')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
            }}>SYSTEM</button>
            <button className="icon-action" type="button" onClick={logout} aria-label="Sign out"><LogOut size={15} /></button>
          </div>
        ) : (
          <button className="sign-in-link" type="button" onClick={() => { setPortalMode('auth'); setAuthOpen(true) }}>SIGN IN</button>
        )}
      </header>"""
source = source[:header_start] + new_header + source[header_end:]

hero_start = source.index('          <div className="hero-content">')
hero_end_anchor = '            {error && !authOpen && <p className="hero-error" role="alert">{error}</p>}\n          </div>'
hero_end = source.index(hero_end_anchor, hero_start) + len(hero_end_anchor)
new_hero = """          <div className="hero-content">
            <p className="hero-kicker">Tell Perception what you want to make real.</p>
            <p className="hero-support">Perception understands the goal, builds a route, takes approved action, and verifies what actually changed.</p>
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
            <p className="hero-mode-line">{activeExperience.invitation}</p>
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
            <div className="starter-actions" aria-label="Quick ways to start">
              {starterActions.map((starter) => (
                <button key={starter.label} type="button" className="starter-action" onClick={() => {
                  if (starter.mode !== experienceMode) selectExperienceMode(starter.mode)
                  setInput(starter.prompt)
                  setPortalMode('focused')
                }} disabled={busy}>
                  {starter.label}
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
            <p className="track-line">SEE <span>•</span> HEAR <span>•</span> UNDERSTAND <span>•</span> BUILD</p>
            {notice && <p className="hero-notice" role="status"><Check size={14} /> {notice}</p>}
            {error && !authOpen && <p className="hero-error" role="alert">{error}</p>}
          </div>"""
source = source[:hero_start] + new_hero + source[hero_end:]

result_start = source.index('      {forecast && (')
result_end = source.index('      {!world && session && !loading && (', result_start)
new_result = """      {world && (
        <section className="world-section result-section" id="project-world">
          <div className="result-intro">
            <p className="section-kicker">{forecast ? 'PERCEPTION FORECAST' : 'PERCEPTION RESULT'}</p>
            <h1>
              {forecast
                ? `${Math.round(forecast.current_probability * 100)}% — ${forecast.question}`
                : world.project.current_reality || world.project.name || 'Perception has a working view.'}
            </h1>
            <p className="result-summary">
              {forecast
                ? `This is the current calibrated estimate, not a guarantee. Perception will only move it when new evidence justifies a revision.`
                : latestObjective
                  ? `Perception understands the goal: ${latestObjective.statement}. ${world.project.current_reality || 'The route is active and will advance only when effects are verified.'}`
                  : 'Perception has restored your durable Project World.'}
            </p>
            <div className="result-actions">
              <button type="button" onClick={() => setResultDepth('depth')}>GO DEEPER</button>
              {(forecast || canContinueObjective) && (
                <button
                  type="button"
                  className="result-action-primary"
                  onClick={forecast ? handleRunIntelligence : handleContinueRoute}
                  disabled={busy || continuingRoute || runningIntelligence}
                >
                  {busy || continuingRoute || runningIntelligence ? 'WORKING…' : 'TAKE THE NEXT STEP'}
                </button>
              )}
              <button type="button" onClick={() => { setResultDepth('depth'); setShowEvidence(true) }}>SHOW ME THE EVIDENCE</button>
            </div>
          </div>

          {resultDepth === 'depth' && (
            <div className="result-depth">
              <div className="result-depth-grid">
                <article>
                  <p className="card-label">What Perception found</p>
                  <h2>{forecast ? `${Math.round(forecast.current_probability * 100)}% current probability` : world.project.current_reality || 'A durable route is active.'}</h2>
                  <p>{forecast ? `${forecast.evidence?.length ?? 0} forecast signals are currently recorded.` : `${verifiedEvidenceCount} verification evidence item${verifiedEvidenceCount === 1 ? '' : 's'} are attached to this Project World.`}</p>
                </article>
                <article>
                  <p className="card-label">What it means</p>
                  <h2>{world.verifications.at(-1)?.passed ? 'The latest bounded effect is verified.' : forecast ? 'Confidence should stay provisional.' : 'The objective is still in progress.'}</h2>
                  <p>{forecast ? 'Probability can change as independent evidence, base rates, and resolved outcomes arrive.' : 'Perception separates what is known, inferred, attempted, and verified before it changes current reality.'}</p>
                </article>
                <article>
                  <p className="card-label">What should happen next</p>
                  <h2>{forecast ? 'Run fresh intelligence when the evidence changes.' : canContinueObjective ? 'Continue the same route.' : 'Review the evidence and decide what to pursue next.'}</h2>
                  <p>{forecast ? 'Perception can scan for new signals without rewriting earlier probability versions.' : 'The next action stays inside this Project World so history, permissions, and verification remain intact.'}</p>
                </article>
              </div>

              <div className="result-inspectors">
                <details>
                  <summary>Details</summary>
                  {forecast ? (
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
                  ) : (
                    <div className="world-grid">
                      <article className="world-card world-card--wide">
                        <p className="card-label">CURRENT REALITY</p>
                        <h2>{world.project.current_reality}</h2>
                        <p>Only verified effects can advance this state.</p>
                      </article>
                      <article className="world-card">
                        <p className="card-label">OBJECTIVE</p>
                        <h3>{latestObjective?.statement || '—'}</h3>
                        <span>{latestObjective?.status || 'active'}</span>
                      </article>
                      <article className="world-card">
                        <p className="card-label">VERIFICATION</p>
                        <h3>{world.verifications.at(-1)?.passed ? 'VERIFIED' : 'PENDING'}</h3>
                        <span>{world.verifications.at(-1)?.evidence.length ?? 0} evidence checks</span>
                      </article>
                    </div>
                  )}
                </details>

                <details open={showEvidence} onToggle={(event) => setShowEvidence(event.currentTarget.open)}>
                  <summary>Evidence</summary>
                  <div className="evidence-consumer-list">
                    {ledgers?.epistemic.length ? ledgers.epistemic.slice(-6).reverse().map((entry) => (
                      <article key={entry.id}>
                        <span>{entry.state === 'observed' || entry.state === 'confirmed' ? 'Verified / observed' : 'Working inference'}</span>
                        <strong>{entry.statement}</strong>
                      </article>
                    )) : <p>No evidence has been recorded yet.</p>}
                  </div>
                </details>

                <details>
                  <summary>Activity</summary>
                  <div className="stage-strip" aria-label="Perception verified runtime">
                    {targetStages.map((stage, index) => (
                      <div className={completedStages.has(stage) ? 'stage-chip stage-chip--done' : 'stage-chip'} key={stage}>
                        <span>{completedStages.has(stage) ? '✓' : index + 1}</span>
                        <small>{stage}</small>
                      </div>
                    ))}
                  </div>
                  <p className="activity-summary">{world.events.length} durable events are preserved in this Project World.</p>
                </details>

                <details open={showSystem} onToggle={(event) => setShowSystem(event.currentTarget.open)}>
                  <summary>System</summary>
                  {showSystem && (
                    <div className="system-surface" id="system-surface">
                      <div className="system-actions">
                        <button className="quiet-action" type="button" onClick={handlePrepareOperatorProof} disabled={runningOperatorTest || busy}>
                          {runningOperatorTest ? 'PREPARING…' : 'PREPARE OPERATOR PROOF'}
                        </button>
                        <button className="quiet-action" type="button" onClick={handleRegisterPasskey} disabled={registeringPasskey}>
                          {registeringPasskey ? 'ADDING PASSKEY…' : 'ENABLE PASSKEY'}
                        </button>
                      </div>
                      <TokenEfficiencyPanel />
                      <GrowthOperatorPanel projectId={world.project.id} />
                      {ledgers && (
                        <>
                          <div className="trust-summary" aria-label="Perception trust state">
                            <div><span>KNOWN</span><strong>{ledgers.epistemic.filter((entry) => entry.state === 'observed' || entry.state === 'confirmed').length}</strong><small>trusted claims</small></div>
                            <div><span>INFERRED</span><strong>{ledgers.epistemic.filter((entry) => entry.state === 'inferred').length}</strong><small>revisable claims</small></div>
                            <div><span>ATTEMPTED</span><strong>{ledgers.execution.filter((entry) => entry.phase === 'attempted').length}</strong><small>execution attempts</small></div>
                            <div><span>VERIFIED</span><strong>{ledgers.execution.filter((entry) => entry.phase === 'verified').length}</strong><small>verified effects</small></div>
                          </div>
                          <div className="ledger-panel">
                            <article>
                              <div className="ledger-heading"><p className="card-label">EPISTEMIC LEDGER</p><span>{ledgers.epistemic.length} claims</span></div>
                              <div className="ledger-list">
                                {ledgers.epistemic.slice(-5).reverse().map((entry) => (
                                  <div className="ledger-row" key={entry.id}>
                                    <span className={`ledger-state ledger-state--${entry.state}`}>{entry.state}</span>
                                    <div><strong>{entry.statement}</strong><small>{Math.round(entry.confidence * 100)}% confidence · {entry.claim_key}</small></div>
                                  </div>
                                ))}
                              </div>
                            </article>
                            <article>
                              <div className="ledger-heading"><p className="card-label">EXECUTION LEDGER</p><span>{ledgers.execution.length} effects</span></div>
                              <div className="ledger-list">
                                {ledgers.execution.slice(-7).reverse().map((entry) => (
                                  <div className="ledger-row" key={entry.id}>
                                    <span className={`ledger-state ledger-state--${entry.phase}`}>{entry.phase}</span>
                                    <div><strong>{entry.capability || 'runtime'} · {entry.permission_level}</strong><small>{entry.action_key}</small></div>
                                  </div>
                                ))}
                              </div>
                            </article>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </details>
              </div>
            </div>
          )}
        </section>
      )}

"""
source = source[:result_start] + new_result + source[result_end:]

source = source.replace(
    '          <p>Signed in. Your first idea will create a durable Project World.</p>',
    '          <p>Signed in. Start with a question or goal; Perception will create a Project World only when the work warrants one.</p>',
)

APP.write_text(source)

styles = STYLES.read_text()
marker = '/* consumer-productization-v1 */'
if marker not in styles:
    styles += r'''

/* consumer-productization-v1 */
.hero-support {
  width: min(720px, 90vw);
  margin: 10px auto 18px;
  color: rgba(244, 248, 255, 0.72);
  font-size: clamp(14px, 1.5vw, 18px);
  line-height: 1.55;
  text-align: center;
}
.hero-mode-line {
  margin: 10px 0 14px;
  color: rgba(255,255,255,.52);
  font-size: 11px;
  letter-spacing: .18em;
}
.starter-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin: 14px auto 4px;
  width: min(820px, 92vw);
}
.starter-action {
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(7,16,27,.42);
  color: rgba(255,255,255,.76);
  border-radius: 999px;
  padding: 8px 12px;
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  backdrop-filter: blur(14px);
}
.starter-action:hover { border-color: rgba(111,220,255,.42); color: #fff; }
.result-section { padding-top: 64px; }
.result-intro {
  max-width: 940px;
  margin: 0 auto;
  padding: clamp(28px, 5vw, 64px);
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(13,24,40,.86), rgba(8,14,25,.78));
  box-shadow: 0 28px 90px rgba(0,0,0,.28);
}
.result-intro h1 { max-width: 820px; margin: 8px 0 12px; }
.result-summary { max-width: 780px; color: rgba(245,249,255,.74); font-size: 16px; line-height: 1.65; }
.result-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
.result-actions button {
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.04);
  color: rgba(255,255,255,.82);
  border-radius: 999px;
  padding: 10px 15px;
  font: inherit;
  font-size: 11px;
  letter-spacing: .08em;
  cursor: pointer;
}
.result-actions .result-action-primary { background: rgba(70,198,255,.16); border-color: rgba(70,198,255,.38); color: #eafaff; }
.result-depth { max-width: 1180px; margin: 22px auto 0; }
.result-depth-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; }
.result-depth-grid article {
  padding: 22px;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 20px;
  background: rgba(10,18,30,.68);
}
.result-depth-grid h2 { font-size: 18px; line-height: 1.35; }
.result-depth-grid p:last-child { color: rgba(255,255,255,.62); line-height: 1.55; }
.result-inspectors { margin-top: 16px; display: grid; gap: 10px; }
.result-inspectors details {
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 18px;
  background: rgba(8,15,25,.62);
  overflow: clip;
}
.result-inspectors summary {
  list-style: none;
  cursor: pointer;
  padding: 17px 20px;
  color: rgba(255,255,255,.86);
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.result-inspectors summary::-webkit-details-marker { display: none; }
.result-inspectors details[open] > summary { border-bottom: 1px solid rgba(255,255,255,.08); }
.result-inspectors details > :not(summary) { margin-left: 18px; margin-right: 18px; }
.evidence-consumer-list { display: grid; gap: 10px; padding: 18px 0 22px; }
.evidence-consumer-list article { display: grid; gap: 4px; padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,.035); }
.evidence-consumer-list span { color: rgba(111,220,255,.74); font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
.activity-summary { padding: 0 4px 20px; color: rgba(255,255,255,.58); }
.system-surface { padding: 18px 0 24px; }
.system-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
@media (max-width: 760px) {
  .result-depth-grid { grid-template-columns: 1fr; }
  .result-intro { border-radius: 20px; padding: 24px 18px; }
  .starter-actions { gap: 6px; }
  .starter-action { padding: 7px 10px; }
}
'''
    STYLES.write_text(styles)
