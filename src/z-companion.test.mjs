import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const companion = readFileSync(new URL('./ZCompanion.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8')
const fish = readFileSync(new URL('./AmbientFish.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('./z-companion.css', import.meta.url), 'utf8')

describe('PERCEPTION Z fish helper — opt-in and evidence-honest', () => {
  it('preserves the approved occasional translucent fish rather than replacing it', () => {
    expect(app).toContain('<AmbientFish experienceMode={experienceMode} onSelect={() => setZOpen(true)} />')
    expect(fish).toContain('encounterDuration(passage)')
    expect(fish).toContain('encounterDelay(passage)')
    expect(fish).toContain('prefers-reduced-motion: reduce')
    expect(fish).toContain('target.style.pointerEvents')
  })

  it('provides a small user-invoked accessible trigger with no auto-opening behavior', () => {
    expect(app).toContain('const [zOpen, setZOpen] = useState(false)')
    expect(companion).toContain('open, onOpenChange')
    expect(companion).toContain('Open Z’help')
    expect(companion).toContain('aria-expanded={open}')
    expect(companion).toContain('<span>Z’help</span>')
    expect(companion).toContain('aria-controls="z-companion-panel"')
    expect(companion).toContain('hidden={!open}')
    expect(companion).toContain("event.key === 'Escape'")
    expect(companion).not.toContain('setTimeout(() => setOpen(true)')
    expect(styles).toContain('.z-companion-panel[hidden] { display: none !important; }')
  })

  it('lets people tap the actual swimming fish, not just a separate fixed help control', () => {
    const canvasStyles = readFileSync(new URL('./perception-vision.css', import.meta.url), 'utf8')
    expect(fish).toContain('className="ambient-fish-hit-target"')
    expect(fish).toContain('aria-label="Ask Z, the swimming fish, for help"')
    expect(fish).toContain('onClick={onSelect}')
    expect(fish).toContain('showTarget(path.x * width, path.y * height, size)')
    expect(fish).toContain("target.style.pointerEvents = 'none'")
    expect(fish).toContain("target.style.pointerEvents = 'auto'")
    expect(canvasStyles).toContain('.ambient-fish-hit-target')
    expect(canvasStyles).toContain('z-index: 9')
    expect(canvasStyles).toContain('.ambient-fish-hit-target:focus-visible')
    expect(app).toContain('onOpenChange={setZOpen}')
  })

  it('does not invent a separate AI, API, workflow engine or tracking service', () => {
    for (const forbidden of [
      'supabase.from(', 'fetch(', 'localStorage.setItem(', 'sessionStorage.setItem(',
      'new WebSocket(', 'navigator.sendBeacon(', 'createAgent(', 'startAgent(',
      'submitObjective(', 'executePerceptionGitHubSelfTest(',
    ]) expect(companion).not.toContain(forbidden)
    expect(companion).toContain('not an AI model or a separate agent')
  })

  it('only wires authentic PERCEPTION app actions', () => {
    expect(app).toContain('<ZCompanion')
    expect(app).toContain('onStart={(mode, idea) => {')
    expect(app).toContain('selectExperienceMode(mode)')
    expect(app).toContain('setInput(idea)')
    expect(app).toContain("document.querySelector<HTMLInputElement>('.hero-input-shell input')")
    expect(app).toContain('onCheckWork={() => { void refreshSavedWork() }}')
    expect(app).toContain("document.getElementById('project-world')?.scrollIntoView")
    expect(app).toContain("onOpenAccount={() => { setPortalMode('auth'); setAuthOpen(true) }}")
  })

  it("never auto-submits a user's text", () => {
    expect(companion).toContain('event.preventDefault()')
    expect(companion).toContain('const idea = draft.trim()')
    expect(companion).toContain('takeToFrontDoor(experienceMode, idea.slice(0, 500))')
    expect(companion).toContain('Nothing runs until you submit it there.')
    expect(companion).toContain('maxLength={500}')
  })

  it('respects account access, reports only stored work status and pauses while busy', () => {
    expect(companion).toContain('signedIn && hasSavedWork')
    expect(companion).toContain('Recorded status: {recordedStatus}')
    expect(companion).toContain('Refresh existing project records only')
    expect(companion).toContain('disabled={checkingWork || isBusy}')
    expect(companion).toContain('if (isBusy) return')
    expect(companion).toContain('Current work is active.')
  })

  it('preserves the subtle translucent fish palette and reduced-motion settings', () => {
    expect(companion).toContain('ZFishMark')
    expect(companion).toContain('useId().replaceAll')
    expect(styles).toContain('--z-teal')
    expect(styles).toContain('--z-coral')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(styles).toContain('env(safe-area-inset-bottom)')
    expect(styles).toContain('font-size: 16px')
    expect(styles).toContain('pointer-events: none')
  })
})
