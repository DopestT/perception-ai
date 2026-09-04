export type BeliefState =
  | 'observed'
  | 'inferred'
  | 'confirmed'
  | 'unknown'
  | 'rejected'
  | 'stale'

export type BeliefScope = 'user' | 'project' | 'task'

export interface Belief {
  id: string
  scope: BeliefScope
  statement: string
  state: BeliefState
  confidence: number
  evidence: string[]
  lastUpdated: string
  contradictions: string[]
  routeImpact: string
  needsConfirmation: boolean
}

export interface GoalModel {
  id: string
  name: string
  desiredReality: string
  currentReality: string
  beliefs: Belief[]
}

export interface PerceptionModel {
  goal: GoalModel
  lastInput: string
}

const now = () => new Date().toISOString()
const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export const stateOrder: BeliefState[] = [
  'confirmed',
  'observed',
  'inferred',
  'unknown',
  'stale',
  'rejected',
]

export function createModel(topic = 'deer'): PerceptionModel {
  return {
    lastInput: topic,
    goal: {
      id: id(),
      name: topic || 'Untitled idea',
      desiredReality: 'Not known yet',
      currentReality: topic ? `The user has introduced the topic “${topic}.”` : 'No idea has been expressed yet.',
      beliefs: topic ? seedTopicBeliefs(topic) : [],
    },
  }
}

function seedTopicBeliefs(topic: string): Belief[] {
  return [
    makeBelief({
      scope: 'task',
      statement: `The user introduced “${topic}.”`,
      state: 'observed',
      confidence: 1,
      evidence: [`Direct user input: “${topic}”`],
      routeImpact: 'This establishes the subject but not the desired outcome.',
      needsConfirmation: false,
    }),
    makeBelief({
      scope: 'task',
      statement: `The user may want to explore information or possibilities around ${topic}.`,
      state: 'inferred',
      confidence: 0.28,
      evidence: ['Single-topic input with no explicit action or outcome.'],
      routeImpact: 'Keep exploration broad until intent becomes clearer.',
      needsConfirmation: true,
    }),
    makeBelief({
      scope: 'task',
      statement: `Why ${topic} matters to the user is not known yet.`,
      state: 'unknown',
      confidence: 1,
      evidence: ['No purpose, problem, or desired outcome has been supplied.'],
      routeImpact: 'Do not prematurely route the project toward one interpretation.',
      needsConfirmation: false,
    }),
  ]
}

function makeBelief(input: Omit<Belief, 'id' | 'lastUpdated' | 'contradictions'> & { contradictions?: string[] }): Belief {
  return {
    id: id(),
    lastUpdated: now(),
    contradictions: input.contradictions ?? [],
    ...input,
  }
}

export function perceiveInput(model: PerceptionModel, rawInput: string): PerceptionModel {
  const input = rawInput.trim()
  if (!input) return model

  const nextBeliefs = [...model.goal.beliefs]
  nextBeliefs.push(
    makeBelief({
      scope: 'task',
      statement: `The user said: “${input}”`,
      state: 'observed',
      confidence: 1,
      evidence: [`Direct user input: “${input}”`],
      routeImpact: 'Use this as new evidence when updating the goal model.',
      needsConfirmation: false,
    }),
  )

  const normalized = input.toLowerCase()
  if (normalized.includes('i want') || normalized.includes('i need') || normalized.includes('my goal')) {
    nextBeliefs.push(
      makeBelief({
        scope: 'project',
        statement: 'The user has supplied an explicit desired outcome.',
        state: 'inferred',
        confidence: 0.82,
        evidence: [`Goal-like language detected in: “${input}”`],
        routeImpact: 'The Reality Route can begin narrowing around the stated outcome.',
        needsConfirmation: true,
      }),
    )
  } else {
    nextBeliefs.push(
      makeBelief({
        scope: 'task',
        statement: 'The desired outcome is still only partially resolved.',
        state: 'unknown',
        confidence: 1,
        evidence: ['The latest input adds context without clearly defining completion.'],
        routeImpact: 'Continue perceiving before committing to a route.',
        needsConfirmation: false,
      }),
    )
  }

  return {
    ...model,
    lastInput: input,
    goal: {
      ...model.goal,
      currentReality: `Perception has ${nextBeliefs.filter((belief) => belief.state === 'observed').length} direct observations and is separating them from inference.`,
      beliefs: nextBeliefs,
    },
  }
}

export function setBeliefState(model: PerceptionModel, beliefId: string, state: BeliefState): PerceptionModel {
  return {
    ...model,
    goal: {
      ...model.goal,
      beliefs: model.goal.beliefs.map((belief) =>
        belief.id === beliefId
          ? {
              ...belief,
              state,
              confidence: state === 'confirmed' || state === 'observed' ? 1 : belief.confidence,
              needsConfirmation: state === 'inferred',
              lastUpdated: now(),
            }
          : belief,
      ),
    },
  }
}

export function summarizeModel(model: PerceptionModel) {
  const counts = model.goal.beliefs.reduce<Record<BeliefState, number>>(
    (acc, belief) => {
      acc[belief.state] += 1
      return acc
    },
    { observed: 0, inferred: 0, confirmed: 0, unknown: 0, rejected: 0, stale: 0 },
  )

  return {
    ...counts,
    certainty: Math.round(
      (model.goal.beliefs.reduce((sum, belief) => sum + belief.confidence, 0) /
        Math.max(model.goal.beliefs.length, 1)) *
        100,
    ),
  }
}
