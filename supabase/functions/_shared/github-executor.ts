export type GitHubExecutionRequest = {
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

export function findUnexpectedChangedFiles(changedFiles: string[], plannedFiles: string[]): string[] {
  const planned = new Set(plannedFiles)
  return changedFiles.filter((file) => !planned.has(file))
}

export function validateExistingBranchForReuse(
  compareStatus: string | null | undefined,
  changedFiles: string[],
  plannedFiles: string[],
): string[] {
  const failures: string[] = []
  if (compareStatus && !['ahead', 'identical'].includes(compareStatus)) {
    failures.push(
      `Existing working branch is not safely reusable against the current base branch (status: ${compareStatus}).`,
    )
  }

  const unexpected = findUnexpectedChangedFiles(changedFiles, plannedFiles)
  if (unexpected.length) {
    failures.push(`Existing working branch contains unplanned changes: ${unexpected.join(', ')}`)
  }
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

async function githubJsonIfPresent(token: string, url: string) {
  const response = await fetch(url, { headers: githubApiHeaders(token) })
  if (response.status === 404) return null
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${body?.message || 'request failed'}`)
  return body
}

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeUtf8Base64(value: string): string {
  const binary = atob(value.replace(/\s+/g, ''))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export async function executeBoundedGitHubChange(input: GitHubExecutionRequest, token: string) {
  const failures = validateGitHubExecutionRequest(input)
  if (failures.length) return { ok: false, phase: 'blocked', failures }

  const baseBranch = input.base_branch || 'main'
  const [owner, repository] = input.repository.split('/')
  const api = `https://api.github.com/repos/${owner}/${repository}`
  const base = await githubJson(token, `${api}/git/ref/heads/${encodeURIComponent(baseBranch)}`)
  const baseSha = base.object.sha as string
  const plannedFiles = input.files.map((file) => file.path)

  const existingBranch = await githubJsonIfPresent(
    token,
    `${api}/git/ref/heads/${encodeURIComponent(input.branch)}`,
  )
  const branchReused = Boolean(existingBranch)
  let branchHeadSha = existingBranch?.object?.sha as string | undefined
  let existingChangedFiles: string[] = []

  if (existingBranch) {
    const existingCompare = await githubJson(
      token,
      `${api}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(input.branch)}`,
    )
    existingChangedFiles = (existingCompare.files || []).map((file: { filename: string }) => file.filename)
    const reuseFailures = validateExistingBranchForReuse(
      existingCompare.status,
      existingChangedFiles,
      plannedFiles,
    )

    if (reuseFailures.length) {
      return {
        ok: false,
        phase: 'blocked',
        failures: reuseFailures,
        repository: input.repository,
        base_branch: baseBranch,
        base_sha: baseSha,
        branch: input.branch,
        branch_reused: true,
        existing_changed_files: existingChangedFiles,
      }
    }
  }

  if (!input.execute) {
    return {
      ok: true,
      phase: 'authorized',
      dry_run: true,
      repository: input.repository,
      base_branch: baseBranch,
      base_sha: baseSha,
      branch: input.branch,
      branch_reused: branchReused,
      existing_changed_files: existingChangedFiles,
      planned_files: plannedFiles,
    }
  }

  if (!existingBranch) {
    const created = await githubJson(token, `${api}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: baseSha }),
    })
    branchHeadSha = created?.object?.sha || baseSha
  }

  const commits: string[] = []
  const skippedUnchanged: string[] = []

  for (const file of input.files) {
    let existingSha: string | undefined
    let currentContent: string | undefined
    const existing = await githubJsonIfPresent(
      token,
      `${api}/contents/${file.path}?ref=${encodeURIComponent(input.branch)}`,
    )

    if (existing) {
      existingSha = existing.sha
      if (existing.encoding === 'base64' && typeof existing.content === 'string') {
        currentContent = decodeUtf8Base64(existing.content)
      }
    }

    if (currentContent === file.content) {
      skippedUnchanged.push(file.path)
      continue
    }

    const result = await githubJson(token, `${api}/contents/${file.path}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `${input.summary}: ${file.path}`,
        content: encodeUtf8Base64(file.content),
        branch: input.branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    })
    commits.push(result.commit.sha)
    branchHeadSha = result.commit.sha
  }

  const compare = await githubJson(
    token,
    `${api}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(input.branch)}`,
  )
  const changedFiles = (compare.files || []).map((file: { filename: string }) => file.filename)
  const unexpectedFiles = findUnexpectedChangedFiles(changedFiles, plannedFiles)
  const commitSha = commits.at(-1) || branchHeadSha || null

  return {
    ok: unexpectedFiles.length === 0,
    phase: unexpectedFiles.length === 0 ? 'observed' : 'failed',
    repository: input.repository,
    base_branch: baseBranch,
    base_sha: baseSha,
    branch: input.branch,
    branch_reused: branchReused,
    commit_sha: commitSha,
    changed_files: changedFiles,
    unexpected_files: unexpectedFiles,
    writes_performed: commits.length,
    skipped_unchanged: skippedUnchanged,
    evidence: [
      `GitHub reports ${branchReused ? 'reused' : 'created'} bounded branch ${input.branch} from base ${baseSha}.`,
      `GitHub compare reports ${changedFiles.length} changed file(s).`,
      `GitHub operator performed ${commits.length} content write(s) and skipped ${skippedUnchanged.length} unchanged file(s).`,
      ...(commitSha ? [`GitHub reports branch head commit ${commitSha}.`] : []),
    ],
  }
}
