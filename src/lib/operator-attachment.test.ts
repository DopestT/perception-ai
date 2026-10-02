import { describe, expect, it } from 'vitest'
import {
  isVerifiedGitHubOperatorAttachment,
  parseGitHubOperatorTarget,
} from '../../supabase/functions/_shared/operator-attachment'

describe('GitHub operator attachment', () => {
  it('parses a bounded GitHub target', () => {
    expect(parseGitHubOperatorTarget('github://DopestT/perception-ai@main')).toEqual({
      target: 'github://DopestT/perception-ai@main',
      repository: 'DopestT/perception-ai',
      branch: 'main',
    })
  })

  it('rejects malformed or traversal-like targets', () => {
    expect(parseGitHubOperatorTarget('https://github.com/DopestT/perception-ai')).toBeNull()
    expect(parseGitHubOperatorTarget('github://DopestT/perception-ai@../main')).toBeNull()
    expect(parseGitHubOperatorTarget('github://DopestT/perception-ai')).toBeNull()
  })

  it('attaches code only when target, principal, source, and read credential are verified', () => {
    const target = parseGitHubOperatorTarget('github://DopestT/perception-ai@main')
    expect(isVerifiedGitHubOperatorAttachment({
      target,
      principalEnabled: true,
      sourceEnabled: true,
      readCredentialPresent: true,
    })).toBe(true)

    expect(isVerifiedGitHubOperatorAttachment({
      target,
      principalEnabled: false,
      sourceEnabled: true,
      readCredentialPresent: true,
    })).toBe(false)

    expect(isVerifiedGitHubOperatorAttachment({
      target,
      principalEnabled: true,
      sourceEnabled: false,
      readCredentialPresent: true,
    })).toBe(false)
  })
})
