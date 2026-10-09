import { createClient } from 'npm:@supabase/supabase-js@2.116.0'
import {
  startMicrositeRouting,
  tickMicrositeRouting,
  type CreateOfferInput,
  type MicrositeRouterRepository,
  type RouterLead,
  type RouterOffer,
  type RouterProvider,
  type RouterRoute,
  type RoutingConfig,
  type StartRouteInput,
  type TransitionLeadInput,
} from '../_shared/microsite-router.ts'
import type { DeliveryResult } from '../_shared/microsite-delivery.ts'
import type { RoutingPerformance } from '../_shared/microsite-routing.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

function safeText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function makeRepository(admin: ReturnType<typeof createClient>): MicrositeRouterRepository {
  const mapProvider = (row: Record<string, unknown>): RouterProvider => ({
    id: String(row.id),
    displayName: String(row.display_name ?? ''),
    status: row.status as RouterProvider['status'],
    acceptingNewWork: row.accepting_new_work === true,
    serviceKeys: asStringArray(row.service_keys) as RouterProvider['serviceKeys'],
    serviceAreaKeys: asStringArray(row.service_areas),
    emergencyCapable: row.emergency_capable === true,
    priorityBias: Number(row.priority_bias ?? 0),
  })

  const getOffer = async (offerId: string): Promise<RouterOffer> => {
    const { data, error } = await admin.from('perception_microsite_lead_offers').select('*').eq('id', offerId).single()
    if (error || !data) throw new Error(`offer lookup failed: ${error?.code ?? 'not_found'}`)
    return {
      id: data.id,
      routeId: data.route_id,
      leadId: data.lead_id,
      providerId: data.provider_id,
      rank: Number(data.rank),
      status: data.status,
      score: Number(data.score),
      scoreReasons: (data.score_reasons ?? {}) as Record<string, number>,
      expiresAt: data.expires_at,
    }
  }

  const repo: MicrositeRouterRepository = {
    async getLead(leadId): Promise<RouterLead | null> {
      const { data, error } = await admin
        .from('perception_microsite_leads')
        .select('id,user_id,microsite_id,state,metadata')
        .eq('id', leadId)
        .maybeSingle()
      if (error) throw new Error(`lead lookup failed: ${error.code}`)
      if (!data) return null
      return {
        id: data.id,
        userId: data.user_id,
        micrositeId: data.microsite_id,
        state: data.state,
        metadata: (data.metadata ?? {}) as Record<string, unknown>,
      }
    },

    async getRoutingConfig(micrositeId): Promise<RoutingConfig | null> {
      const { data, error } = await admin
        .from('perception_microsite_routing_configs')
        .select('microsite_id,mode,outbound_enabled,service_area_rules,emergency_timeout_seconds,routine_timeout_seconds')
        .eq('microsite_id', micrositeId)
        .maybeSingle()
      if (error) throw new Error(`routing config lookup failed: ${error.code}`)
      if (!data) return null
      return {
        micrositeId: data.microsite_id,
        mode: data.mode,
        outboundEnabled: data.outbound_enabled,
        serviceAreaRules: Array.isArray(data.service_area_rules) ? data.service_area_rules : [],
        emergencyTimeoutSeconds: Number(data.emergency_timeout_seconds),
        routineTimeoutSeconds: Number(data.routine_timeout_seconds),
      }
    },

    async listProviders(userId): Promise<RouterProvider[]> {
      const { data, error } = await admin
        .from('perception_microsite_providers')
        .select('id,display_name,status,accepting_new_work,service_keys,service_areas,emergency_capable,priority_bias')
        .eq('user_id', userId)
      if (error) throw new Error(`provider lookup failed: ${error.code}`)
      return (data ?? []).map((row) => mapProvider(row as Record<string, unknown>))
    },

    async getProvider(providerId): Promise<RouterProvider | null> {
      const { data, error } = await admin
        .from('perception_microsite_providers')
        .select('id,display_name,status,accepting_new_work,service_keys,service_areas,emergency_capable,priority_bias')
        .eq('id', providerId)
        .maybeSingle()
      if (error) throw new Error(`provider lookup failed: ${error.code}`)
      return data ? mapProvider(data as Record<string, unknown>) : null
    },

    async getProviderPerformance(_userId): Promise<Record<string, RoutingPerformance>> {
      // Bootstrap routing has no observed performance history yet. Unknown history is neutral.
      return {}
    },

    async transitionLead(input: TransitionLeadInput) {
      const { error } = await admin.rpc('perception_transition_microsite_lead', {
        p_lead_id: input.leadId,
        p_next_state: input.nextState,
        p_event_type: input.eventType,
        p_provider_id: input.providerId ?? null,
        p_metadata: input.metadata ?? {},
        p_idempotency_key: input.idempotencyKey,
      })
      if (error) throw new Error(`lead transition failed: ${error.code}`)
    },

    async startRoute(input: StartRouteInput): Promise<RouterRoute> {
      const { data, error } = await admin.rpc('perception_start_microsite_route', {
        p_lead_id: input.leadId,
        p_service_key: input.serviceKey,
        p_service_area_key: input.serviceAreaKey,
        p_urgency: input.urgency,
        p_practice: input.practice,
        p_idempotency_key: input.idempotencyKey,
      })
      if (error || !data) throw new Error(`route start failed: ${error?.code ?? 'no_result'}`)
      const route = await repo.getRoute(String(data))
      if (!route) throw new Error('route start returned an unreadable route')
      return route
    },

    async getRoute(routeId): Promise<RouterRoute | null> {
      const { data, error } = await admin
        .from('perception_microsite_lead_routes')
        .select('id,lead_id,route_status,practice,service_key,service_area_key,urgency,accepted_provider_id')
        .eq('id', routeId)
        .maybeSingle()
      if (error) throw new Error(`route lookup failed: ${error.code}`)
      if (!data) return null
      return {
        id: data.id,
        leadId: data.lead_id,
        status: data.route_status,
        practice: data.practice,
        serviceKey: data.service_key,
        serviceAreaKey: data.service_area_key,
        urgency: data.urgency,
        acceptedProviderId: data.accepted_provider_id,
      }
    },

    async listOffers(routeId): Promise<RouterOffer[]> {
      const { data, error } = await admin
        .from('perception_microsite_lead_offers')
        .select('id,route_id,lead_id,provider_id,rank,status,score,score_reasons,expires_at')
        .eq('route_id', routeId)
        .order('rank', { ascending: true })
      if (error) throw new Error(`offer list failed: ${error.code}`)
      return (data ?? []).map((row) => ({
        id: row.id,
        routeId: row.route_id,
        leadId: row.lead_id,
        providerId: row.provider_id,
        rank: Number(row.rank),
        status: row.status,
        score: Number(row.score),
        scoreReasons: (row.score_reasons ?? {}) as Record<string, number>,
        expiresAt: row.expires_at,
      }))
    },

    async createOffer(input: CreateOfferInput): Promise<RouterOffer> {
      const { data, error } = await admin.rpc('perception_create_microsite_offer', {
        p_route_id: input.routeId,
        p_provider_id: input.providerId,
        p_rank: input.rank,
        p_score: input.score,
        p_score_reasons: input.scoreReasons,
        p_expires_at: input.expiresAt,
        p_idempotency_key: input.idempotencyKey,
      })
      if (error || !data) throw new Error(`offer create failed: ${error?.code ?? 'no_result'}`)
      return await getOffer(String(data))
    },

    async recordOfferDelivery(offerId: string, delivery: DeliveryResult) {
      const { data: offerRow, error: offerError } = await admin
        .from('perception_microsite_lead_offers')
        .select('id,user_id,lead_id,route_id,provider_id')
        .eq('id', offerId)
        .single()
      if (offerError || !offerRow) throw new Error(`delivery offer lookup failed: ${offerError?.code ?? 'not_found'}`)
      const { error: updateError } = await admin
        .from('perception_microsite_lead_offers')
        .update({ delivery_metadata: delivery.metadata })
        .eq('id', offerId)
      if (updateError) throw new Error(`offer delivery record failed: ${updateError.code}`)
      const { error: eventError } = await admin
        .from('perception_microsite_lead_events')
        .upsert({
          user_id: offerRow.user_id,
          lead_id: offerRow.lead_id,
          route_id: offerRow.route_id,
          offer_id: offerRow.id,
          event_type: delivery.status === 'SIMULATED' ? 'offer.simulated' : 'offer.delivery_blocked',
          actor_source: 'microsite-router',
          provider_id: offerRow.provider_id,
          idempotency_key: `delivery:${offerId}`,
          metadata: delivery.metadata,
          practice: delivery.simulated,
        }, { onConflict: 'lead_id,idempotency_key', ignoreDuplicates: true })
      if (eventError) throw new Error(`offer delivery event failed: ${eventError.code}`)
    },

    async resolveOffer(offerId, outcome, idempotencyKey) {
      const { data, error } = await admin.rpc('perception_resolve_microsite_offer', {
        p_offer_id: offerId,
        p_outcome: outcome,
        p_idempotency_key: idempotencyKey,
      })
      if (error) throw new Error(`offer resolution failed: ${error.code}`)
      return data as { status: string }
    },

    async exhaustRoute(routeId, idempotencyKey) {
      const { data, error } = await admin.rpc('perception_exhaust_microsite_route', {
        p_route_id: routeId,
        p_idempotency_key: idempotencyKey,
      })
      if (error) throw new Error(`route exhaustion failed: ${error.code}`)
      return data as { status: string }
    },
  }
  return repo
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'authentication_required' }, 401)
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return json({ error: 'authentication_required' }, 401)

  try {
    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const url = Deno.env.get('SUPABASE_URL')
    const publishableKey = publishableKeys.default || Deno.env.get('SUPABASE_ANON_KEY')
    const secretKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY')
    if (!url || !publishableKey || !secretKey) return json({ error: 'routing_unavailable' }, 503)

    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user || userData.user.is_anonymous) return json({ error: 'invalid_session' }, 401)

    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const repo = makeRepository(admin)
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const action = safeText(body?.action, 40)
    if (!action) return json({ error: 'action_required' }, 400)

    if (action === 'start') {
      const leadId = safeText(body?.lead_id, 80)
      if (!leadId) return json({ error: 'lead_id_required' }, 400)
      const lead = await repo.getLead(leadId)
      if (!lead) return json({ error: 'not_found' }, 404)
      if (lead.userId !== userData.user.id) return json({ error: 'forbidden' }, 403)
      const result = await startMicrositeRouting(repo, leadId)
      return json({ ok: true, result })
    }

    if (action === 'tick') {
      const routeId = safeText(body?.route_id, 80)
      if (!routeId) return json({ error: 'route_id_required' }, 400)
      const route = await repo.getRoute(routeId)
      if (!route) return json({ error: 'not_found' }, 404)
      const lead = await repo.getLead(route.leadId)
      if (!lead) return json({ error: 'not_found' }, 404)
      if (lead.userId !== userData.user.id) return json({ error: 'forbidden' }, 403)

      let now = new Date()
      const requestedNow = safeText(body?.now, 80)
      if (requestedNow) {
        const config = await repo.getRoutingConfig(lead.micrositeId)
        if (!config || config.mode !== 'PRACTICE') return json({ error: 'custom_now_not_allowed' }, 400)
        now = new Date(requestedNow)
        if (Number.isNaN(now.getTime())) return json({ error: 'invalid_now' }, 400)
      }
      const result = await tickMicrositeRouting(repo, routeId, now)
      return json({ ok: true, result })
    }

    const outcomeStates: Record<string, { state: TransitionLeadInput['nextState']; event: string }> = {
      record_contacted: { state: 'CONTACTED', event: 'homeowner.contacted' },
      record_appointment: { state: 'APPOINTMENT', event: 'appointment.confirmed' },
      record_completed: { state: 'COMPLETED', event: 'job.completed' },
      record_lost: { state: 'LOST', event: 'job.lost' },
    }
    const outcome = outcomeStates[action]
    if (outcome) {
      const leadId = safeText(body?.lead_id, 80)
      if (!leadId) return json({ error: 'lead_id_required' }, 400)
      const lead = await repo.getLead(leadId)
      if (!lead) return json({ error: 'not_found' }, 404)
      if (lead.userId !== userData.user.id) return json({ error: 'forbidden' }, 403)
      await repo.transitionLead({
        leadId,
        nextState: outcome.state,
        eventType: outcome.event,
        metadata: typeof body?.metadata === 'object' && body.metadata ? body.metadata as Record<string, unknown> : {},
        idempotencyKey: `${action}:${leadId}`,
      })
      return json({ ok: true, state: outcome.state })
    }

    return json({ error: 'unknown_action' }, 400)
  } catch (error) {
    console.error('microsite_router_failed', error instanceof Error ? error.message.slice(0, 200) : 'unknown')
    return json({ error: 'routing_unavailable' }, 503)
  }
})
