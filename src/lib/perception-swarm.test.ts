import { describe, expect, it } from 'vitest'
import {
  planSwarm,
  reviewSwarmTask,
  SWARM_ROSTER,
  SWARM_COLLABORATORS,
  type SwarmPolicy,
  type SwarmReviewReport,
  type SwarmTask,
  type SwarmWorkReport,
} from './perception-swarm'

const now = new Date('2026-11-13T06:50:00Z')
const policy: SwarmPolicy = {
  projectId: 'perception-fixture-project',
  objectiveId: 'objective-001',
  maxConcurrentBuilders: 4,
  maxConcurrentReviewers: 2,
  maxTotalTokens: 0,
  maxTotalCostUsd: 0,
}

function makeTask(
  id: string,
  ownerAgentId: SwarmTask['ownerAgentId'] = 'research-worker',
  patch: Partial<SwarmTask> = {},
): SwarmTask {
  const roles: Record<string, SwarmTask['specialty']> = {
    'research-worker': 'research',
    'analysis-worker': 'analysis',
    'architecture-worker': 'architecture',
    'interface-worker': 'interface',
    'backend-worker': 'backend',
    'qa-reviewer': 'qa',
    'security-reviewer': 'security',
    'truth-verifier': 'truth-verification',
  }
  return {
    taskId: id,
    projectId: policy.projectId,
    objectiveId: policy.objectiveId,
    routeNodeId: `node-${id}`,
    ownerAgentId,
    reviewerAgentId: ownerAgentId === 'qa-reviewer' ? 'truth-verifier' : 'qa-reviewer',
    goal: `Complete ${id} without external effects`,
    inputEvidenceRefs: ['fixture://source-reviewed'],
    allowedFiles: ownerAgentId === 'interface-worker' ? [`src/lib/fixture-${id}.ts`] : [],
    forbiddenFiles: ['supabase/migrations', '.env'],
    completionTests: ['scope test', 'artifact independent test'],
    dependencyIds: [],
    permissionLevel: ownerAgentId === 'interface-worker' ? 'P1' : 'P0',
    deadlineAt: '2026-11-14T06:50:00Z',
    maxAttempts: 2,
    maxTokens: 0,
    maxCostUsd: 0,
    specialty: roles[ownerAgentId],
    expectedArtifact: `artifact://${id}`,
    rollbackPlan: 'Discard disposable fixture',
    ...patch,
  }
}

const task = makeTask('research-1')
const worker: SwarmWorkReport = {
  taskId: task.taskId,
  authorAgentId: task.ownerAgentId,
  artifactRef: task.expectedArtifact,
  evidenceRefs: ['fixture://worker-observation'],
  completionTestsPassed: [...task.completionTests],
  workerClaimsComplete: true,
}
const reviewer: SwarmReviewReport = {
  taskId: task.taskId,
  reviewerAgentId: task.reviewerAgentId,
  artifactRef: task.expectedArtifact,
  independentEvidenceRefs: ['fixture://independent-observation'],
  testsPassed: [...task.completionTests],
  approved: true,
}

describe('PERCEPTION governed swarm dry-run', () => {
  it('has one constrained owner per specialist role and no implicit authorization', () => {
    expect(new Set(SWARM_ROSTER.map(agent => agent.agentId)).size).toBe(SWARM_ROSTER.length)
    expect(SWARM_ROSTER.filter(agent => agent.canProposeChanges).length).toBe(2)
    expect(SWARM_ROSTER.filter(agent => agent.canVerify).length).toBe(3)
    expect(SWARM_ROSTER.every(agent => agent.allowedPermissionLevels.every(p => p === 'P0' || p === 'P1'))).toBe(true)
  })

  it('reserves Perseverance as a named teammate without inventing permissions or operational identity', () => {
    expect(SWARM_COLLABORATORS).toEqual([{
      name: 'Perseverance',
      status: 'role_unmapped',
      dispatchEnabled: false,
      permissionLevels: [],
    }])
    expect(SWARM_ROSTER.some(agent => agent.agentId === 'Perseverance')).toBe(false)
    expect(planSwarm([makeTask('x', 'Perseverance', { specialty: 'research' })], policy, now)
      .violations).toContain('x: owner_role_or_permission_mismatch')
  })

  it('produces a bounded, dependency-ordered plan with parallel specialists', () => {
    const plan = planSwarm([
      task,
      makeTask('analysis-1', 'analysis-worker', { dependencyIds: ['research-1'] }),
      makeTask('architecture-1', 'architecture-worker', { dependencyIds: ['research-1'] }),
      makeTask('interface-1', 'interface-worker', { dependencyIds: ['architecture-1'] }),
      makeTask('qa-1', 'qa-reviewer', { dependencyIds: ['interface-1'], reviewerAgentId: 'truth-verifier' }),
    ], policy, now)
    expect(plan.accepted).toBe(true)
    expect(plan.waves).toEqual([
      { number: 1, builders: ['research-1'], reviewers: [] },
      { number: 2, builders: ['analysis-1', 'architecture-1'], reviewers: [] },
      { number: 3, builders: ['interface-1'], reviewers: [] },
      { number: 4, builders: [], reviewers: ['qa-1'] },
    ])
    expect(plan.totalCostBudgetUsd).toBe(0)
    expect(plan.totalTokenBudget).toBe(0)
  })

  it('caps concurrency at four implementing bots and two independent reviewers', () => {
    const builders = Array.from({ length: 7 }, (_, index) => makeTask(`research-${index}`))
    const reviews = Array.from({ length: 4 }, (_, index) =>
      makeTask(`review-${index}`, 'qa-reviewer', { reviewerAgentId: 'truth-verifier' }))
    const plan = planSwarm([...builders, ...reviews], policy, now)
    expect(plan.accepted).toBe(true)
    expect(plan.waves.every(wave => wave.builders.length <= 4 && wave.reviewers.length <= 2)).toBe(true)
    expect(plan.waves.flatMap(w => [...w.builders, ...w.reviewers])).toHaveLength(11)
  })

  it('fails closed on cross-project or cross-objective contamination', () => {
    expect(planSwarm([makeTask('x', 'research-worker', { projectId: 'another-project' })], policy, now)
      .violations).toContain('x: scope_mismatch')
    expect(planSwarm([makeTask('x', 'research-worker', { objectiveId: 'another-objective' })], policy, now)
      .waves).toEqual([])
  })

  it('rejects duplicate task identities, unknown dependencies, and cycles', () => {
    expect(planSwarm([task, task], policy, now).violations).toContain('duplicate_task_id')
    expect(planSwarm([makeTask('x', 'research-worker', { dependencyIds: ['missing'] })], policy, now)
      .violations).toContain('x: dependency_missing')
    const cycle = planSwarm([
      makeTask('a', 'research-worker', { dependencyIds: ['b'] }),
      makeTask('b', 'analysis-worker', { dependencyIds: ['a'] }),
    ], policy, now)
    expect(cycle.accepted).toBe(false)
    expect(cycle.waves).toEqual([])
    expect(cycle.violations).toContain('dependency_cycle_or_unsatisfied')
  })

  it('rejects permission escalation, missing independent reviewer, and self-review', () => {
    expect(planSwarm([makeTask('x', 'backend-worker', { permissionLevel: 'P3' })], policy, now)
      .accepted).toBe(false)
    expect(planSwarm([makeTask('x', 'research-worker', { reviewerAgentId: 'research-worker' })], policy, now)
      .accepted).toBe(false)
    expect(planSwarm([makeTask('x', 'research-worker', { reviewerAgentId: 'backend-worker' })], policy, now)
      .violations).toContain('x: unauthorized_reviewer')
  })

  it('requires an appropriate worker role and restricts code edits', () => {
    expect(planSwarm([makeTask('x', 'backend-worker', { specialty: 'research' })], policy, now)
      .violations).toContain('x: owner_role_or_permission_mismatch')
    expect(planSwarm([makeTask('x', 'research-worker', { permissionLevel: 'P1', allowedFiles: ['src/x.ts'] })], policy, now)
      .violations).toContain('x: owner_role_or_permission_mismatch')
  })

  it('rejects conflicting P1 file ownership rather than racing two branches', () => {
    const tasks = [
      makeTask('ui-a', 'interface-worker', { allowedFiles: ['src/App.tsx'] }),
      makeTask('ui-b', 'interface-worker', { allowedFiles: ['src/App.tsx'] }),
    ]
    expect(planSwarm(tasks, policy, now).violations).toContain('ui-b: file_owner_conflict')
    const nested = [
      makeTask('file-a', 'interface-worker', { allowedFiles: ['src/components'] }),
      makeTask('file-b', 'interface-worker', { allowedFiles: ['src/components/Card.tsx'] }),
    ]
    expect(planSwarm(nested, policy, now).violations).toContain('file-b: file_owner_conflict')
  })

  it('rejects missing evidence, rollback plan and overly high budgets', () => {
    expect(planSwarm([makeTask('x', 'research-worker', { inputEvidenceRefs: [] })], policy, now)
      .accepted).toBe(false)
    expect(planSwarm([makeTask('x', 'research-worker', { rollbackPlan: '' })], policy, now)
      .violations).toContain('x: artifact_and_rollback_required')
    expect(planSwarm([makeTask('x', 'research-worker', { maxCostUsd: 0.01 })], policy, now)
      .violations).toContain('budget_exceeded')
    expect(planSwarm([makeTask('x', 'research-worker', { maxTokens: 1 })], policy, now)
      .violations).toContain('budget_exceeded')
  })

  it('rejects long-lived and unbounded swarms', () => {
    const many = Array.from({ length: 21 }, (_, i) => makeTask(`task-${i}`))
    expect(planSwarm(many, policy, now).violations).toContain('task_count_exceeded')
    expect(planSwarm([task], { ...policy, maxConcurrentBuilders: 999 }, now).violations)
      .toContain('concurrency_out_of_bounds')
    expect(planSwarm([task], { ...policy, maxConcurrentReviewers: 3 }, now).violations)
      .toContain('concurrency_out_of_bounds')
    expect(planSwarm([task], { ...policy, maxTotalCostUsd: Number.POSITIVE_INFINITY }, now)
      .violations).toContain('invalid_total_budget')
  })

  it('does not accept success just because a worker claims completion', () => {
    expect(reviewSwarmTask(task, worker, null)).toEqual({
      accepted: false, taskId: task.taskId,
      reason: 'independent_reviewer_required', verifiedEvidenceRefs: [],
    })
    expect(reviewSwarmTask(task, { ...worker, workerClaimsComplete: false }, reviewer).accepted).toBe(true)
  })

  it('rejects a worker impersonating a reviewer or using an unauthorized identity', () => {
    expect(reviewSwarmTask(task, worker, { ...reviewer, reviewerAgentId: task.ownerAgentId }).accepted)
      .toBe(false)
    expect(reviewSwarmTask(task, { ...worker, authorAgentId: 'unknown-agent' }, reviewer).accepted)
      .toBe(false)
  })

  it('rejects incorrect artifacts, absent independent evidence, and missing tests', () => {
    expect(reviewSwarmTask(task, { ...worker, artifactRef: 'artifact://wrong' }, reviewer).accepted)
      .toBe(false)
    expect(reviewSwarmTask(task, worker, { ...reviewer, independentEvidenceRefs: [] }).accepted)
      .toBe(false)
    expect(reviewSwarmTask(task, worker, {
      ...reviewer, independentEvidenceRefs: ['fixture://worker-observation'],
    }).reason).toBe('reviewer_evidence_not_independent')
    expect(reviewSwarmTask(task, worker, { ...reviewer, approved: false }).accepted).toBe(false)
    expect(reviewSwarmTask(task, worker, { ...reviewer, testsPassed: ['scope test'] }).accepted)
      .toBe(false)
    expect(reviewSwarmTask(task, { ...worker, completionTestsPassed: [] }, reviewer).accepted)
      .toBe(false)
  })

  it('produces an independently reviewed proposal without modifying canonical state', () => {
    const before = JSON.stringify({ task, worker, reviewer })
    const decision = reviewSwarmTask(task, worker, reviewer)
    expect(decision).toEqual({
      accepted: true,
      taskId: task.taskId,
      reason: 'independent_review_passed',
      verifiedEvidenceRefs: ['fixture://independent-observation'],
    })
    expect(JSON.stringify({ task, worker, reviewer })).toBe(before)
  })
})
