import { describe, expect, it } from 'vitest'
import { validateWorkforceTaskContract } from './workforce-task-contract'

const now = new Date('2026-11-05T08:00:00.000Z')
const validTask = {
  taskId: 'perception-workforce-proof-001',
  projectId: 'perception-project',
  objectiveId: 'objective-001',
  routeNodeId: 'route-node-001',
  ownerAgentId: 'backend-worker-1',
  reviewerAgentId: 'qa-reviewer-1',
  goal: 'Create a sandbox-only contract validator',
  inputEvidenceRefs: ['github://DopestT/perception-ai@main'],
  allowedFiles: ['src/lib/workforce-task-contract.ts'],
  forbiddenFiles: ['supabase/migrations', 'src/lib/production-secret.ts'],
  completionTests: ['Reject missing ownership', 'Reject self approval'],
  dependencyIds: [],
  permissionLevel: 'P1',
  deadlineAt: '2026-11-06T12:00:00.000Z',
  maxAttempts: 3,
  maxTokens: 0,
  maxCostUsd: 0,
} as const

const check = (change: Record<string, unknown>) =>
  validateWorkforceTaskContract({ ...validTask, ...change }, now)

describe('workforce task contract — Phase 0', () => {
  it('accepts an owned, fully bounded P1 task without paid compute', () => {
    expect(validateWorkforceTaskContract(validTask, now)).toEqual({ valid: true, errors: [] })
  })

  it('rejects missing project and route ownership identifiers', () => {
    expect(check({ projectId: '', objectiveId: '', routeNodeId: '' }).errors).toEqual(
      expect.arrayContaining(['project_id_required', 'objective_id_required', 'route_node_id_required']),
    )
  })

  it('rejects unowned or self-reviewed tasks', () => {
    expect(check({ ownerAgentId: '' }).errors).toContain('owner_required')
    expect(check({ reviewerAgentId: 'backend-worker-1' }).errors).toContain('independent_reviewer_required')
  })

  it('rejects P2/P3 execution until a separate permission contract exists', () => {
    expect(check({ permissionLevel: 'P2' }).errors).toContain('permission_not_allowed')
    expect(check({ permissionLevel: 'P3' }).errors).toContain('permission_not_allowed')
  })

  it('rejects ambiguous file scopes and traversal', () => {
    expect(check({ allowedFiles: ['../private/secrets.txt'] }).errors).toContain('invalid_file_scope')
    expect(check({ allowedFiles: ['src\\file.ts'] }).errors).toContain('invalid_file_scope')
    expect(check({ allowedFiles: ['src/lib/workforce-task-contract.ts', 'src/lib/workforce-task-contract.ts'] }).errors)
      .toContain('invalid_file_scope')
    expect(check({ allowedFiles: ['supabase/migrations/hotfix.sql'] }).errors)
      .toContain('forbidden_file_overlap')
  })

  it('allows read-only P0 work without files but requires exact P1 ownership', () => {
    expect(check({ allowedFiles: [], permissionLevel: 'P0' }).valid).toBe(true)
    expect(check({ allowedFiles: [], permissionLevel: 'P1' }).errors).toContain('p1_files_required')
  })

  it('rejects expired deadlines and attempts above two retries', () => {
    expect(check({ deadlineAt: '2026-11-04T00:00:00.000Z' }).errors).toContain('deadline_not_future')
    expect(check({ deadlineAt: 'tomorrow' }).errors).toContain('deadline_not_future')
    expect(check({ maxAttempts: 4 }).errors).toContain('attempt_limit_exceeded')
    expect(check({ maxAttempts: 0 }).errors).toContain('attempt_limit_exceeded')
  })

  it('fails closed when token or dollar budgets are unknown or invalid', () => {
    expect(check({ maxTokens: Number.NaN }).errors).toContain('invalid_budget')
    expect(check({ maxCostUsd: Number.POSITIVE_INFINITY }).errors).toContain('invalid_budget')
    expect(check({ maxCostUsd: -1 }).errors).toContain('invalid_budget')
    expect(check({ maxTokens: 0, maxCostUsd: 0 }).valid).toBe(true)
  })

  it('rejects insufficient provenance, verification, and self-dependent work', () => {
    expect(check({ inputEvidenceRefs: [] }).errors).toContain('evidence_required')
    expect(check({ completionTests: [] }).errors).toContain('completion_tests_required')
    expect(check({ dependencyIds: [validTask.taskId] }).errors).toContain('invalid_dependencies')
  })

  it('rejects arbitrary non-object inputs and never authorizes by default', () => {
    expect(validateWorkforceTaskContract(null, now).valid).toBe(false)
    expect(validateWorkforceTaskContract('draft', now).valid).toBe(false)
    expect(check({ permissionLevel: undefined }).valid).toBe(false)
  })
})
