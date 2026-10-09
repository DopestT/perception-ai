import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import {
  handleMicrositeProviderResponse,
  type ProviderResponseRepository,
} from '../_shared/microsite-provider-response.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  const token = typeof body?.token === 'string' ? body.token : ''
  const response = typeof body?.response === 'string' ? body.response : ''

  const secret = Deno.env.get('MICROSITE_OFFER_TOKEN_SECRET') ?? ''
  const url = Deno.env.get('SUPABASE_URL')
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
  const serviceKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY')
  if (!secret || !url || !serviceKey) return json({ ok: false, error: 'response_unavailable' }, 503)

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const repo: ProviderResponseRepository = {
    async getOffer(offerId) {
      const { data, error } = await admin
        .from('perception_microsite_lead_offers')
        .select('id,route_id,status,expires_at')
        .eq('id', offerId)
        .maybeSingle()
      if (error) throw new Error(`offer_lookup:${error.code}`)
      if (!data) return null
      return { id: data.id, routeId: data.route_id, status: data.status, expiresAt: data.expires_at }
    },
    async resolvePass(offerId, idempotencyKey) {
      const { data, error } = await admin.rpc('perception_resolve_microsite_offer', {
        p_offer_id: offerId,
        p_outcome: 'PASSED',
        p_idempotency_key: idempotencyKey,
      })
      if (error) throw new Error(`offer_pass:${error.code}`)
      return data as { status: string }
    },
    async acceptOffer(offerId, idempotencyKey) {
      const { data, error } = await admin.rpc('perception_accept_microsite_offer', {
        p_offer_id: offerId,
        p_idempotency_key: idempotencyKey,
      })
      if (error) throw new Error(`offer_accept:${error.code}`)
      return data as { status: string; provider_id?: string }
    },
  }

  try {
    const result = await handleMicrositeProviderResponse({ token, response }, repo, secret)
    return json(result.body, result.statusCode)
  } catch {
    // Raw one-off tokens are never logged.
    console.error('microsite_provider_response_failed')
    return json({ ok: false, error: 'response_unavailable' }, 503)
  }
})
