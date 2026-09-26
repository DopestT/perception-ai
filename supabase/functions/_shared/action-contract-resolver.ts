import type { CapabilityRouteDecision } from './capability-router.ts'
import type { PlannedRouteNode } from './reality-planner.ts'

export type ActionContractSourceContext = {
  sourceType: string
  provider: string
  externalId: string
  relationship: 'primary' | 'supporting' | 'shared' | 'legacy' | 'unknown' | string
  enabled: boolean
  defaultBranch?: string | null
  observedAt?: string | null
  freshnessSlaMinutes?: number | null
}

export type PlannedGitHubFile = {
  path: string
  content: string
}

export type GitHubActionContract = {
  repository: string
  base_branch: string
  branch: string
  summary: string
  files: PlannedGitHubFile[]
  permission: {
    project_id: string
    capability: 'code'
    target: string
    level: 'P2'
  }
}

export type ActionContractResolution = {
  adapter: 'github-operator' | null
  status: 'ready' | 'awaiting_permission' | 'needs_input' | 'blocked'
  contract: GitHubActionContract | null
  missingFields: string[]
  blockers: string[]
  idempotencyKey: string
  completionTests: PlannedRouteNode['completionTests']
  provenance: {
    repository: 'observed' | 'unresolved'
    baseBranch: 'observed' | 'stale' | 'unresolved'
    workingBranch: 'generated' | 'unresolved'
    files: 'provided' | 'unresolved'
  }
}

export type ResolveActionContractInput = {
  decision: CapabilityRouteDecision
  node: PlannedRouteNode
  projectId: string
  objectiveId?: string | null
  routeId?: string | null
  sources?: ActionContractSourceContext[]
  files?: PlannedGitHubFile[]
  permissionGranted?: boolean
  now?: Date
}

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const branchPattern = /^[A-Za-z0-9._/-]+$/

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 48) || 'change'
}

function selectGitHubSource(
  sources: ActionContractSourceContext[],
): { source: ActionContractSourceContext | null; blocker: string | null } {
  const candidates = sources.filter((source) =>
    source.enabled
    && source.sourceType === 'github_repo'
    && source.provider.toLowerCase() === 'github'
    && repositoryPattern.test(source.externalId)
  )

  const primary = candidates.filter((source) => source.relationship === 'primary')
  if (primary.length === 1) return { source: primary[0], blocker: null }
  if (primary.length > 1) {
    return {
      source: null,
      blocker: 'Multiple active primary GitHub repository sources are bound to this Project World.',
    }
  }

  if (candidates.length === 1) return { source: candidates[0], blocker: null }
  if (candidates.length > 1) {
    return {
      source: null,
      blocker: 'Multiple GitHub repository sources are available and none is uniquely primary.',
    }
  }

  return { source: null, blocker: null }
}

export function resolveActionContract(input: ResolveActionContractInput): ActionContractResolution {
  const identityParts = [
    'github.change',
    input.projectId,
    input.objectiveId || 'objective',
    input.routeId || 'route',
    input.node.key,
  ]
  const idempotencyKey = identityParts.join(':')

  const base: ActionContractResolution = {
    adapter: input.decision.adapter === 'github-operator' ? 'github-operator' : null,
    status: 'blocked',
    contract: null,
    missingFields: [],
    blockers: [],
    idempotencyKey,
    completionTests: input.node.completionTests,
    provenance: {
      repository: 'unresolved',
      baseBranch: 'unresolved',
      workingBranch: 'unresolved',
      files: 'unresolved',
    },
  }

  if (input.decision.adapter !== 'github-operator' || input.node.capability !== 'code') {
    return {
      ...base,
      blockers: ['This resolver only creates contracts for GitHub Operator code nodes.'],
    }
  }

  if (input.node.permissionLevel !== 'P2' || input.decision.permissionLevel !== 'P2') {
    return {
      ...base,
      blockers: ['GitHub Operator action contracts are limited to bounded P2 repository changes.'],
    }
  }

  const sourceSelection = selectGitHubSource(input.sources ?? [])
  if (sourceSelection.blocker) {
    return { ...base, blockers: [sourceSelection.blocker] }
  }

  const source = sourceSelection.source
  const repository = source?.externalId || null
  const observedBaseBranch = source?.defaultBranch?.trim() || null
  const observedAtMs = source?.observedAt ? Date.parse(source.observedAt) : Number.NaN
  const freshnessMinutes = Number(source?.freshnessSlaMinutes ?? 1440)
  const freshnessMs = Number.isFinite(freshnessMinutes) && freshnessMinutes > 0
    ? freshnessMinutes * 60_000
    : 1440 * 60_000
  const nowMs = (input.now ?? new Date()).getTime()
  const branchEvidenceFresh = Boolean(
    observedBaseBranch
    && Number.isFinite(observedAtMs)
    && observedAtMs <= nowMs
    && nowMs - observedAtMs <= freshnessMs
  )
  const baseBranch = branchEvidenceFresh ? observedBaseBranch : null
  const staleBaseBranch = Boolean(observedBaseBranch && !branchEvidenceFresh)
  const files = (input.files ?? []).filter((file) => file.path.trim() && typeof file.content === 'string')

  const missingFields: string[] = []
  if (!repository) missingFields.push('repository')
  if (!baseBranch) missingFields.push('base_branch')
  if (!files.length) missingFields.push('files')

  if (missingFields.length > 0) {
    return {
      ...base,
      status: 'needs_input',
      missingFields,
      blockers: missingFields.map((field) =>
        field === 'repository'
          ? 'No unique observed GitHub repository is bound to this Project World.'
          : field === 'base_branch'
            ? staleBaseBranch
              ? 'The observed repository base branch is stale and must be refreshed before execution.'
              : 'The repository base branch has not been observed in Project World evidence.'
            : 'No exact planned file payload is available for this route node.'
      ),
      provenance: {
        repository: repository ? 'observed' : 'unresolved',
        baseBranch: baseBranch ? 'observed' : staleBaseBranch ? 'stale' : 'unresolved',
        workingBranch: repository && baseBranch ? 'generated' : 'unresolved',
        files: files.length ? 'provided' : 'unresolved',
      },
    }
  }

  if (!branchPattern.test(baseBranch!) || baseBranch!.includes('..')) {
    return {
      ...base,
      blockers: ['Observed base branch is not a valid Git branch name.'],
    }
  }

  const identitySuffix = slug((input.objectiveId || input.routeId || input.projectId).slice(0, 12))
  const branch = `perception/${slug(input.node.key)}-${identitySuffix}`
  const target = `github://${repository}@${baseBranch}`

  const contract: GitHubActionContract = {
    repository: repository!,
    base_branch: baseBranch!,
    branch,
    summary: input.node.label || input.node.outcome || 'Perception bounded repository change',
    files,
    permission: {
      project_id: input.projectId,
      capability: 'code',
      target,
      level: 'P2',
    },
  }

  return {
    ...base,
    status: input.permissionGranted ? 'ready' : 'awaiting_permission',
    contract,
    missingFields: [],
    blockers: input.permissionGranted
      ? []
      : ['A matching active scoped P2 permission grant is required before execution.'],
    provenance: {
      repository: 'observed',
      baseBranch: 'observed',
      workingBranch: 'generated',
      files: 'provided',
    },
  }
}
