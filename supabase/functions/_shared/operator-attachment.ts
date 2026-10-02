export type GitHubOperatorTarget = {
  target: string
  repository: string
  branch: string
}

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const branchPattern = /^[A-Za-z0-9._\/-]+$/

export function parseGitHubOperatorTarget(value: unknown): GitHubOperatorTarget | null {
  if (typeof value !== 'string') return null
  const target = value.trim()
  if (!target.startsWith('github://')) return null

  const body = target.slice('github://'.length)
  const at = body.lastIndexOf('@')
  if (at <= 0 || at === body.length - 1) return null

  const repository = body.slice(0, at).replace(/\.git$/i, '')
  const branch = body.slice(at + 1)

  if (!repositoryPattern.test(repository) || !branchPattern.test(branch) || branch.includes('..')) return null
  return { target: `github://${repository}@${branch}`, repository, branch }
}

export function isVerifiedGitHubOperatorAttachment(input: {
  target: GitHubOperatorTarget | null
  principalEnabled: boolean
  sourceEnabled: boolean
  readCredentialPresent: boolean
}): boolean {
  return Boolean(
    input.target
    && input.principalEnabled
    && input.sourceEnabled
    && input.readCredentialPresent
  )
}
