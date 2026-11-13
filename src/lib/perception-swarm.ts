import {
  validateWorkforceTaskContract,
  type WorkforceTaskContract,
} from './workforce-task-contract'

/**
 * Offline PERCEPTION workforce coordinator.
 *
 * Pure planning and review only: there are no model calls, worker dispatches,
 * network calls, permission grants, database writes, cron jobs, or deployments.
 *
 * Canonical authority remains the existing Project World and verification ledgers.
 * An external approved adapter can consume the validated plans in a later phase.
 */
export type SwarmRole =
  | 'research'
  | 'analysis'
  | 'architecture'
  | 'interface'
  | 'backend'
  | 'qa'
  | 'security'
  | 'truth-verification'

export type SwarmTask = WorkforceTaskContract & {
  specialty: SwarmRole
  expectedArtifact: string
  rollbackPlan: string
}

export type SwarmAgent = {
  agentId: string
  role: SwarmRole
  canProposeChanges: boolean
  canVerify: boolean
  allowedPermissionLevels: readonly ('P0' | 'P1')[]
}

export const SWARM_ROSTER: readonly SwarmAgent[] = Object.freeze([
  { agentId: 'research-worker', role: 'research', canProposeChanges: false, canVerify: false, allowedPermissionLevels: ['P0'] },
  { agentId: 'analysis-worker', role: 'analysis', canProposeChanges: false, canVerify: false, allowedPermissionLevels: ['P0'] },
  { agentId: 'architecture-worker', role: 'architecture', canProposeChanges: false, canVerify: false, allowedPermissionLevels: ['P0'] },
  { agentId: 'interface-worker', role: 'interface', canProposeChanges: true, canVerify: false, allowedPermissionLevels: ['P0', 'P1'] },
  { agentId: 'backend-worker', role: 'backend', canProposeChanges: true, canVerify: false, allowedPermissionLevels: ['P0', 'P1'] },
  { agentId: 'qa-reviewer', role: 'qa', canProposeChanges: false, canVerify: true, allowedPermissionLevels: ['P0'] },
  { agentId: 'security-reviewer', role: 'security', canProposeChanges: false, canVerify: true, allowedPermissionLevels: ['P0'] },
  { agentId: 'truth-verifier', role: 'truth-verification', canProposeChanges: false, canVerify: true, allowedPermissionLevels: ['P0'] },
])

const rosterById = new Map(SWARM_ROSTER.map((agent) => [agent.agentId, agent]))
const isReviewer = (id: string) => rosterById.get(id)?.canVerify === true

export interface SwarmPolicy {
  projectId: string
  objectiveId: string
  maxConcurrentBuilders: number
  maxConcurrentReviewers: number
  maxTotalTokens: number
  maxTotalCostUsd: number
}

export type SwarmWave = {
  number: number
  builders: readonly string[]
  reviewers: readonly string[]
}

export type SwarmPlan = {
  accepted: boolean
  taskCount: number
  totalTokenBudget: number
  totalCostBudgetUsd: number
  waves: SwarmWave[]
  violations: string[]
}

export type SwarmWorkReport = {
  taskId: string
  authorAgentId: string
  artifactRef: string
  evidenceRefs: string[]
  completionTestsPassed: string[]
  /** A worker's success assertion is informational, never certification. */
  workerClaimsComplete: boolean
}

export type SwarmReviewReport = {
  taskId: string
  reviewerAgentId: string
  artifactRef: string
  independentEvidenceRefs: string[]
  testsPassed: string[]
  approved: boolean
}

export type SwarmReviewDecision = {
  accepted: boolean
  taskId: string
  reason: string
  verifiedEvidenceRefs: string[]
}

/** Fail closed: malformed scopes, dependencies and roles produce no dispatchable waves. */
export function planSwarm(
  tasks: readonly SwarmTask[],
  policy: SwarmPolicy,
  now = new Date(),
): SwarmPlan {
  const violations: string[] = []
  if (!policy.projectId?.trim() || !policy.objectiveId?.trim()) violations.push('scope_required')
  if (
    !Number.isSafeInteger(policy.maxConcurrentBuilders)
    || policy.maxConcurrentBuilders < 1 || policy.maxConcurrentBuilders > 4
    || !Number.isSafeInteger(policy.maxConcurrentReviewers)
    || policy.maxConcurrentReviewers < 1 || policy.maxConcurrentReviewers > 2
  ) violations.push('concurrency_out_of_bounds')
  if (
    !Number.isSafeInteger(policy.maxTotalTokens) || policy.maxTotalTokens < 0
    || !Number.isFinite(policy.maxTotalCostUsd) || policy.maxTotalCostUsd < 0
  ) violations.push('invalid_total_budget')
  if (!tasks.length) violations.push('no_tasks')
  if (tasks.length > 20) violations.push('task_count_exceeded')
  const ids = new Set(tasks.map((task) => task.taskId))
  if (ids.size !== tasks.length) violations.push('duplicate_task_id')

  const totalTokenBudget = tasks.reduce((sum, t) => sum + (Number.isFinite(t.maxTokens) ? t.maxTokens : 0), 0)
  const totalCostBudgetUsd = tasks.reduce((sum, t) => sum + (Number.isFinite(t.maxCostUsd) ? t.maxCostUsd : 0), 0)
  if (!Number.isSafeInteger(totalTokenBudget) || totalTokenBudget > policy.maxTotalTokens
    || totalCostBudgetUsd > policy.maxTotalCostUsd + 1e-8) violations.push('budget_exceeded')

  const byId = new Map(tasks.map((task) => [task.taskId, task]))
  for (const task of tasks) {
    const validation = validateWorkforceTaskContract(task, now)
    for (const error of validation.errors) violations.push(`${task.taskId}: ${error}`)
    if (task.projectId !== policy.projectId || task.objectiveId !== policy.objectiveId) {
      violations.push(`${task.taskId}: scope_mismatch`)
    }
    const owner = rosterById.get(task.ownerAgentId)
    if (!owner || owner.role !== task.specialty || !owner.allowedPermissionLevels.includes(
      task.permissionLevel as 'P0' | 'P1'
    )) violations.push(`${task.taskId}: owner_role_or_permission_mismatch`)
    if (!isReviewer(task.reviewerAgentId)) violations.push(`${task.taskId}: unauthorized_reviewer`)
    if (!task.expectedArtifact?.trim() || !task.rollbackPlan?.trim()) {
      violations.push(`${task.taskId}: artifact_and_rollback_required`)
    }
    for (const dependency of task.dependencyIds) {
      if (!byId.has(dependency)) violations.push(`${task.taskId}: dependency_missing`)
    }
  }

  // Two P1 tasks can never claim the same file for an overlapping write.
  const ownership = new Map<string, string>()
  for (const task of tasks) {
    if (task.permissionLevel !== 'P1') continue
    for (const file of task.allowedFiles) {
      const previous = ownership.get(file)
      if (previous && previous !== task.taskId) violations.push(`${task.taskId}: file_owner_conflict`)
      ownership.set(file, task.taskId)
    }
  }
  if (violations.length) return {
    accepted: false, taskCount: tasks.length, totalTokenBudget, totalCostBudgetUsd,
    waves: [], violations: [...new Set(violations)],
  }

  const completed = new Set<string>()
  const waves: SwarmWave[] = []
  for (let step = 0; completed.size < tasks.length && step < tasks.length; step++) {
    const available = tasks.filter((task) =>
      !completed.has(task.taskId)
      && task.dependencyIds.every((dependency) => completed.has(dependency))
    )
    const builders = available.filter((task) => !rosterById.get(task.ownerAgentId)?.canVerify)
      .slice(0, policy.maxConcurrentBuilders)
    const reviewers = available.filter((task) => rosterById.get(task.ownerAgentId)?.canVerify)
      .slice(0, policy.maxConcurrentReviewers)
    if (!builders.length && !reviewers.length) {
      violations.push('dependency_cycle_or_unsatisfied')
      break
    }
    const waveTasks = [...builders, ...reviewers]
    waves.push({ number: waves.length + 1, builders: builders.map(t => t.taskId), reviewers: reviewers.map(t => t.taskId) })
    waveTasks.forEach(t => completed.add(t.taskId))
  }
  return violations.length ? {
    accepted: false, taskCount: tasks.length, totalTokenBudget,
    totalCostBudgetUsd, waves: [], violations,
  } : {
    accepted: true, taskCount: tasks.length, totalTokenBudget,
    totalCostBudgetUsd, waves, violations: [],
  }
}

/**
 * Independent review is a proposed decision for an adapter, not an update to
 * Project World. A reviewer must have separate proof, matching artifact and
 * the complete checklist; the author cannot self-approve.
 */
export function reviewSwarmTask(
  task: SwarmTask,
  worker: SwarmWorkReport | null,
  reviewer: SwarmReviewReport | null,
): SwarmReviewDecision {
  const reject = (reason: string): SwarmReviewDecision => ({
    accepted: false, taskId: task.taskId, reason, verifiedEvidenceRefs: [],
  })
  if (!worker || worker.taskId !== task.taskId || worker.authorAgentId !== task.ownerAgentId) {
    return reject('missing_or_wrong_worker')
  }
  if (!worker.artifactRef?.trim() || worker.artifactRef !== task.expectedArtifact || !worker.evidenceRefs.length) {
    return reject('missing_artifact_or_worker_evidence')
  }
  if (!task.completionTests.every(test => worker.completionTestsPassed.includes(test))) {
    return reject('worker_tests_missing')
  }
  if (!reviewer || reviewer.taskId !== task.taskId || reviewer.reviewerAgentId !== task.reviewerAgentId
    || reviewer.reviewerAgentId === task.ownerAgentId || !isReviewer(reviewer.reviewerAgentId)) {
    return reject('independent_reviewer_required')
  }
  if (!reviewer.approved || reviewer.artifactRef !== task.expectedArtifact
    || !reviewer.independentEvidenceRefs.length || reviewer.independentEvidenceRefs.some(ref => !ref?.trim())) {
    return reject('unverified_external_evidence')
  }
  if (!task.completionTests.every(test => reviewer.testsPassed.includes(test))) {
    return reject('reviewer_tests_missing')
  }
  // No requirement that workerClaimsComplete be true; only reviewer evidence
  // and accepted tests determine the review outcome.
  return {
    accepted: true,
    taskId: task.taskId,
    reason: 'independent_review_passed',
    verifiedEvidenceRefs: [...new Set(reviewer.independentEvidenceRefs)],
  }
}
