import { describe, expect, it } from 'vitest'
import {
  buildGitHubActionContract,
  repositoryFromGitHubLocator,
} from '../../supabase/functions/_shared/action-contract'
import type { CapabilityRouteDecision } from '../../supabase/functions/_shared/capability-router'
import type { PlannedRouteNode } from '../../supabase/functions/_shared/reality-planner'

const node: PlannedRouteNode = {
  key: 'explicit-external-action',
  label: 'Make bounded repository change',
  outcome: 'Update the bounded implementation without touching main.',
  status: 'pending',
  dependencies: ['verify-first-action'],
  capability: 'code',
  permissionLevel: 'P2',
  confidence: 0.8,
  risk: 'medium',
  completionTests: [{ description: 'External effect is independently observed and verified.', kind: 'external' }],
}

const decision: CapabilityRouteDecision = {
  nodeKey: node.key,
  capability: 'code',
  permissionLevel: 'P2',
  adapter: 'github-operator',
  executionMode: 'external',
  status: 'needs_action_contract',
  permissionRequired: true,
  requiredInputFields: ['project_id', 'repository', 'base_branch', 'branch', 'summary', 'files_or_patch'],
  blockers: ['A concrete GitHub action contract must be resolved before execution.'],
}

describe('GitHub action contract resolver', () => {
  it('extracts an owner/repo target from a bound GitHub source locator', () => {
    expect(repositoryFromGitHubLocator('https://github.com/DopestT/perception-ai')).toBe('DopestT/perception-ai')
    expect(repositoryFromGitHubLocator('github://DopestT/perception-ai@main')).toBe('DopestT/perception-ai')
    expect(repositoryFromGitHubLocator('https://example.com/DopestT/perception-ai')).toBeNull()
  })

  it('creates a bounded draft contract without inventing patch scope or permission', () => {
    const contract = buildGitHubActionContract({
      decision,
      node,
      projectId: '28f16856-6570-48fc-b563-44f6bc28f6b5',
      objectiveId: '12345678-1234-1234-1234-123456789abc',
      routeId: 'route-1',
      repository: 'DopestT/perception-ai',
    })

    expect(contract.target).toBe('github://DopestT/perception-ai@main')
    expect(contract.working_branch).toBe('perception/12345678/explicit-external-action')
    expect(contract.status).toBe('needs_scope')
    expect(contract.files_or_patch).toBeNull()
    expect(contract.permission.status).toBe('required')
    expect(contract.missing_fields).toEqual(expect.arrayContaining(['files_or_patch', 'permission_grant']))
    expect(contract.rollback.production_branch_untouched).toBe(true)
  })

  it('becomes executable only when scope and permission are both concrete', () => {
    const contract = buildGitHubActionContract({
      decision,
      node,
      projectId: '28f16856-6570-48fc-b563-44f6bc28f6b5',
      objectiveId: '12345678-1234-1234-1234-123456789abc',
      repository: 'DopestT/perception-ai',
      filesOrPatch: {
        kind: 'files',
        files: [{ path: 'docs/example.md', content: '# verified\n' }],
      },
      permissionGrantId: 'grant-1',
    })

    expect(contract.status).toBe('ready')
    expect(contract.missing_fields).toEqual([])
    expect(contract.permission.status).toBe('active')
    expect(contract.idempotency.key).toContain('github.change:DopestT/perception-ai:')
  })

  it('keeps repository identity explicitly unresolved when Project World has no GitHub source', () => {
    const contract = buildGitHubActionContract({
      decision,
      node,
      projectId: 'project-1',
    })

    expect(contract.status).toBe('needs_source')
    expect(contract.repository).toBeNull()
    expect(contract.missing_fields).toContain('repository')
  })
})
