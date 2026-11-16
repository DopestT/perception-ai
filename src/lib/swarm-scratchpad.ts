/**
 * PERCEPTION coding swarm: short-lived, in-process working memory.
 *
 * This cache is an optimization, never the source of truth. It performs no
 * network calls and cannot grant permissions, execute code, store credentials,
 * update Project World, or certify task completion. A future trusted adapter
 * must enforce identity/authorization before invoking this API.
 */
export type ScratchKind =
  | 'file-map'
  | 'interface-contract'
  | 'code-context'
  | 'task-decision'
  | 'test-result'
  | 'handoff'
  | 'risk-note'

export type ScratchScope = Readonly<{
  projectId: string
  objectiveId: string
  taskId: string
  agentId: string
}>

export type ScratchItem = Readonly<{
  key: string
  kind: ScratchKind
  summary: string
  sourceRef: string
  createdAt: number
  expiresAt: number
  sharedForReview: boolean
}>

export type ScratchPut = {
  key: string
  kind: ScratchKind
  summary: string
  sourceRef: string
  /** Reviewers may read a marked handoff, never edit it. Not an approval. */
  sharedForReview?: boolean
  ttlMs?: number
}

const DEFAULT_TTL_MS = 20 * 60 * 1000
const MIN_TTL_MS = 1000
const MAX_TTL_MS = 60 * 60 * 1000
const MAX_ITEMS_PER_AGENT_TASK = 24
const MAX_ENTRIES_TOTAL = 128
const MAX_CONTENT_CHARS = 1600
const ALLOWED_KINDS: readonly ScratchKind[] = [
  'file-map', 'interface-contract', 'code-context', 'task-decision',
  'test-result', 'handoff', 'risk-note',
]

const suspiciousContent = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk-proj-|sk-[A-Za-z0-9]{20,})\b/,
  /\b(?:authorization\s*:\s*bearer|bearer\s+[A-Za-z0-9._-]{12,})\b/i,
  /\b(?:password|secret|api[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*\S{4,}/i,
  /\b(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{16,}\b/,
]

function validateScope(scope: ScratchScope): void {
  for (const value of [scope.projectId, scope.objectiveId, scope.taskId, scope.agentId]) {
    if (!value || typeof value !== 'string' || value.length > 128 || !/^[a-zA-Z0-9_.:-]+$/.test(value)) {
      throw new Error('invalid_scratch_scope')
    }
  }
}

function validateText(value: string, maxLength: number): void {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)
    || suspiciousContent.some(pattern => pattern.test(value))) {
    throw new Error('invalid_or_sensitive_scratch_content')
  }
}

function scopeKey(scope: ScratchScope): string {
  // Avoid delimiting ambiguous identifiers with a character they may contain.
  return JSON.stringify([scope.projectId, scope.objectiveId, scope.taskId, scope.agentId])
}

type InternalItem = ScratchItem & { scope: ScratchScope }

/**
 * Each isolated execution process owns a separate memory instance.
 * No browser localStorage, provider memory, hidden durable files or database.
 */
export class SwarmScratchpad {
  private readonly entries = new Map<string, InternalItem>()

  private purge(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key)
    }
  }

  put(scope: ScratchScope, input: ScratchPut, now = Date.now()): ScratchItem {
    validateScope(scope)
    validateText(input.key, 90)
    validateText(input.summary, MAX_CONTENT_CHARS)
    validateText(input.sourceRef, 350)
    if (!ALLOWED_KINDS.includes(input.kind)) throw new Error('invalid_scratch_kind')
    const ttl = input.ttlMs ?? DEFAULT_TTL_MS
    if (!Number.isSafeInteger(ttl) || ttl < MIN_TTL_MS || ttl > MAX_TTL_MS) {
      throw new Error('invalid_scratch_ttl')
    }
    if (!Number.isSafeInteger(now) || now < 0) throw new Error('invalid_scratch_clock')
    if (input.sharedForReview && input.kind !== 'handoff' && input.kind !== 'test-result') {
      throw new Error('review_share_requires_handoff_or_test_result')
    }

    this.purge(now)
    const compartment = scopeKey(scope)
    const entryId = JSON.stringify([compartment, input.key])
    const existing = this.entries.get(entryId)
    if (!existing) {
      const count = [...this.entries.values()].filter(e => scopeKey(e.scope) === compartment).length
      if (count >= MAX_ITEMS_PER_AGENT_TASK || this.entries.size >= MAX_ENTRIES_TOTAL) {
        throw new Error('scratch_budget_exceeded')
      }
    }
    const saved: InternalItem = {
      key: input.key, kind: input.kind, summary: input.summary, sourceRef: input.sourceRef,
      createdAt: now, expiresAt: now + ttl, sharedForReview: input.sharedForReview === true,
      scope: { ...scope },
    }
    this.entries.set(entryId, saved)
    return this.publicItem(saved)
  }

  read(scope: ScratchScope, now = Date.now()): ScratchItem[] {
    validateScope(scope)
    this.purge(now)
    const compartment = scopeKey(scope)
    return [...this.entries.values()]
      .filter(entry => scopeKey(entry.scope) === compartment)
      .map(entry => this.publicItem(entry))
  }

  /** Read-only, explicitly marked handoffs from one task owner to its reviewer. */
  readForReview(source: ScratchScope, requestingReviewerAgentId: string, now = Date.now()): ScratchItem[] {
    validateScope(source)
    validateText(requestingReviewerAgentId, 128)
    // Enforcing the roster's reviewer role prevents unrelated workers from
    // reading cross-agent notes. Caller identity still requires trusted adapter.
    const reviewers = ['qa-reviewer', 'security-reviewer', 'truth-verifier']
    if (!reviewers.includes(requestingReviewerAgentId) || requestingReviewerAgentId === source.agentId) {
      throw new Error('review_access_denied')
    }
    return this.read(source, now).filter(item => item.sharedForReview)
  }

  clearTask(scope: ScratchScope): number {
    validateScope(scope)
    const compartment = scopeKey(scope)
    let count = 0
    for (const [key, entry] of this.entries) {
      if (scopeKey(entry.scope) === compartment) { this.entries.delete(key); count += 1 }
    }
    return count
  }

  clearAll(): void { this.entries.clear() }

  get size(): number { this.purge(Date.now()); return this.entries.size }

  private publicItem(entry: InternalItem): ScratchItem {
    return Object.freeze({
      key: entry.key, kind: entry.kind, summary: entry.summary,
      sourceRef: entry.sourceRef, createdAt: entry.createdAt,
      expiresAt: entry.expiresAt, sharedForReview: entry.sharedForReview,
    })
  }
}
