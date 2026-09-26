import { describe, expect, it } from 'vitest'
import { resolveActionContract } from '../../supabase/functions/_shared/action-contract-resolver'
import type { CapabilityRouteDecision } from '../../supabase/functions/_shared/capability-router'
import type { PlannedRouteNode } from '../../supabase/functions/_shared/reality-planner'

const node: PlannedRouteNode = {
  key: 'explicit-external-action',
  label: 'Make bounded repository change',
  outcome: 'Change the repository without modifying main.',
  status: 'pending',
  dependencies: [],
  capability: 'code',
  permissionLevel: 'P2',
  confidence: 0.9,
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
  requiredInputFields: ['project_id', 'repository', 'base_branch', 'branch', 'summary', 'files'],
  blockers: [],
}

const primarySource = {
  sourceType: 'github_repo',
  provider: 'github',
  externalId: 'DopestT/perception-ai',
  relationship: 'primary' as const,
  enabled: true,
  defaultBranch: 'main',
  observedAt: '2026-09-26T12:00:00Z',
  freshnessSlaMinutes: 1440,
}

const files = [{ path: 'docs/SAFE_PROOF.md', content: '# Safe proof\n' }]

describe('Action Contract Resolver', () => {
  it('resolves a bounded GitHub contract from observed Project World source context', () => {
    const result = resolveActionContract({
      decision,
      node,
      projectId: 'project-12345678',
      objectiveId: 'objective-12345678',
      routeId: 'route-12345678',
      sources: [primarySource],
      files,
      permissionGranted: true,
    })

    expect(result.status).toBe('ready')
    expect(result.contract).toMatchObject({
      repository: 'DopestT/perception-ai',
      base_branch: 'main',
      branch: 'perception/explicit-external-action-objective-12',
      permission: {
        project_id: 'project-12345678',
        capability: 'code',
        target: 'github://DopestT/perception-ai@main',
        level: 'P2',
      },
    })
    expect(result.provenance.repository).toBe('observed')
    expect(result.provenance.workingBranch).toBe('generated')
    expect(result.idempotencyKey).toContain('explicit-external-action')
  })

  it('does not invent a base branch when Project World has not observed it', () => {
    const result = resolveActionContract({
      decision,
      node,
      projectId: 'project',
      sources: [{ ...primarySource, defaultBranch: null }],
      files,
    })

    expect(result.status).toBe('needs_input')
    expect(result.missingFields).toContain('base_branch')
    expect(result.contract).toBeNull()
  })

  it('does not invent exact file changes', () => {
    const result = resolveActionContract({
      decision,
      node,
      projectId: 'project',
      sources: [primarySource],
    })

    expect(result.status).toBe('needs_input')
    expect(result.missingFields).toContain('files')
    expect(result.contract).toBeNull()
  })

  it('rejects stale default-branch evidence until the source is refreshed', () => {
    const result = resolveActionContract({
      decision,
      node,
      projectId: 'project',
      sources: [{
        ...primarySource,
        observedAt: '2026-09-20T12:00:00Z',
        freshnessSlaMinutes: 1440,
      }],
      files,
      now: new Date('2026-09-26T13:00:00Z'),
    })

    expect(result.status).toBe('needs_input')
    expect(result.missingFields).toContain('base_branch')
    expect(result.provenance.baseBranch).toBe('stale')
    expect(result.blockers.join(' ')).toContain('must be refreshed')
  })

  it('blocks ambiguous repository identity rather than guessing', () => {
    const result = resolveActionContract({
      decision,
      node,
      projectId: 'project',
      sources: [
        { ...primarySource, relationship: 'supporting' },
        {
          ...primarySource,
          externalId: 'DopestT/another-repo',
          relationship: 'supporting',
        },
      ],
      files,
    })

    expect(result.status).toBe('blocked')
    expect(result.blockers.join(' ')).toContain('none is uniquely primary')
  })

  it('creates a complete contract but waits for a matching permission grant', () => {
    const result = resolveActionContract({
      decision,
      node,
      projectId: 'project',
      objectiveId: 'objective',
      sources: [primarySource],
      files,
      permissionGranted: false,
    })

    expect(result.status).toBe('awaiting_permission')
    expect(result.contract?.permission.target).toBe('github://DopestT/perception-ai@main')
    expect(result.blockers.join(' ')).toContain('scoped P2 permission')
  })

  it('refuses to downgrade a P3 code node into the P2 GitHub adapter', () => {
    const p3Node = { ...node, permissionLevel: 'P3' as const, risk: 'high' as const }
    const p3Decision = { ...decision, permissionLevel: 'P3' as const }

    const result = resolveActionContract({
      decision: p3Decision,
      node: p3Node,
      projectId: 'project',
      sources: [primarySource],
      files,
    })

    expect(result.status).toBe('blocked')
    expect(result.blockers.join(' ')).toContain('bounded P2')
  })
})
