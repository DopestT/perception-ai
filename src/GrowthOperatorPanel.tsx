import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Play, RefreshCw, Rocket, ScanSearch } from 'lucide-react'
import {
  configureGrowthSite,
  getGrowthDashboard,
  queueTopGrowthOpportunities,
  scanGrowthSite,
  type GrowthDashboard,
} from './lib/growth-operator-client'

type Props = {
  projectId: string
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function GrowthOperatorPanel({ projectId }: Props) {
  const [dashboard, setDashboard] = useState<GrowthDashboard | null>(null)
  const [siteUrl, setSiteUrl] = useState('https://www.letmeteachyouai.com/')
  const [repository, setRepository] = useState('DopestT/Let-Me-Teach-You-AI')
  const [primaryGoal, setPrimaryGoal] = useState('Increase qualified email signups from people learning AI by building practical projects.')
  const [conversionEvent, setConversionEvent] = useState('newsletter_signup')
  const [busy, setBusy] = useState<'load' | 'configure' | 'scan' | 'queue' | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setBusy('load')
    setError('')
    try {
      const next = await getGrowthDashboard(projectId)
      setDashboard(next)
      if (next.site) {
        setSiteUrl(next.site.site_url)
        setRepository(next.site.repository || '')
        setPrimaryGoal(next.site.primary_goal)
        setConversionEvent(next.site.conversion_event)
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Growth Operator status is unavailable.'
      if (!/not configured|not found/i.test(message)) setError(message)
    } finally {
      setBusy(null)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const saveConfiguration = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy('configure')
    setError('')
    setNote('')
    try {
      await configureGrowthSite({
        projectId,
        siteUrl,
        repository,
        primaryGoal,
        conversionEvent,
        publishingMode: 'approval',
      })
      setDashboard(await getGrowthDashboard(projectId))
      setNote('Growth site configured. Publishing remains approval-required.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not configure Growth Operator.')
    } finally {
      setBusy(null)
    }
  }

  const scan = async () => {
    if (busy || !dashboard?.site) return
    setBusy('scan')
    setError('')
    setNote('Scanning the site and building a ranked opportunity inventory…')
    try {
      await scanGrowthSite(projectId)
      setDashboard(await getGrowthDashboard(projectId))
      setNote('Scan complete. The highest-value observed gaps are ranked below.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Growth scan failed.')
      setNote('')
    } finally {
      setBusy(null)
    }
  }

  const queue = async () => {
    if (busy || !dashboard?.latest_run) return
    setBusy('queue')
    setError('')
    setNote('Queueing the top bounded jobs into the Perception Execution Ledger…')
    try {
      const result = await queueTopGrowthOpportunities(projectId, 10)
      setDashboard(await getGrowthDashboard(projectId))
      setNote(result.queued.length + ' bounded growth job' + (result.queued.length === 1 ? '' : 's') + ' queued for approval-first execution.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not queue growth jobs.')
      setNote('')
    } finally {
      setBusy(null)
    }
  }

  const baseline = dashboard?.latest_run?.baseline ?? {}
  const proposed = useMemo(
    () => (dashboard?.opportunities ?? []).filter((item) => item.status === 'proposed').slice(0, 10),
    [dashboard],
  )

  return (
    <article className="world-card world-card--wide" aria-labelledby="growth-operator-title">
      <div className="world-heading">
        <div>
          <p className="card-label">GROWTH OPERATOR · V0.1</p>
          <h2 id="growth-operator-title">Objective → observed gap → bounded job → verification.</h2>
          <p>Perception owns the decision and evidence loop. Publishing stays approval-required while this system proves itself.</p>
        </div>
        {dashboard?.latest_run && (
          <div className="world-status">
            <strong>{numberValue(baseline.pages_scanned)}</strong>
            <span>pages scanned</span>
          </div>
        )}
      </div>

      <form onSubmit={saveConfiguration} className="growth-operator-form">
        <label>
          <span>SITE</span>
          <input value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} type="url" required disabled={Boolean(busy)} />
        </label>
        <label>
          <span>REPOSITORY</span>
          <input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repo" disabled={Boolean(busy)} />
        </label>
        <label className="growth-operator-form--wide">
          <span>PRIMARY BUSINESS GOAL</span>
          <input value={primaryGoal} onChange={(event) => setPrimaryGoal(event.target.value)} required disabled={Boolean(busy)} />
        </label>
        <label>
          <span>CONVERSION EVENT</span>
          <input value={conversionEvent} onChange={(event) => setConversionEvent(event.target.value)} placeholder="newsletter_signup" disabled={Boolean(busy)} />
        </label>
        <button className="continue-route" type="submit" disabled={Boolean(busy)}>
          {busy === 'configure' ? 'SAVING…' : dashboard?.site ? 'UPDATE CONFIG' : 'CONNECT SITE'}
        </button>
      </form>

      {dashboard?.site && (
        <div className="growth-operator-actions">
          <button className="continue-route" type="button" onClick={scan} disabled={Boolean(busy)}>
            <ScanSearch size={14} /> {busy === 'scan' ? 'SCANNING…' : 'RUN SCAN'}
          </button>
          <button className="quiet-action" type="button" onClick={queue} disabled={Boolean(busy) || !dashboard.latest_run || proposed.length === 0}>
            <Rocket size={14} /> {busy === 'queue' ? 'QUEUEING…' : 'QUEUE TOP 10'}
          </button>
          <button className="quiet-action" type="button" onClick={() => void load()} disabled={Boolean(busy)}>
            <RefreshCw size={14} /> REFRESH
          </button>
        </div>
      )}

      {dashboard?.latest_run && (
        <>
          <div className="trust-summary" aria-label="Growth scan baseline">
            <div><span>DISCOVERED</span><strong>{numberValue(baseline.pages_discovered)}</strong><small>site URLs</small></div>
            <div><span>INDEXABLE</span><strong>{numberValue(baseline.indexable_pages)}</strong><small>scanned pages</small></div>
            <div><span>CTA</span><strong>{numberValue(baseline.pages_with_conversion_cta)}</strong><small>conversion paths</small></div>
            <div><span>PROPOSED</span><strong>{proposed.length}</strong><small>top visible jobs</small></div>
          </div>

          <div className="growth-opportunity-list">
            {proposed.length ? proposed.map((opportunity, index) => (
              <div className="growth-opportunity" key={opportunity.id}>
                <div className="growth-opportunity-rank">{index + 1}</div>
                <div>
                  <strong>{opportunity.title}</strong>
                  <p>{opportunity.rationale}</p>
                  <small>{opportunity.target_path} · score {opportunity.score}</small>
                </div>
              </div>
            )) : (
              <p className="growth-empty"><CheckCircle2 size={15} /> No unqueued opportunities remain in the latest scan.</p>
            )}
          </div>
        </>
      )}

      {!dashboard?.site && (
        <p className="growth-empty"><Play size={15} /> Connect the LMTYAI proof site, then run the first baseline scan.</p>
      )}
      {note && <p className="hero-notice" role="status"><CheckCircle2 size={14} /> {note}</p>}
      {error && <p className="hero-error" role="alert">{error}</p>}
    </article>
  )
}
