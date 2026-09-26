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

    await record('authorized', { dry_run: !input.execute, summary: input.summary, branch: input.branch })
    if (input.execute) await record('attempted', { planned_files: input.files?.map((file: { path: string }) => file.path) || [] })

    const result = await executeBoundedGitHubChange(input, githubToken)

    if (result.phase === 'observed') {
      await record('observed', { branch: result.branch, commit_sha: result.commit_sha, changed_files: result.changed_files }, result.evidence || [])
      if (result.ok) {
        await record('verified', { branch: result.branch, commit_sha: result.commit_sha, changed_files: result.changed_files }, result.evidence || [])
      }
    } else if (!result.ok) {
      await record(result.phase === 'blocked' ? 'blocked' : 'failed', { failures: result.failures || result.unexpected_files || [] })
    }

    return json({ ...result, ledger_recorded: true }, result.ok ? 200 : 400)
  } catch (error) {
    console.error('GitHub operator failed', error instanceof Error ? error.message : 'unknown error')
    return json({ error: 'GitHub operator execution failed' }, 500)
  }
})
