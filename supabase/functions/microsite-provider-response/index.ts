import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import {
  handleMicrositeProviderResponse,
  type ProviderResponseRepository,
} from '../_shared/microsite-provider-response.ts'
import { dispatchHomeownerNotice } from '../_shared/microsite-delivery.ts'
import { renderHomeownerNotice } from '../_shared/microsite-routing.ts'

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

    if (result.body.status === 'accepted') {
      const verified = await repo.getOffer((await import('../_shared/microsite-offer-token.ts')).then ? '' : '')
      void verified
    }

    if (result.body.status === 'accepted') {
      // Derive the accepted offer from the token only after the scoped handler has verified it.
      const { verifyOfferToken } = await import('../_shared/microsite-offer-token.ts')
      const verifiedToken = await verifyOfferToken(token, secret)
      if (verifiedToken.ok) {
        const { data: offer, error: offerError } = await admin
          .from('perception_microsite_lead_offers')
          .select('id,user_id,lead_id,route_id,provider_id')
          .eq('id', verifiedToken.payload.offerId)
          .maybeSingle()
        if (offerError) throw new Error(`accepted_offer_lookup:${offerError.code}`)

        if (offer) {
          const { data: route, error: routeError } = await admin
            .from('perception_microsite_lead_routes')
            .select('id,practice,accepted_provider_id')
            .eq('id', offer.route_id)
            .maybeSingle()
          if (routeError) throw new Error(`accepted_route_lookup:${routeError.code}`)

          if (route?.accepted_provider_id === offer.provider_id) {
            const [{ data: lead, error: leadError }, { data: provider, error: providerError }] = await Promise.all([
              admin.from('perception_microsite_leads').select('id,user_id,microsite_id').eq('id', offer.lead_id).maybeSingle(),
              admin.from('perception_microsite_providers').select('id,display_name').eq('id', offer.provider_id).maybeSingle(),
            ])
            if (leadError) throw new Error(`accepted_lead_lookup:${leadError.code}`)
            if (providerError) throw new Error(`accepted_provider_lookup:${providerError.code}`)

            if (lead && provider) {
              const { data: config, error: configError } = await admin
                .from('perception_microsite_routing_configs')
                .select('mode')
                .eq('microsite_id', lead.microsite_id)
                .maybeSingle()
              if (configError) throw new Error(`accepted_config_lookup:${configError.code}`)
              if (config) {
                const rendered = renderHomeownerNotice('PROVIDER_ACCEPTED', {
                  leadId: lead.id,
                  acceptedProviderId: provider.id,
                  providerName: provider.display_name,
                  simulated: config.mode !== 'LIVE',
                })
                const delivery = await dispatchHomeownerNotice({
                  leadId: lead.id,
                  type: 'PROVIDER_ACCEPTED',
                  rendered: { subject: rendered.subject, body: rendered.body },
                }, config.mode)
                const { error: eventError } = await admin.from('perception_microsite_lead_events').upsert({
                  user_id: lead.user_id,
                  lead_id: lead.id,
                  route_id: route.id,
                  offer_id: offer.id,
                  event_type: 'homeowner.notice.provider_accepted',
                  actor_source: 'microsite-provider-response',
                  provider_id: provider.id,
                  idempotency_key: `notice:provider-accepted:${lead.id}`,
                  metadata: { type: 'PROVIDER_ACCEPTED', delivery },
                  practice: route.practice,
                }, { onConflict: 'lead_id,idempotency_key', ignoreDuplicates: true })
                if (eventError) throw new Error(`accepted_notice_event:${eventError.code}`)
              }
            }
          }
        }
      }
    }

    return json(result.body, result.statusCode)
  } catch {
    // Raw one-off tokens are never logged.
    console.error('microsite_provider_response_failed')
    return json({ ok: false, error: 'response_unavailable' }, 503)
  }
})
