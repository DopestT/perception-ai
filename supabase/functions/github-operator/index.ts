import { createClient } from 'npm:@supabase/supabase-js@2'
import { executeBoundedGitHubChange } from '../_shared/github-executor.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

  const githubToken = Deno.env.get('PERCEPTION_GITHUB_TOKEN')
  const url = Deno.env.get('SUPABASE_URL')
  const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
  if (!githubToken || !url || !publishableKeys.default || !secretKeys.default) {
    return json({ error: 'GitHub operator is not configured' }, 503)
  }

  const userClient = createClient(url, publishableKeys.default, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })
  const jwt = authHeader.slice('Bearer '.length).trim()
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt)
  if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)

  const admin = createClient(url, secretKeys.default, { auth: { persistSession: false, autoRefreshToken: false } })

  try {
    const input = await req.json()
    const projectId = input?.permission?.project_id
    if (typeof projectId !== 'string') return json({ error: 'Project permission scope is required' }, 400)

    const { data: project } = await admin
      .from('perception_projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (!project) return json({ error: 'Project permission scope is invalid' }, 403)

    const baseBranch = input.base_branch || 'main'
    const actionKey = `github.change:${input.repository}:${input.branch}`
    const target = `github://${input.repository}@${baseBranch}`

    const { data: grants, error: grantError } = await admin
      .from('perception_permission_grants')
      .select('id, permission_level, expires_at')
      .eq('user_id', userData.user.id)
      .eq('project_id', projectId)
      .eq('capability', 'code')
      .eq('target', target)
      .is('revoked_at', null)

    if (grantError) throw new Error(`Permission lookup failed: ${grantError.message}`)

    const rank: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 }
    const requestedRank = rank[input?.permission?.level] ?? -1
    const now = Date.now()
    const grant = (grants || []).find((candidate) => {
      const expiry = candidate.expires_at ? new Date(candidate.expires_at).getTime() : null
      return (rank[candidate.permission_level] ?? -1) >= requestedRank && (expiry === null || expiry > now)
    })

    if (!grant || requestedRank < 2) {
      return json({ error: 'Active scoped P2/P3 permission grant required' }, 403)
    }
    const record = async (phase: string, details: Record<string, unknown>, evidence: unknown[] = []) => {
      const { error } = await admin.rpc('perception_record_execution_entry_internal', {
        p_user_id: userData.user.id,
        p_project_id: projectId,
        p_action_key: actionKey,
        p_phase: phase,
        p_permission_level: input.permission.level,
        p_capability: 'code',
        p_target: target,
        p_details: details,
        p_evidence: evidence,
      })
      if (error) throw new Error(`Execution ledger write failed: ${error.message}`)
    }

    await record('authorized', { dry_run: !input.execute, summary: input.summary, branch: input.branch, permission_grant_id: grant.id })
    if (input.execute) await record('attempted', { planned_files: input.files?.map((file: { path: string }) => file.path) || [] })

    const result = await executeBoundedGitHubChange(input, githubToken)

    if (result.phase === 'observed') {
      await record('observed', { branch: result.branch, commit_sha: result.commit_sha, changed_files: result.changed_files }, result.evidence || [])
      if (result.ok) {
        await record('verified', { branch: result.branch, commit_sha: result.commit_sha, changed_files: result.changed_files }, result.evidence || [])

        const verifiedReality = [
          `Verified GitHub change on ${input.repository}.`,
          `Branch: ${result.branch}.`,
          result.commit_sha ? `Commit: ${result.commit_sha}.` : '',
          result.changed_files?.length ? `Changed: ${result.changed_files.join(', ')}.` : '',
        ].filter(Boolean).join(' ')

        const { error: worldError } = await admin.rpc('perception_apply_verified_operator_effect_internal', {
          p_user_id: userData.user.id,
          p_project_id: projectId,
          p_action_key: actionKey,
          p_summary: verifiedReality,
          p_evidence: result.evidence || [],
        })
        if (worldError) throw new Error(`Project World verified-effect update failed: ${worldError.message}`)
      }
    } else if (!result.ok) {
      await record(result.phase === 'blocked' ? 'blocked' : 'failed', { failures: result.failures || result.unexpected_files || [] })
    }

    return json({ ...result, ledger_recorded: true }, result.ok ? 200 : 400)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error('GitHub operator failed', message)

    if (message.startsWith('GitHub 401:')) {
      return json({
        ok: false,
        phase: 'failed',
        error: 'GitHub rejected the configured Operator token. Create a new fine-grained token and update PERCEPTION_GITHUB_TOKEN.',
        diagnostic: 'github_credential_rejected',
      })
    }

    if (message.startsWith('GitHub 403:')) {
      return json({
        ok: false,
        phase: 'failed',
        error: 'GitHub accepted the token but denied this operation. Check repository access and Contents: Read and write permission.',
        diagnostic: 'github_permission_denied',
      })
    }

    if (message.startsWith('GitHub 404:')) {
      return json({
        ok: false,
        phase: 'failed',
        error: 'The configured GitHub token cannot access DopestT/perception-ai. Confirm the repository is selected on the fine-grained token.',
        diagnostic: 'github_repository_not_accessible',
      })
    }

    return json({
      ok: false,
      phase: 'failed',
      error: 'GitHub Operator failed before verification.',
      diagnostic: message.slice(0, 240),
    })
  }
})
