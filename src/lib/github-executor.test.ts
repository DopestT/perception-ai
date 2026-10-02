import { describe, expect, it } from 'vitest'
import {
  findUnexpectedChangedFiles,
  validateExistingBranchForReuse,
  validateExpectedBaseSha,
  validateGitHubExecutionRequest,
} from '../../supabase/functions/_shared/github-executor'

const valid = {
  repository: 'DopestT/perception-ai',
  base_branch: 'main',
  expected_base_sha: '1111111111111111111111111111111111111111',
  branch: 'operator/bounded-change',
  summary: 'Bounded change',
  files: [{ path: 'src/example.ts', content: 'export const ok = true' }],
  permission: {
    project_id: 'perception',
    capability: 'code' as const,
    target: 'github://DopestT/perception-ai@main',
    level: 'P2' as const,
  },
}

describe('GitHub executor boundary', () => {
  it('accepts a scoped branch-only change', () => {
    expect(validateGitHubExecutionRequest(valid)).toEqual([])
  })

  it('requires a materialized base commit pin', () => {
    expect(validateGitHubExecutionRequest({ ...valid, expected_base_sha: '' }).join(' ')).toContain('base commit SHA')
  })

  it('blocks writes directly to the base branch', () => {
    expect(validateGitHubExecutionRequest({ ...valid, branch: 'main' }).join(' ')).toContain('bounded branch')
  })

  it('requires an explicit observed base branch instead of defaulting to main', () => {
    const input = { ...valid, base_branch: '' }
    expect(validateGitHubExecutionRequest(input).join(' ')).toContain('explicit valid base branch')
  })


  it('blocks permission target drift', () => {
    const input = { ...valid, permission: { ...valid.permission, target: 'github://DopestT/other@main' } }
    expect(validateGitHubExecutionRequest(input).join(' ')).toContain('exactly match')
  })

  it('blocks repository path traversal', () => {
    const input = { ...valid, files: [{ path: '../secret', content: 'no' }] }
    expect(validateGitHubExecutionRequest(input).join(' ')).toContain('inside the repository')
  })

  it('blocks execution when the base branch moved after planning', () => {
    expect(
      validateExpectedBaseSha(
        '1111111111111111111111111111111111111111',
        '2222222222222222222222222222222222222222',
      ).join(' '),
    ).toContain('Rematerialize before execution')
    expect(
      validateExpectedBaseSha(
        '1111111111111111111111111111111111111111',
        '1111111111111111111111111111111111111111',
      ),
    ).toEqual([])
  })

  it('allows an existing ahead branch when changes stay inside the planned file set', () => {
    expect(
      validateExistingBranchForReuse('ahead', ['src/example.ts'], ['src/example.ts']),
    ).toEqual([])
  })

  it('allows an identical existing branch for an idempotent desired-state retry', () => {
    expect(
      validateExistingBranchForReuse('identical', [], ['src/example.ts']),
    ).toEqual([])
  })

  it('blocks stale or diverged existing branches instead of writing over them', () => {
    expect(
      validateExistingBranchForReuse('diverged', ['src/example.ts'], ['src/example.ts']).join(' '),
    ).toContain('not safely reusable')
  })

  it('blocks scope drift on an existing branch', () => {
    expect(
      validateExistingBranchForReuse(
        'ahead',
        ['src/example.ts', 'production-secret.txt'],
        ['src/example.ts'],
      ).join(' '),
    ).toContain('unplanned changes')
  })

  it('reports unexpected changed files deterministically', () => {
    expect(
      findUnexpectedChangedFiles(['a.ts', 'b.ts'], ['a.ts']),
    ).toEqual(['b.ts'])
  })
})
