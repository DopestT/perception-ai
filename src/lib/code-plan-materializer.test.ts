import { describe, expect, it } from 'vitest'
import {
  isCandidateRepositoryPath,
  materializeGitHubCodePlan,
  rankRepositoryPaths,
  validateGeneratedFiles,
  validateScopeSelection,
  type CodePlanFile,
} from '../../supabase/functions/_shared/code-plan-materializer'
import type { ModelTarget } from '../../supabase/functions/_shared/token-efficiency'

describe('P1 GitHub code-plan materializer', () => {
  it('ranks objective-relevant source paths ahead of unrelated files', () => {
    const ranked = rankRepositoryPaths(
      ['src/auth/session.ts', 'src/App.tsx', 'docs/forecast.md', 'package.json'],
      'Fix authentication session restore behavior.',
    )

    expect(ranked.indexOf('src/auth/session.ts')).toBeLessThan(ranked.indexOf('docs/forecast.md'))
  })

  it('keeps dynamic route filenames while excluding generated and sensitive scope', () => {
    expect(isCandidateRepositoryPath('src/app/[id]/page.tsx')).toBe(true)
    expect(isCandidateRepositoryPath('node_modules/pkg/index.js')).toBe(false)
    expect(isCandidateRepositoryPath('.github/workflows/deploy.yml')).toBe(false)
    expect(isCandidateRepositoryPath('.env.production')).toBe(false)
  })

  it('requires existing write files to be read and blocks consequential paths', () => {
    const existing = new Set(['src/App.tsx', 'src/lib/runtime.ts'])
    const failures = validateScopeSelection({
      read_paths: ['src/lib/runtime.ts'],
      write_paths: ['src/App.tsx', '.github/workflows/deploy.yml'],
      rationale: 'test',
      tests: [],
      confidence: 0.8,
    }, existing)

    expect(failures.join(' ')).toContain('must also be read')
    expect(failures.join(' ')).toContain('consequential execution path')
  })

  it('rejects generated files outside the selected write scope', () => {
    const files: CodePlanFile[] = [
      { path: 'src/other.ts', content: 'export const value = 1\n', reason: 'scope drift' },
    ]
    expect(validateGeneratedFiles(files, ['src/App.tsx']).join(' ')).toContain('outside the selected write scope')
  })

  it('materializes exact file contents using GitHub reads only', async () => {
    const candidate: ModelTarget = {
      id: 'test-model',
      provider: 'openai',
      model: 'gpt-test',
      lane: 'balanced',
      protocol: 'responses',
      apiKey: 'test-key',
    }
    const githubMethods: string[] = []
    let modelCall = 0

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.startsWith('https://api.github.com/')) {
        githubMethods.push(init?.method || 'GET')
        if (url.includes('/git/ref/heads/main')) {
          return new Response(JSON.stringify({ object: { sha: 'base123' } }), { status: 200 })
        }
        if (url.includes('/git/commits/base123')) {
          return new Response(JSON.stringify({ tree: { sha: 'tree123' } }), { status: 200 })
        }
        if (url.includes('/git/trees/tree123')) {
          return new Response(JSON.stringify({
            tree: [
              { type: 'blob', path: 'src/runtime.ts' },
              { type: 'blob', path: 'src/other.ts' },
              { type: 'blob', path: '.github/workflows/deploy.yml' },
            ],
          }), { status: 200 })
        }
        if (url.includes('/contents/src/runtime.ts')) {
          return new Response(JSON.stringify({
            type: 'file',
            encoding: 'base64',
            content: btoa('export const runtime = false\n'),
          }), { status: 200 })
        }
        return new Response(JSON.stringify({ message: 'not found' }), { status: 404 })
      }

      modelCall += 1
      if (modelCall === 1) {
        return new Response(JSON.stringify({
          output_text: JSON.stringify({
            read_paths: ['src/runtime.ts'],
            write_paths: ['src/runtime.ts'],
            rationale: 'The runtime file directly contains the behavior.',
            tests: ['npm test'],
            confidence: 0.9,
          }),
        }), { status: 200 })
      }

      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          files: [{
            path: 'src/runtime.ts',
            content: 'export const runtime = true\n',
            reason: 'Enable the requested runtime behavior.',
          }],
          tests: ['npm test'],
          rationale: 'One bounded replacement is sufficient.',
          confidence: 0.9,
        }),
      }), { status: 200 })
    }

    const result = await materializeGitHubCodePlan({
      repository: 'DopestT/perception-ai',
      baseBranch: 'main',
      desiredChanges: 'Enable the runtime behavior.',
      completionTests: ['The runtime behavior is enabled.'],
      githubToken: 'github-test',
      candidates: [candidate],
      maxOutputTokens: 3000,
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.phase).toBe('materialized')
    expect(result.files).toEqual([{
      path: 'src/runtime.ts',
      content: 'export const runtime = true\n',
      reason: 'Enable the requested runtime behavior.',
    }])
    expect(result.base_sha).toBe('base123')
    expect(result.write_paths).toEqual(['src/runtime.ts'])
    expect(githubMethods.every((method) => method === 'GET')).toBe(true)
    expect(modelCall).toBe(2)
  })
})
