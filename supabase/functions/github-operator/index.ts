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

  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

  const token = Deno.env.get('PERCEPTION_GITHUB_TOKEN')
  if (!token) return json({ error: 'GitHub operator is not configured' }, 503)

  try {
    const input = await req.json()
    const result = await executeBoundedGitHubChange(input, token)
    return json(result, result.ok ? 200 : 400)
  } catch (error) {
    console.error('GitHub operator failed', error instanceof Error ? error.message : 'unknown error')
    return json({ error: 'GitHub operator execution failed' }, 500)
  }
})
