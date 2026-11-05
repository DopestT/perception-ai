import type { PermissionLevel } from './perception-runtime'

/**
 * Pure, fail-closed Phase 0 task boundary. This validates a proposed task only.
 * It DOES NOT lease a worker, issue permissions, spend credits, verify an effect,
 * or update Project World.
 */
export interface WorkforceTaskContract {
  taskId: string
  projectId: string
  objectiveId: string
  routeNodeId: string
  ownerAgentId: string
  reviewerAgentId: string
  goal: string
  inputEvidenceRefs: string[]
  allowedFiles: string[]
  forbiddenFiles: string[]
  completionTests: string[]
  dependencyIds: string[]
  permissionLevel: PermissionLevel
  deadlineAt: string
  /** Initial attempt plus at most two bounded retries. */
  maxAttempts: number
  maxTokens: number
  maxCostUsd: number
}

export type WorkforceTaskProblem =
  | 'invalid_contract'
  | 'task_id_required'
  | 'project_id_required'
  | 'objective_id_required'
  | 'route_node_id_required'
  | 'owner_required'
  | 'independent_reviewer_required'
  | 'goal_required'
  | 'evidence_required'
  | 'invalid_file_scope'
  | 'forbidden_file_overlap'
  | 'p1_files_required'
  | 'completion_tests_required'
  | 'invalid_dependencies'
  | 'permission_not_allowed'
  | 'deadline_not_future'
  | 'attempt_limit_exceeded'
  | 'invalid_budget'

export type WorkforceTaskValidation = {
  valid: boolean
  errors: WorkforceTaskProblem[]
}

const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const stringList = (value: unknown, requireEntries: boolean): value is string[] =>
  Array.isArray(value)
  && (!requireEntries || value.length > 0)
  && value.every(hasText)
  && new Set(value).size === value.length

/** Exact paths only: no globs, absolute paths, URL schemes, or traversal. */
const safeRelativePath = (value: string): boolean => {
  if (!/^[a-zA-Z0-9_.\/-]+$/.test(value)) return false
  if (value.startsWith('/') || value.endsWith('/')) return false
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

const futureTimestamp = (value: unknown, now: Date): boolean =>
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value))
  && Date.parse(value) > now.getTime()

const validBudget = (value: unknown, integer: boolean): boolean =>
  typeof value === 'number'
  && Number.isFinite(value)
  && value >= 0
  && (!integer || Number.isSafeInteger(value))

export function validateWorkforceTaskContract(
  candidate: unknown,
  now = new Date(),
): WorkforceTaskValidation {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, errors: ['invalid_contract'] }
  }

  const task = candidate as Record<string, unknown>
  const errors: WorkforceTaskProblem[] = []
  const requiredIds: Array<[string, WorkforceTaskProblem]> = [
    ['taskId', 'task_id_required'],
    ['projectId', 'project_id_required'],
    ['objectiveId', 'objective_id_required'],
    ['routeNodeId', 'route_node_id_required'],
  ]

  for (const [field, error] of requiredIds) {
    if (!hasText(task[field])) errors.push(error)
  }

  if (!hasText(task.ownerAgentId)) errors.push('owner_required')
  if (!hasText(task.reviewerAgentId) || task.reviewerAgentId === task.ownerAgentId) {
    errors.push('independent_reviewer_required')
  }
  if (!hasText(task.goal)) errors.push('goal_required')

  if (!stringList(task.inputEvidenceRefs, true)) errors.push('evidence_required')
  if (!stringList(task.completionTests, true)) errors.push('completion_tests_required')

  const validFiles = stringList(task.allowedFiles, false)
    && stringList(task.forbiddenFiles, false)
    && task.allowedFiles.every(safeRelativePath)
    && task.forbiddenFiles.every(safeRelativePath)

  if (!validFiles) {
    errors.push('invalid_file_scope')
  } else {
    const allowed = task.allowedFiles as string[]
    const forbidden = task.forbiddenFiles as string[]

    if (allowed.some((file) =>
      forbidden.some((excluded) => file === excluded || file.startsWith(`${excluded}/`))
    )) {
      errors.push('forbidden_file_overlap')
    }
    if (task.permissionLevel === 'P1' && allowed.length === 0) {
      errors.push('p1_files_required')
    }
  }

  if (!stringList(task.dependencyIds, false)
    || (hasText(task.taskId) && (task.dependencyIds as string[]).includes(task.taskId))) {
    errors.push('invalid_dependencies')
  }

  // P2/P3 require a separate, exact, user-approved capability contract.
  if (task.permissionLevel !== 'P0' && task.permissionLevel !== 'P1') {
    errors.push('permission_not_allowed')
  }

  if (!futureTimestamp(task.deadlineAt, now)) errors.push('deadline_not_future')
  if (typeof task.maxAttempts !== 'number'
    || !Number.isInteger(task.maxAttempts)
    || task.maxAttempts < 1
    || task.maxAttempts > 3) {
    errors.push('attempt_limit_exceeded')
  }

  if (!validBudget(task.maxTokens, true) || !validBudget(task.maxCostUsd, false)) {
    errors.push('invalid_budget')
  }

  return { valid: errors.length === 0, errors }
}
