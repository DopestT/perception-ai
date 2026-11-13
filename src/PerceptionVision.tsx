import { ArrowDownRight, ArrowUpRight, BrainCircuit, CheckCheck, Compass, Fingerprint, Lightbulb, MoveUpRight, ShieldCheck, Sparkles } from 'lucide-react'
import type { ExperienceMode } from './PlasmaPortal'
import './perception-vision.css'

type PerceptionVisionProps = {
  onStart: (prompt: string, mode: ExperienceMode) => void
}

const journeys: Array<{
  number: string
  eyebrow: string
  title: string
  description: string
  example: string
  prompt: string
  mode: ExperienceMode
}> = [
  {
    number: '01',
    eyebrow: 'DISCOVER',
    title: 'Follow the possibility.',
    description: 'Start with a curiosity, an unfinished thought, or a question you have never known how to ask.',
    example: 'I want to explore a new idea for...',
    prompt: 'Help me explore an idea for ',
    mode: 'discover',
  },
  {
    number: '02',
    eyebrow: 'UNDERSTAND',
    title: 'Find a clearer picture.',
    description: 'Look for evidence, consider competing explanations, and separate what is known from what is assumed.',
    example: 'What evidence supports the idea that...',
    prompt: 'Research the evidence for ',
    mode: 'search',
  },
  {
    number: '03',
    eyebrow: 'CREATE',
    title: 'Give your idea a first form.',
    description: 'Turn your intention into a route, identify a first useful step, and review progress before moving forward.',
    example: 'Help me create something that...',
    prompt: 'Help me create ',
    mode: 'perceive',
  },
]

const steps = [
  { number: '01', label: 'Imagine', description: 'You bring the idea. Perception starts by listening.' },
  { number: '02', label: 'Understand', description: 'It interprets the goal and identifies the unknowns.' },
  { number: '03', label: 'Make a route', description: 'It proposes useful steps and respects permission boundaries.' },
  { number: '04', label: 'Verify', description: 'It distinguishes attempts from actual, evidenced outcomes.' },
]

export function PerceptionVision({ onStart }: PerceptionVisionProps) {
  return (
    <div className="perception-vision" id="vision">
      <section className="vision-introduction" aria-labelledby="vision-heading">
        <div className="vision-introduction-copy">
          <p className="vision-eyebrow"><span className="vision-signal" aria-hidden="true" /> THE REASON WE EXIST</p>
          <h2 id="vision-heading">Human imagination is <em>the beginning.</em></h2>
          <p className="vision-intro-text">The most important part of any invention has never been the machinery. It is the person who saw something that did not exist yet.</p>
          <a className="vision-text-link" href="#possibilities">See where an idea can go <ArrowDownRight size={18} aria-hidden="true" /></a>
        </div>
        <div className="vision-orbit" aria-hidden="true">
          <span className="vision-orbit-ring vision-orbit-ring--one" />
          <span className="vision-orbit-ring vision-orbit-ring--two" />
          <span className="vision-orbit-ring vision-orbit-ring--three" />
          <span className="vision-orbit-center"><Sparkles size={44} strokeWidth={1} /></span>
          <span className="vision-orbit-label vision-orbit-label--a">IMAGINE</span>
          <span className="vision-orbit-label vision-orbit-label--b">BECOME</span>
        </div>
      </section>

      <section className="vision-belief" aria-label="Our philosophy">
        <span className="vision-belief-number">001 / THE BELIEF</span>
        <blockquote>“We don’t replace human imagination. <em>We give it the power to become reality.</em>”</blockquote>
        <span className="vision-belief-signature">PERCEPTION · MADE FOR THE IMAGINATIVE</span>
      </section>

      <section className="vision-possibilities" id="possibilities" aria-labelledby="possibilities-heading">
        <div className="vision-section-heading">
          <div>
            <p className="vision-eyebrow">YOUR CURIOSITY IS ENOUGH TO BEGIN</p>
            <h2 id="possibilities-heading">Three doors. <em>Endless directions.</em></h2>
          </div>
          <p>You don’t need a perfect prompt or a technical background. Choose a direction, then make it your own.</p>
        </div>
        <div className="vision-journey-grid">
          {journeys.map((journey) => (
            <article className="vision-journey" key={journey.number}>
              <div className="vision-journey-top"><span>{journey.number}</span><span>{journey.eyebrow}</span></div>
              <div className="vision-journey-symbol" aria-hidden="true">
                {journey.mode === 'discover' ? <Compass size={28} strokeWidth={1.4} /> : journey.mode === 'search' ? <BrainCircuit size={28} strokeWidth={1.4} /> : <Lightbulb size={28} strokeWidth={1.4} />}
              </div>
              <h3>{journey.title}</h3>
              <p>{journey.description}</p>
              <span className="vision-example">{journey.example}</span>
              <button type="button" className="vision-journey-action" onClick={() => onStart(journey.prompt, journey.mode)}>
                TRY THIS DIRECTION <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="vision-method" id="how-it-works" aria-labelledby="method-heading">
        <div className="vision-method-intro">
          <p className="vision-eyebrow">IMAGINATION, WITH A WAY FORWARD</p>
          <h2 id="method-heading">Not magic.<br /><em>Meaningful steps.</em></h2>
          <p>Perception is designed to turn an intention into understandable work—not to pretend that saying something makes it happen.</p>
          <a className="vision-text-link" href="#vision-principles">See our principles <ArrowDownRight size={18} aria-hidden="true" /></a>
        </div>
        <ol className="vision-steps">
          {steps.map((step) => (
            <li key={step.number}>
              <span className="vision-step-number">{step.number}</span>
              <div><h3>{step.label}</h3><p>{step.description}</p></div>
              <MoveUpRight size={18} strokeWidth={1.3} aria-hidden="true" />
            </li>
          ))}
        </ol>
      </section>

      <section className="vision-principles" id="vision-principles" aria-labelledby="principles-heading">
        <div className="vision-principles-top">
          <p className="vision-eyebrow">OUR PROMISE IS IN THE PROCESS</p>
          <h2 id="principles-heading">A powerful tool should leave the human <em>in charge.</em></h2>
        </div>
        <div className="vision-principle-grid">
          <article><Fingerprint size={23} strokeWidth={1.5} aria-hidden="true" /><h3>Your imagination stays yours.</h3><p>Perception is here to support original thinking, not replace the person behind it.</p></article>
          <article><ShieldCheck size={23} strokeWidth={1.5} aria-hidden="true" /><h3>Your approval matters.</h3><p>Consequential actions require review. An idea is never automatic authorization to act.</p></article>
          <article><CheckCheck size={23} strokeWidth={1.5} aria-hidden="true" /><h3>Evidence before applause.</h3><p>A plan is not a finished result. An opinion is not a fact. We should show the difference.</p></article>
        </div>
      </section>
      <section className="vision-final-cta" aria-label="Start creating with Perception">
        <div>
          <p className="vision-eyebrow">IT STARTS WITH YOU</p>
          <h2>What would you make <em>if you could begin anywhere?</em></h2>
        </div>
        <button type="button" onClick={() => onStart('Help me turn my idea into something real: ', 'perceive')}>
          BRING YOUR IDEA <ArrowUpRight size={18} aria-hidden="true" />
        </button>
      </section>
    </div>
  )
}
