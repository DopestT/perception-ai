import { describe, expect, it } from 'vitest'
import { validateGitHubExecutionRequest } from '../../supabase/functions/_shared/github-executor'

const valid = {
  repository: 'DopestT/perception-ai',
  base_branch: 'main',
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
})
