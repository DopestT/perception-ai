import type { CapabilityRouteDecision } from './capability-router.ts'
import type { PlannedRouteNode } from './reality-planner.ts'

export type GitHubFilesOrPatch =
  | {
      kind: 'files'
      files: Array<{ path: string; content: string }>
    }
  | {
      kind: 'patch'
      patch: string
    }

export type GitHubActionContractStatus =
  | 'needs_source'
  | 'needs_scope'
  | 'awaiting_permission'
  | 'ready'

export type GitHubActionContract = {
  version: 'github.change.v1'
  action_key: string
  adapter: 'github-operator'
  project_id: string
  objective_id: string | null
  route_id: string | null
  node_key: string
  repository: string | null
  target: string | null
  base_branch: string
  working_branch: string
  desired_changes: string
  files_or_patch: GitHubFilesOrPatch | null
  tests: string[]
  permission: {
    required: boolean
    level: PlannedRouteNode['permissionLevel']
    capability: 'code'
    target: string | null
    grant_id: string | null
    status: 'not_required' | 'required' | 'active'
  }
  verification: {
    requirements: string[]
  }
  rollback: {
    strategy: 'delete_working_branch'
    production_branch_untouched: true
  }
  idempotency: {
    key: string
    strategy: 'reuse_or_block_on_existing_branch'
  }
  missing_fields: string[]
  status: GitHubActionContractStatus
}

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function cleanBranchSegment(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return cleaned || 'action'
}

export function repositoryFromGitHubLocator(locator?: string | null): string | null {
  const value = locator?.trim()
  if (!value) return null

  if (value.startsWith('github://')) {
    const candidate = value.slice('github://'.length).split('@')[0]?.replace(/\.git$/i, '') ?? ''
    return repositoryPattern.test(candidate) ? candidate : null
  }

  try {
    const url = new URL(value)
    if (url.hostname.toLowerCase() !== 'github.com') return null
    const [owner, repo] = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
    const candidate = owner && repo ? `${owner}/${repo.replace(/\.git$/i, '')}` : ''
    return repositoryPattern.test(candidate) ? candidate : null
  } catch {
    return repositoryPattern.test(value.replace(/\.git$/i, ''))
      ? value.replace(/\.git$/i, '')
      : null
  }
}

export function buildGitHubActionContract(input: {
  decision: CapabilityRouteDecision
  node: PlannedRouteNode
  projectId: string
  objectiveId?: string | null
  routeId?: string | null
  repository?: string | null
  baseBranch?: string
  filesOrPatch?: GitHubFilesOrPatch | null
  permissionGrantId?: string | null
}): GitHubActionContract {
  const baseBranch = input.baseBranch?.trim() || 'main'
  const repository = input.repository?.trim() || null
  const target = repository ? `github://${repository}@${baseBranch}` : null
  const objectiveSeed = input.objectiveId?.replace(/-/g, '').slice(0, 8)
    || input.projectId.replace(/-/g, '').slice(0, 8)
    || 'project'
  const workingBranch = `perception/${objectiveSeed}/${cleanBranchSegment(input.node.key)}`
  const filesOrPatch = input.filesOrPatch ?? null
  const permissionRequired = input.decision.permissionRequired
  const permissionGrantId = input.permissionGrantId ?? null
  const permissionStatus = permissionRequired
    ? (permissionGrantId ? 'active' : 'required')
    : 'not_required'

  const missingFields: string[] = []
  if (!repository) missingFields.push('repository')
  if (!filesOrPatch) missingFields.push('files_or_patch')
  if (permissionRequired && !permissionGrantId) missingFields.push('permission_grant')

  const status: GitHubActionContractStatus = !repository
    ? 'needs_source'
    : !filesOrPatch
      ? 'needs_scope'
      : permissionRequired && !permissionGrantId
        ? 'awaiting_permission'
        : 'ready'

  const actionKey = `github.change:${repository ?? 'unresolved'}:${workingBranch}`

  return {
    version: 'github.change.v1',
    action_key: actionKey,
    adapter: 'github-operator',
    project_id: input.projectId,
    objective_id: input.objectiveId ?? null,
    route_id: input.routeId ?? null,
    node_key: input.node.key,
    repository,
    target,
    base_branch: baseBranch,
    working_branch: workingBranch,
    desired_changes: input.node.outcome,
    files_or_patch: filesOrPatch,
    tests: input.node.completionTests.map((test) => test.description),
    permission: {
      required: permissionRequired,
      level: input.node.permissionLevel,
      capability: 'code',
      target,
      grant_id: permissionGrantId,
      status: permissionStatus,
    },
    verification: {
      requirements: [
        'The working branch exists and the production branch is unchanged.',
        'The resulting commit can be independently fetched from GitHub.',
        'Changed files are limited to the materialized file or patch scope.',
        'Declared completion tests pass with inspectable evidence.',
      ],
    },
    rollback: {
      strategy: 'delete_working_branch',
      production_branch_untouched: true,
    },
    idempotency: {
      key: actionKey,
      strategy: 'reuse_or_block_on_existing_branch',
    },
    missing_fields: missingFields,
    status,
  }
}
