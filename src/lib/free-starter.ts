// Free, local-first Perception preview. No auth, network, model, credit or token call.
export type StarterMode = 'discover' | 'perceive' | 'search' | 'forecast'

export type FreeStarter = {
  mode: StarterMode
  statement: string
  heading: string
  nextSteps: readonly [string, string, string]
  limitation: string
  deadline?: string
}

const STEPS: Record<StarterMode, Pick<FreeStarter, 'heading' | 'nextSteps' | 'limitation'>> = {
  discover: {
    heading: 'A starting point for your idea',
    nextSteps: [
      'Name two possible approaches, including one you could try on your own.',
      'Choose a small experiment with a clear result you can observe.',
      'Write down what happened and what you would try next.',
    ],
    limitation: 'This is a local starting guide, not AI-generated research or a completed action.',
  },
  perceive: {
    heading: 'A first route toward your goal',
    nextSteps: [
      'Describe what finished and usable would look like.',
      'List the information, people, permissions, and materials the first step needs.',
      'Choose one reversible action and decide how you will verify its outcome.',
    ],
    limitation: 'This preview does not create a Project World, run an agent, or verify an outcome.',
  },
  search: {
    heading: 'A source-checking plan',
    nextSteps: [
      'Turn your question into specific search terms and a relevant date or location.',
      'Find an original source and independently check its most important claim.',
      'Record the source link, publication date, contradictions, and remaining unknowns.',
    ],
    limitation: 'No live search was performed. No sources or findings are being claimed.',
  },
  forecast: {
    heading: 'A measurable forecast outline',
    nextSteps: [
      'Define a specific yes/no outcome and the date by which it will be judged.',
      'Identify what present-day evidence could support or challenge that outcome.',
      'Choose observable signals to revisit before deciding whether it happened.',
    ],
    limitation: 'No forecast probability, market data, or outside evidence was generated.',
  },
}

export function makeFreeStarter(statement: string, mode: StarterMode, deadline?: string): FreeStarter {
  const trimmed = statement.trim()
  if (!trimmed) throw new Error('A goal is required to start.')
  if (!Object.prototype.hasOwnProperty.call(STEPS, mode)) throw new Error('Unknown starter mode.')
  const template = STEPS[mode]
  return {
    mode,
    statement: trimmed,
    heading: template.heading,
    nextSteps: template.nextSteps,
    limitation: template.limitation,
    ...(mode === 'forecast' && deadline ? { deadline } : {}),
  }
}
