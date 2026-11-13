import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

// Only globally registered, explicitly unbound PUBLIC GitHub repositories.
// No private OAuth material, no source-to-project reassignment and no cross-project promotion.
const MAX_PER_RUN = 2
const MAX_REPLY_BYTES = 256_000
const FETCH_TIMEOUT_MS = 10_000
const SOURCE_OWNER = 'dopestt'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Source = {
  id: string
  user_id: string
  external_id: string
  label: string
  locator: string | null
  updated_at: string
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return difference === 0
}

async function readBounded(response: Response) {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declared) && declared > MAX_REPLY_BYTES) {
    await response.body?.cancel()
    throw new Error('GitHub response exceeds bounded byte limit')
  }
  const chunks: Uint8Array[] = []
  let bytes = 0
  if (response.body) {
    const reader = response.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > MAX_REPLY_BYTES) {
          await reader.cancel()
          throw new Error('GitHub response exceeds bounded byte limit')
        }
        chunks.push(value)
      }
    } finally {
      reader.releaseLock()
    }
  }
  const all = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder('utf-8', { fatal: false }).decode(all)
}

async function fetchPublicHead(externalId: string) {
  const match = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(externalId)
  if (!match || match[1].toLowerCase() !== SOURCE_OWNER) throw new Error('Repository outside approved public owner')
  const [owner, repo] = match.slice(1)
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=1`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(endpoint, {
      redirect: 'error',
      signal: controller.signal,
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Perception-Source-Registry-Poller/1.0' },
    })
    if (!response.ok) {
      const remaining = response.headers.get('x-ratelimit-remaining')
      await response.body?.cancel()
      if ((response.status === 403 || response.status === 429) && remaining === '0') throw new Error('GitHub public API rate limit')
      if (response.status === 409) {
        // GitHub returns 409 for an empty repository. Verify it independently
        // before recording a metadata-only observation; never invent a commit.
        const metadataReply = await fetch(
          `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
          {
            redirect: 'error',
            signal: controller.signal,
            headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Perception-Source-Registry-Poller/1.0' },
          },
        )
        if (!metadataReply.ok) {
          await metadataReply.body?.cancel()
          throw new Error(`GitHub repository metadata HTTP ${metadataReply.status}`)
        }
        const meta = JSON.parse(await readBounded(metadataReply)) as {
          private?: boolean, full_name?: string, size?: number, updated_at?: string
        }
        if (meta.private !== false
          || meta.full_name?.toLowerCase() !== `${owner}/${repo}`.toLowerCase()
          || meta.size !== 0
          || !meta.updated_at
          || Number.isNaN(Date.parse(meta.updated_at))) {
          throw new Error('GitHub HTTP 409 without verified empty public repository')
        }
        return {
          sha: null,
          date: new Date(meta.updated_at).toISOString(),
          summary: 'Public GitHub repository has no commits',
          sourceUrl: `https://github.com/${owner}/${repo}`,
        }
      }
      if (response.status === 404) throw new Error('GitHub repo unavailable publicly (missing or private)')
      throw new Error(`GitHub HTTP ${response.status}`)
    }
    const commits = JSON.parse(await readBounded(response)) as Array<{
      sha?: string
      commit?: { message?: string, committer?: { date?: string }, author?: { date?: string } }
    }>
    const latest = Array.isArray(commits) ? commits[0] : undefined
    const sha = latest?.sha
    const date = latest?.commit?.committer?.date ?? latest?.commit?.author?.date
    if (!sha || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(sha) || !date || Number.isNaN(Date.parse(date))) {
      throw new Error('Missing verifiable GitHub commit SHA or date')
    }
    return {
      sha,
      date: new Date(date).toISOString(),
      summary: String(latest?.commit?.message ?? '').split('\n')[0].slice(0, 1_000),
      sourceUrl: `https://github.com/${owner}/${repo}/commit/${sha}`,
    }
  } finally {
    clearTimeout(timeout)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const cronToken = req.headers.get('x-perception-cron-token')?.trim() ?? ''
  if (!cronToken) return json({ error: 'Scheduler authentication required' }, 401)
  const url = Deno.env.get('SUPABASE_URL')
  const secrets = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
  if (!url || !secrets.default) return json({ error: 'Runtime unavailable' }, 503)
  const admin = createClient(url, secrets.default, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: secret, error: secretError } = await admin.from('perception_runtime_secret_hashes')
    .select('secret_hash').eq('secret_name', 'continuous_mind_cron').maybeSingle()
  if (secretError || !secret?.secret_hash) return json({ error: 'Scheduler unavailable' }, 503)
  if (!constantTimeEqual(await sha256(cronToken), secret.secret_hash)) return json({ error: 'Invalid scheduler credential' }, 401)

  const { data, error } = await admin.from('perception_sources')
    .select('id,user_id,external_id,label,locator,updated_at')
    .eq('provider', 'github').eq('source_type', 'github_repo')
    .eq('sync_mode', 'poll').eq('enabled', true)
    .order('updated_at', { ascending: true }).limit(200)
  if (error) return json({ error: 'Source list unavailable' }, 503)

  const candidates = (data ?? []) as Source[]
  if (!candidates.length) return json({ ok: true, selected: 0, results: [] })
  const { data: bindings, error: bindingError } = await admin.from('perception_project_source_bindings')
    .select('source_id').eq('active', true).in('source_id', candidates.map((s) => s.id))
  if (bindingError) return json({ error: 'Source isolation check unavailable' }, 503)
  const boundIds = new Set((bindings ?? []).map((b: { source_id: string }) => b.source_id))
  const selected = candidates.filter((s) => !boundIds.has(s.id)).slice(0, MAX_PER_RUN)

  const results: Array<{ source: string, status: string, reason?: string }> = []
  for (const source of selected) {
    try {
      const head = await fetchPublicHead(source.external_id)
      const hash = await sha256(`github:\0${source.external_id}\0${head.sha ?? `empty:${head.date}`}`)
      const { data: outcome, error: ingestError } = await admin.rpc('perception_ingest_project_observation_internal', {
        p_user_id: source.user_id,
        p_project_id: null, // intentionally global evidence only; NEVER auto-bind to a project
        p_provider: 'github',
        p_source_type: 'github_repo',
        p_external_id: source.external_id,
        p_label: source.label,
        p_locator: source.locator,
        p_sync_mode: 'poll',
        p_source_metadata: { registry_poller: 'public_github_v1' },
        p_observation_kind: head.sha ? 'github_head_commit' : 'github_empty_repo',
        p_external_version: head.sha ?? head.date,
        p_content_hash: hash,
        p_summary: `${source.external_id}: ${head.summary}`.slice(0, 3_000),
        p_payload: { sha: head.sha, observed_at: head.date, empty_repository: head.sha === null },
        p_source_ref: head.sourceUrl,
        p_observed_at: head.date,
      })
      if (ingestError || !outcome?.ok) throw new Error('Source observation was not recorded')
      results.push({ source: source.external_id, status: outcome.inserted ? 'new_observation' : 'already_recorded' })
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message.slice(0, 180) : 'Unknown fetch failure'
      await admin.from('perception_sources').update({ last_error: reason, updated_at: new Date().toISOString() })
        .eq('id', source.id).eq('user_id', source.user_id)
      results.push({ source: source.external_id, status: 'failed', reason })
    }
  }

  return json({ ok: true, selected: selected.length, results })
})
