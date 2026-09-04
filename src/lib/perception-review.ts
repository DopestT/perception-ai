import { Belief, PerceptionModel } from './perception-model'

export interface RouteReadiness {
  trustedSignals: number
  unresolvedSignals: number
  correctedSignals: number
  canRoute: boolean
  level: 0 | 1 | 2 | 3
  label: 'IDEA' | 'UNDERSTOOD' | 'MAPPED' | 'ROUTED'
  reason: string
}

const trusted = (belief: Belief) => belief.state === 'observed' || belief.state === 'confirmed'

export function reviewStaleness(
  model: PerceptionModel,
  asOf = Date.now(),
  staleAfterDays = 30,
): PerceptionModel {
  const staleAfterMs = staleAfterDays * 24 * 60 * 60 * 1000

  return {
    ...model,
    goal: {
      ...model.goal,
      beliefs: model.goal.beliefs.map((belief) => {
        if (belief.state !== 'inferred') return belief
        const age = asOf - new Date(belief.lastUpdated).getTime()
        if (!Number.isFinite(age) || age < staleAfterMs) return belief
        return {
          ...belief,
          state: 'stale',
          needsConfirmation: true,
          routeImpact: `${belief.routeImpact} This inference is old enough that it must be re-checked before routing.`
        }
      }),
    },
  }
}

export function getRouteReadiness(model: PerceptionModel): RouteReadiness {
  const trustedSignals = model.goal.beliefs.filter(trusted).length
  const unresolvedSignals = model.goal.beliefs.filter(
    (belief) => belief.state === 'unknown' || belief.state === 'inferred' || belief.state === 'stale',
  ).length
  const correctedSignals = model.goal.beliefs.filter((belief) => belief.state === 'rejected').length
  const hasConfirmedGoal = model.goal.beliefs.some(
    (belief) => belief.scope === 'project' && belief.state === 'confirmed',
  )
  const hasOpenUnknowns = model.goal.beliefs.some((belief) => belief.state === 'unknown')
  const hasUnconfirmedInference = model.goal.beliefs.some(
    (belief) => belief.state === 'inferred' && belief.needsConfirmation,
  )

  if (trustedSignals === 0) {
    return {
      trustedSignals,
      unresolvedSignals,
      correctedSignals,
      canRoute: false,
      level: 0,
      label: 'IDEA',
      reason: 'Perception needs at least one direct observation before it can model the goal.'
    }
  }

  if (!hasConfirmedGoal) {
    return {
      trustedSignals,
      unresolvedSignals,
      correctedSignals,
      canRoute: false,
      level: 1,
      label: 'UNDERSTOOD',
      reason: 'The subject is understood, but the desired reality has not been explicitly confirmed.'
    }
  }

  if (hasOpenUnknowns || hasUnconfirmedInference) {
    return {
      trustedSignals,
      unresolvedSignals,
      correctedSignals,
      canRoute: false,
      level: 2,
      label: 'MAPPED',
      reason: 'The goal is confirmed, but unresolved assumptions still affect the Reality Map.'
    }
  }

  return {
    trustedSignals,
    unresolvedSignals,
    correctedSignals,
    canRoute: true,
    level: 3,
    label: 'ROUTED',
    reason: 'Enough trusted evidence exists to select a route without silently relying on unresolved guesses.'
  }
}
