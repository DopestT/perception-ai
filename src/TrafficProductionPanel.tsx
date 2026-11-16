import { useMemo, useState } from 'react'
import { Copy, ShieldCheck } from 'lucide-react'
import { buildTrafficPack } from './lib/traffic-production'
import type { GrowthDashboard } from './lib/growth-operator-client'

type Props = {
  projectId: string
  dashboard: GrowthDashboard | null
}

export function TrafficProductionPanel({ projectId, dashboard }: Props) {
  const pack = useMemo(() => buildTrafficPack(projectId, dashboard), [projectId, dashboard])
  const [copyStatus, setCopyStatus] = useState('')

  async function copyDraft(copy: string, label: string) {
    try {
      await navigator.clipboard.writeText(copy)
      setCopyStatus(label + ' copied locally; nothing has been published.')
    } catch {
      setCopyStatus('Clipboard permission unavailable; you can select the draft text instead.')
    }
  }

  return (
    <section className="world-card world-card--wide" aria-labelledby="traffic-production-title">
      <div className="world-heading">
        <div>
          <p className="card-label">TRAFFIC PRODUCTION MACHINE · V0.2 · REVIEW ONLY</p>
          <h2 id="traffic-production-title">One observed problem. Three useful ways to reach people.</h2>
          <p>Search answer, short-form demonstration, and community help are drafted only from this Project World's own site scan. No publishing, sending, ads, or audience routing occurs here.</p>
        </div>
        <div className="world-status">
          <strong>{pack.drafts.length}</strong>
          <span>review drafts</span>
        </div>
      </div>
      <p className="growth-empty" role="status">{pack.message}</p>
      {pack.drafts.length > 0 && (
        <div className="growth-opportunity-list">
          {pack.drafts.map((draft) => (
            <div className="growth-opportunity" key={draft.id}>
              <div>
                <p className="card-label">{draft.label.toUpperCase()} · APPROVAL REQUIRED</p>
                <h3>{draft.hook}</h3>
                <p>{draft.assetBrief}</p>
                <p><strong>Source:</strong> <a href={draft.evidenceUrl} target="_blank" rel="noopener noreferrer">{draft.evidenceUrl}</a></p>
                <p><strong>Conversion to verify:</strong> {draft.conversionEvent}. Site-gap score: {draft.opportunityScore} (not projected traffic).</p>
                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontFamily: 'inherit' }}>{draft.copy}</pre>
                <button className="quiet-action" type="button" onClick={() => void copyDraft(draft.copy, draft.label)}>
                  <Copy size={14} /> COPY REVIEW DRAFT
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="growth-empty"><ShieldCheck size={15} /> Every draft requires verified claims, actual audience research, permission to distribute, and conversion evidence. No generated content is represented as published.</p>
      {copyStatus && <p role="status" className="hero-notice">{copyStatus}</p>}
    </section>
  )
}
