import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)

    const token = authHeader.slice('Bearer '.length).trim()
    if (!token) return json({ error: 'Authentication required' }, 401)

    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const url = Deno.env.get('SUPABASE_URL')
    const publishableKey = publishableKeys.default
    const secretKey = secretKeys.default

    if (!url || !publishableKey || !secretKey) {
      console.error('Perception runtime environment is incomplete')
      return json({ error: 'Runtime unavailable' }, 503)
    }

    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    })

    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)

    const payload = await req.json().catch(() => null) as { statement?: unknown } | null
    const statement = typeof payload?.statement === 'string' ? payload.statement.trim() : ''
    if (statement.length < 3) return json({ error: 'Objective must contain at least 3 characters' }, 400)
    if (statement.length > 10000) return json({ error: 'Objective is too long' }, 413)

    const admin = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await admin.rpc('perception_submit_objective_internal', {
      p_user_id: userData.user.id,
      p_statement: statement,
    })

    if (error) {
      console.error('Perception objective runtime failed', { code: error.code, message: error.message })
      return json({ error: 'Objective runtime failed' }, 500)
    }

    return json(data)
  } catch (error) {
    console.error('Perception edge failure', error instanceof Error ? error.message : 'unknown error')
    return json({ error: 'Unexpected runtime failure' }, 500)
  }
})
