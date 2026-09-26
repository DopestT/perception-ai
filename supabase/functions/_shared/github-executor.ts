type GitHubExecutionRequest = {
  repository: string
  base_branch?: string
  branch: string
  summary: string
  files: Array<{ path: string; content: string }>
  permission: {
    project_id: string
    capability: 'code'
    target: string
    level: 'P2' | 'P3'
  }
  execute?: boolean
}

const allowedRepository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const allowedBranch = /^[A-Za-z0-9._/-]+$/

export function validateGitHubExecutionRequest(input: GitHubExecutionRequest): string[] {
  const failures: string[] = []
  const baseBranch = input.base_branch || 'main'
  const target = `github://${input.repository}@${baseBranch}`

  if (!allowedRepository.test(input.repository)) failures.push('Repository must use owner/name format.')
  if (!allowedBranch.test(input.branch) || input.branch.includes('..')) failures.push('Branch name is invalid.')
  if (input.branch === baseBranch) failures.push('Operator writes must use a bounded branch, never the base branch.')
  if (!input.files.length) failures.push('At least one planned file is required.')
  if (new Set(input.files.map((file) => file.path)).size !== input.files.length) failures.push('Duplicate file paths are not allowed.')
  if (input.files.some((file) => !file.path || file.path.startsWith('/') || file.path.includes('..'))) failures.push('File paths must stay inside the repository.')
  if (input.permission.capability !== 'code') failures.push('GitHub execution requires code capability permission.')
  if (input.permission.target !== target) failures.push('Permission target does not exactly match the repository and base branch.')
  if (!['P2', 'P3'].includes(input.permission.level)) failures.push('A P2 or P3 permission grant is required.')

  return failures
}

export function githubApiHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

async function githubJson(token: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...githubApiHeaders(token), ...(init.headers || {}) },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${body?.message || 'request failed'}`)
  return body
}

export async function executeBoundedGitHubChange(input: GitHubExecutionRequest, token: string) {
  const failures = validateGitHubExecutionRequest(input)
  if (failures.length) return { ok: false, phase: 'blocked', failures }

  const baseBranch = input.base_branch || 'main'
  const [owner, repository] = input.repository.split('/')
  const api = `https://api.github.com/repos/${owner}/${repository}`
  const base = await githubJson(token, `${api}/git/ref/heads/${encodeURIComponent(baseBranch)}`)
  const baseSha = base.object.sha as string

  if (!input.execute) {
    return {
      ok: true,
      phase: 'authorized',
      dry_run: true,
      repository: input.repository,
      base_branch: baseBranch,
      base_sha: baseSha,
      branch: input.branch,
      planned_files: input.files.map((file) => file.path),
    }
  }

  await githubJson(token, `${api}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: baseSha }),
  })

  const commits: string[] = []
  for (const file of input.files) {
    let existingSha: string | undefined
    const existing = await fetch(`${api}/contents/${file.path}?ref=${encodeURIComponent(input.branch)}`, {
      headers: githubApiHeaders(token),
    })
    if (existing.ok) existingSha = (await existing.json()).sha

    const result = await githubJson(token, `${api}/contents/${file.path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `${input.summary}: ${file.path}`,
        content: btoa(unescape(encodeURIComponent(file.content))),
        branch: input.branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    })
    commits.push(result.commit.sha)
  }

  const compare = await githubJson(
    token,
    `${api}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(input.branch)}`,
  )
  const changedFiles = (compare.files || []).map((file: { filename: string }) => file.filename)
  const planned = new Set(input.files.map((file) => file.path))
  const unexpectedFiles = changedFiles.filter((file: string) => !planned.has(file))

  return {
    ok: unexpectedFiles.length === 0,
    phase: unexpectedFiles.length === 0 ? 'observed' : 'failed',
    repository: input.repository,
    base_branch: baseBranch,
    base_sha: baseSha,
    branch: input.branch,
    commit_sha: commits.at(-1) || null,
    changed_files: changedFiles,
    unexpected_files: unexpectedFiles,
    evidence: [
      `GitHub reports branch ${input.branch} from base ${baseSha}.`,
      `GitHub compare reports ${changedFiles.length} changed file(s).`,
      ...(commits.length ? [`GitHub reports commit ${commits.at(-1)}.`] : []),
    ],
  }
}
