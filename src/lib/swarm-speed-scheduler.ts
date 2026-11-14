import { planSwarm, SWARM_ROSTER, type SwarmPolicy, type SwarmTask } from './perception-swarm'

/**
 * Speed-first, deterministic DRY-RUN scheduler for existing PERCEPTION tasks.
 * No provider calls, agent launches, background work, database writes, or
 * authority delegation. Estimates are explicitly NOT measured timings.
 */
export type SwarmDurationEstimate = Readonly<{
  taskId: string
  estimatedSeconds: number
}>

export type ScheduledSwarmTask = Readonly<{
  taskId: string
  ownerAgentId: string
  reviewer: boolean
  startSeconds: number
  finishSeconds: number
  criticalPathRemainingSeconds: number
}>

export type FastSwarmSchedule = Readonly<{
  accepted: boolean
  violations: string[]
  schedule: readonly ScheduledSwarmTask[]
  simulatedSerialSeconds: number | null
  simulatedMakespanSeconds: number | null
  theoreticalCriticalPathSeconds: number | null
  estimatedSpeedup: number | null
  /** Always false: this schedule never executes a worker. */
  executed: false
}>

const reviewerIds = new Set(SWARM_ROSTER.filter(role => role.canVerify).map(role => role.agentId))

/**
 * Uses longest-remaining-dependent-work-first scheduling. The strategy tends
 * to keep expensive dependency chains flowing instead of filling worker slots
 * with small independent tasks. Independent reviewer lanes run concurrently.
 *
 * Returned time/speedup estimates are comparisons of hypothetical task
 * durations supplied by the caller, NOT real performance measurements.
 */
export function scheduleFastSwarm(
  tasks: readonly SwarmTask[],
  policy: SwarmPolicy,
  estimates: readonly SwarmDurationEstimate[],
  now = new Date(),
): FastSwarmSchedule {
  const deny = (violations: string[]): FastSwarmSchedule => ({
    accepted: false, violations, schedule: [], simulatedSerialSeconds: null,
    simulatedMakespanSeconds: null, theoreticalCriticalPathSeconds: null,
    estimatedSpeedup: null, executed: false,
  })
  const validated = planSwarm(tasks, policy, now)
  if (!validated.accepted) return deny(validated.violations)

  const estimateMap = new Map<string, number>()
  for (const estimate of estimates) {
    if (estimateMap.has(estimate.taskId)) return deny(['duplicate_duration_estimate'])
    if (!Number.isFinite(estimate.estimatedSeconds)
      || estimate.estimatedSeconds <= 0
      || estimate.estimatedSeconds > 3600) return deny(['duration_estimate_out_of_bounds'])
    estimateMap.set(estimate.taskId, estimate.estimatedSeconds)
  }
  if (estimateMap.size !== tasks.length || tasks.some(task => !estimateMap.has(task.taskId))) {
    return deny(['duration_estimate_missing_or_extra'])
  }

  const dependents = new Map(tasks.map(task => [task.taskId, [] as string[]]))
  for (const task of tasks) {
    for (const dep of task.dependencyIds) dependents.get(dep)?.push(task.taskId)
  }
  const remaining = new Map<string, number>()
  function criticalRemaining(id: string): number {
    if (remaining.has(id)) return remaining.get(id)!
    const tail = Math.max(0, ...(dependents.get(id) ?? []).map(criticalRemaining))
    const duration = estimateMap.get(id)!
    const length = duration + tail
    remaining.set(id, length)
    return length
  }
  for (const task of tasks) criticalRemaining(task.taskId)

  const finished = new Set<string>()
  const launched = new Set<string>()
  const active: ScheduledSwarmTask[] = []
  const schedule: ScheduledSwarmTask[] = []
  const slots = {
    builders: policy.maxConcurrentBuilders,
    reviewers: policy.maxConcurrentReviewers,
  }
  let clock = 0
  for (let iteration = 0; iteration < tasks.length * 2 + 1 && finished.size < tasks.length; iteration++) {
    const available = tasks.filter(task =>
      !launched.has(task.taskId)
      && task.dependencyIds.every(dep => finished.has(dep)),
    ).sort((a, b) => (
      criticalRemaining(b.taskId) - criticalRemaining(a.taskId)
      || a.taskId.localeCompare(b.taskId)
    ))

    for (const task of available) {
      const reviewer = reviewerIds.has(task.ownerAgentId)
      const occupied = active.filter(item => item.reviewer === reviewer).length
      const allowed = reviewer ? slots.reviewers : slots.builders
      if (occupied >= allowed) continue
      const scheduled: ScheduledSwarmTask = {
        taskId: task.taskId,
        ownerAgentId: task.ownerAgentId,
        reviewer,
        startSeconds: clock,
        finishSeconds: clock + estimateMap.get(task.taskId)!,
        criticalPathRemainingSeconds: criticalRemaining(task.taskId),
      }
      schedule.push(scheduled)
      active.push(scheduled)
      launched.add(task.taskId)
    }

    if (active.length === 0) return deny(['scheduler_stalled'])
    const nextFinish = Math.min(...active.map(item => item.finishSeconds))
    clock = nextFinish
    for (let index = active.length - 1; index >= 0; index--) {
      if (active[index].finishSeconds <= clock) {
        finished.add(active[index].taskId)
        active.splice(index, 1)
      }
    }
  }
  if (finished.size !== tasks.length) return deny(['scheduler_incomplete'])

  const simulatedSerialSeconds = tasks.reduce((total, task) => total + estimateMap.get(task.taskId)!, 0)
  const theoreticalCriticalPathSeconds = Math.max(...remaining.values())
  const simulatedMakespanSeconds = Math.max(...schedule.map(task => task.finishSeconds))
  return {
    accepted: true,
    violations: [],
    schedule,
    simulatedSerialSeconds,
    simulatedMakespanSeconds,
    theoreticalCriticalPathSeconds,
    estimatedSpeedup: simulatedSerialSeconds / simulatedMakespanSeconds,
    executed: false,
  }
}
