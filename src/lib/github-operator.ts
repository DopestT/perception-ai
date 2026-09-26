import type {
  OperatorActionRequest,
  OperatorObservation,
  OperatorPermissionScope,
  OperatorVerification,
} from './perception-operator'
import { permissionCoversAction, verifyOperatorAction } from './perception-operator'

export interface GitHubRepositoryTarget {
  repository: string
  baseBranch: string
}

export interface GitHubChangePlan {
  target: GitHubRepositoryTarget
  branch: string
  summary: string
  files: string[]
  checks: string[]
}

export interface GitHubChangeEvidence {
  branchExists: boolean
  commitSha?: string
  changedFiles: string[]
  checksPassed: string[]
  checksFailed: string[]
}

export function githubTarget(target: GitHubRepositoryTarget): string {
  return `github://${target.repository}@${target.baseBranch}`
}

export function createGitHubChangeRequest(
  projectId: string,
  plan: GitHubChangePlan,
): OperatorActionRequest {
  return {
    actionKey: `github.change:${plan.target.repository}:${plan.branch}`,
    projectId,
    capability: 'code',
    target: githubTarget(plan.target),
    permissionLevel: 'P2',
    reversible: true,
    expectedEffect: plan.summary,
    completionTests: [
      'A bounded branch exists without changing the production branch.',
      'The resulting commit can be independently fetched from GitHub.',
      'Changed files are limited to the planned file set.',
      ...plan.checks.map((check) => `Check passes: ${check}`),
    ],
  }
}

export function authorizeGitHubChange(
  scope: OperatorPermissionScope,
  request: OperatorActionRequest,
): boolean {
  return permissionCoversAction(scope, request)
}

export function observeGitHubChange(
  request: OperatorActionRequest,
  evidence: GitHubChangeEvidence,
): OperatorObservation {
  const messages: string[] = []
  if (evidence.branchExists) messages.push('GitHub independently reports the bounded branch exists.')
  if (evidence.commitSha) messages.push(`GitHub independently reports commit ${evidence.commitSha}.`)
  if (evidence.changedFiles.length) messages.push(`Changed files: ${evidence.changedFiles.join(', ')}`)
  if (evidence.checksPassed.length) messages.push(`Checks passed: ${evidence.checksPassed.join(', ')}`)
  if (evidence.checksFailed.length) messages.push(`Checks failed: ${evidence.checksFailed.join(', ')}`)

  return {
    phase: evidence.branchExists && evidence.commitSha ? 'observed' : 'failed',
    actionKey: request.actionKey,
    target: request.target,
    evidence: messages,
    observedAt: new Date().toISOString(),
  }
}

export function verifyGitHubChange(
  request: OperatorActionRequest,
  observation: OperatorObservation,
  evidence: GitHubChangeEvidence,
  plannedFiles: string[],
): OperatorVerification {
  const base = verifyOperatorAction(request, [observation])
  const failures = [...base.failures]
  const unexpected = evidence.changedFiles.filter((file) => !plannedFiles.includes(file))

  if (unexpected.length) failures.push(`Unexpected changed files: ${unexpected.join(', ')}`)
  if (evidence.checksFailed.length) failures.push(`Failed checks: ${evidence.checksFailed.join(', ')}`)
  if (!evidence.commitSha) failures.push('No commit SHA was independently observed.')

  return { ...base, passed: base.passed && failures.length === 0, failures }
}
