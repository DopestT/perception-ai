import { describe, expect, it } from 'vitest'
import {
  permissionCoversAction,
  verifyOperatorAction,
  type OperatorActionRequest,
  type OperatorPermissionScope,
} from './perception-operator'
import {
  createGitHubChangeRequest,
  observeGitHubChange,
  verifyGitHubChange,
} from './github-operator'

const request: OperatorActionRequest = {
  actionKey: 'github.change:DopestT/perception-ai:test',
  projectId: 'perception',
  capability: 'code',
  target: 'github://DopestT/perception-ai@main',
  permissionLevel: 'P2',
  reversible: true,
  expectedEffect: 'Make a bounded code change',
  completionTests: ['Commit exists'],
}

describe('Operator v1', () => {
  it('requires exact project, capability, and target scope', () => {
    const scope: OperatorPermissionScope = {
      projectId: 'perception',
      capability: 'code',
      target: request.target,
      level: 'P2',
    }
    expect(permissionCoversAction(scope, request)).toBe(true)
    expect(permissionCoversAction({ ...scope, target: 'github://other/repo@main' }, request)).toBe(false)
  })

  it('does not verify an attempted action without independent observation', () => {
    const result = verifyOperatorAction(request, [{
      phase: 'attempted',
      actionKey: request.actionKey,
      target: request.target,
      evidence: ['Worker says it wrote a commit.'],
      observedAt: new Date().toISOString(),
    }])
    expect(result.passed).toBe(false)
  })

  it('verifies a bounded GitHub branch change when evidence matches the plan', () => {
    const planned = createGitHubChangeRequest('perception', {
      target: { repository: 'DopestT/perception-ai', baseBranch: 'main' },
      branch: 'operator-test',
      summary: 'Add operator contract',
      files: ['src/lib/perception-operator.ts'],
      checks: ['npm test'],
    })
    const evidence = {
      branchExists: true,
      commitSha: 'abc123',
      changedFiles: ['src/lib/perception-operator.ts'],
      checksPassed: ['npm test'],
      checksFailed: [],
    }
    const observation = observeGitHubChange(planned, evidence)
    expect(verifyGitHubChange(planned, observation, evidence, ['src/lib/perception-operator.ts']).passed).toBe(true)
  })

  it('rejects scope drift in changed files', () => {
    const evidence = {
      branchExists: true,
      commitSha: 'abc123',
      changedFiles: ['src/lib/perception-operator.ts', 'production-secret.txt'],
      checksPassed: [],
      checksFailed: [],
    }
    const observation = observeGitHubChange(request, evidence)
    const result = verifyGitHubChange(request, observation, evidence, ['src/lib/perception-operator.ts'])
    expect(result.passed).toBe(false)
    expect(result.failures.join(' ')).toContain('Unexpected changed files')
  })
})
