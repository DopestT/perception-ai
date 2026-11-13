import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, CircleHelp, Clock3, Compass, LockKeyhole, Search, X } from 'lucide-react'
import type { ExperienceMode } from './PlasmaPortal'
import './z-companion.css'

type ZCompanionProps = {
  experienceMode: ExperienceMode
  signedIn: boolean
  hasSavedWork: boolean
  savedWorkStatus: string | null
  checkingWork: boolean
  isBusy: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onStart: (mode: ExperienceMode, idea: string) => void
  onViewWork: () => void
  onCheckWork: () => void
  onOpenAccount: () => void
}

/** Same translucent body / flexible tail silhouette as the ambient plasma fish. */
function ZFishMark() {
  const gradientId = useId().replaceAll(':', '')
  return <svg className="z-fish-mark" aria-hidden="true" viewBox="0 0 100 64" fill="none">
    <defs>
      <linearGradient id={gradientId} x1="10" y1="8" x2="86" y2="56">
        <stop offset="0" stopColor="var(--z-teal)" stopOpacity=".55"/>
        <stop offset=".56" stopColor="var(--z-teal)" stopOpacity=".86"/>
        <stop offset="1" stopColor="var(--z-coral)" stopOpacity=".65"/>
      </linearGradient>
    </defs>
    <path d="M31 31 Q14 18 5 6 Q13 30 4 58 Q18 41 32 34" fill="var(--z-coral)" fillOpacity=".43"/>
    <path d="M40 23 Q51 5 69 17 L58 26 M40 40 Q48 57 69 45 L58 36" fill="var(--z-teal)" fillOpacity=".33"/>
    <path d="M87 32 C75 19 52 14 37 22 C28 26 26 35 36 41 C54 50 76 42 87 32Z"
      fill={`url(#${gradientId})`} stroke="var(--z-teal)" strokeOpacity=".34" strokeWidth="1.5"/>
    <path d="M60 24 Q51 32 62 40 M52 33 Q47 43 37 44" stroke="var(--z-coral)" strokeOpacity=".55" strokeWidth="1.4"/>
    <circle cx="76" cy="29" r="2" fill="#fff9ed" fillOpacity=".85"/>
  </svg>
}

/**
 * User-invoked product guide, not an AI model or a separate agent.
 * All actions delegate to existing PERCEPTION UI and preserve permissions.
 */
export function ZCompanion({
  experienceMode, signedIn, hasSavedWork, savedWorkStatus, checkingWork, isBusy,
  open, onOpenChange, onStart, onViewWork, onCheckWork, onOpenAccount,
}: ZCompanionProps) {
  const [draft, setDraft] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
      else triggerRef.current?.focus({ preventScroll: true })
    }
  }, [open])

  const takeToFrontDoor = (mode: ExperienceMode, idea = '') => {
    if (isBusy) return
    onStart(mode, idea)
    onOpenChange(false)
  }

  const submitIdea = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const idea = draft.trim()
    if (!idea || isBusy) return
    // This moves text into the normal Perception composer. It never submits it.
    takeToFrontDoor(experienceMode, idea.slice(0, 500))
    setDraft('')
  }

  const recordedStatus = savedWorkStatus?.trim()
    ? savedWorkStatus.replace(/_/g, ' ')
    : 'unknown'

  return <aside className={`z-companion z-companion--${experienceMode}`} aria-label="Z, the Perception fish helper">
    <section
      ref={panelRef}
      tabIndex={-1}
      role="region"
      id="z-companion-panel"
      className="z-companion-panel"
      aria-labelledby="z-companion-heading"
      hidden={!open}
    >
      <div className="z-companion-head">
        <div className="z-companion-identity">
          <span className="z-companion-emblem" aria-hidden="true"><ZFishMark /></span>
          <div>
            <p>Z’help / YOUR TINY GUIDE</p>
            <h2 id="z-companion-heading">What can I help you find?</h2>
          </div>
        </div>
        <button className="z-companion-close" type="button" aria-label="Close Z help" onClick={() => onOpenChange(false)}><X size={18} aria-hidden="true"/></button>
      </div>
      <p className="z-companion-intro">
        I'm here for quick directions. PERCEPTION handles your ideas and work; you decide when anything is submitted.
      </p>

      <div className="z-companion-shortcuts" aria-label="Quick help actions">
        <button type="button" onClick={() => takeToFrontDoor('discover')} disabled={isBusy}>
          <Compass size={18} aria-hidden="true"/>
          <span><strong>Start a new idea</strong><small>Open the idea composer</small></span>
          <ArrowRight size={17} aria-hidden="true"/>
        </button>
        <button type="button" onClick={() => takeToFrontDoor('search')} disabled={isBusy}>
          <Search size={18} aria-hidden="true"/>
          <span><strong>Research something</strong><small>Choose PERCEPTION's search mode</small></span>
          <ArrowRight size={17} aria-hidden="true"/>
        </button>
        {signedIn && hasSavedWork ? (
          <>
            <button type="button" onClick={() => { onViewWork(); onOpenChange(false) }} disabled={isBusy}>
              <CheckCircle2 size={18} aria-hidden="true"/>
              <span><strong>See my saved work</strong><small>Recorded status: {recordedStatus}</small></span>
              <ArrowRight size={17} aria-hidden="true"/>
            </button>
            <button type="button" disabled={checkingWork || isBusy} aria-busy={checkingWork} onClick={onCheckWork}>
              <Clock3 size={18} aria-hidden="true"/>
              <span><strong>{checkingWork ? 'Checking saved status…' : 'Check saved status'}</strong><small>Refresh existing project records only</small></span>
              <ArrowRight size={17} aria-hidden="true"/>
            </button>
          </>
        ) : (
          <button type="button" disabled={isBusy} onClick={() => {
            if (signedIn) takeToFrontDoor('perceive')
            else { onOpenAccount(); onOpenChange(false) }
          }}>
            {signedIn ? <CircleHelp size={18} aria-hidden="true"/> : <LockKeyhole size={18} aria-hidden="true"/>}
            <span>
              <strong>{signedIn ? 'Create your first project' : 'Sign in to save work'}</strong>
              <small>{signedIn ? 'Start with an idea' : 'Use the existing secure account form'}</small>
            </span>
            <ArrowRight size={17} aria-hidden="true"/>
          </button>
        )}
      </div>
      {isBusy && <p className="z-companion-busy" role="status">Current work is active. These shortcuts will be available when it finishes.</p>}

      <form className="z-companion-compose" onSubmit={submitIdea}>
        <label htmlFor="z-companion-idea">Have something in mind?</label>
        <div>
          <input
            id="z-companion-idea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            placeholder="Tell PERCEPTION what you'd like to do"
            autoComplete="off"
          />
          <button type="submit" disabled={!draft.trim() || isBusy} aria-label="Bring idea to the Perception composer">
            <ArrowRight size={18} aria-hidden="true"/>
          </button>
        </div>
        <small>This fills the main input. Nothing runs until you submit it there.</small>
      </form>
    </section>

    <button
      ref={triggerRef}
      type="button"
      className="z-companion-trigger"
      aria-label={open ? 'Close Z’help' : 'Open Z’help'}
      aria-expanded={open}
      aria-controls="z-companion-panel"
      onClick={() => onOpenChange(!open)}
    >
      <ZFishMark />
      <span>Z’help</span>
    </button>
  </aside>
}
