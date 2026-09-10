import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const dollarPrice = (market: Record<string, unknown>, dollarKey: string, centKey: string): number | null => {
  const dollars = numberValue(market[dollarKey])
  if (dollars != null) return clamp(dollars)
  const cents = numberValue(market[centKey])
  return cents == null ? null : clamp(cents / 100)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401)
    const token = authHeader.slice(7).trim()

    const url = Deno.env.get('SUPABASE_URL')
    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<string, string>
    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    const publishableKey = publishableKeys.default
    const secretKey = secretKeys.default
    if (!url || !publishableKey || !secretKey) return json({ error: 'Forecast intelligence runtime unavailable' }, 503)

    const userClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser(token)
    if (userError || !userData.user) return json({ error: 'Invalid session' }, 401)

    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const action = typeof body?.action === 'string' ? body.action : ''
    if (action !== 'kalshi_market') return json({ error: 'Unsupported action' }, 400)

    const forecastId = typeof body?.forecast_id === 'string' ? body.forecast_id.trim() : ''
    const ticker = typeof body?.ticker === 'string' ? body.ticker.trim() : ''
    if (!forecastId || !ticker) return json({ error: 'forecast_id and ticker required' }, 400)
    if (!/^[A-Za-z0-9._:-]{2,160}$/.test(ticker)) return json({ error: 'Invalid Kalshi ticker format' }, 400)

    const sourceRef = `https://external-api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(ticker)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    let response: Response
    try {
      response = await fetch(sourceRef, {
        headers: { Accept: 'application/json', 'User-Agent': 'Perception-Forecast/1.0' },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      console.warn('Kalshi market fetch failed', { ticker, status: response.status })
      return json({ error: 'Kalshi market could not be retrieved', status: response.status }, response.status === 404 ? 404 : 502)
    }

    const payload = await response.json() as Record<string, unknown>
    const market = (payload.market && typeof payload.market === 'object' ? payload.market : payload) as Record<string, unknown>

    const yesBid = dollarPrice(market, 'yes_bid_dollars', 'yes_bid')
    const yesAsk = dollarPrice(market, 'yes_ask_dollars', 'yes_ask')
    const lastPrice = dollarPrice(market, 'last_price_dollars', 'last_price')

    let impliedProbability: number | null = null
    if (yesBid != null && yesAsk != null) impliedProbability = clamp((yesBid + yesAsk) / 2)
    else if (lastPrice != null) impliedProbability = lastPrice
    else if (yesBid != null) impliedProbability = yesBid
    else if (yesAsk != null) impliedProbability = yesAsk

    if (impliedProbability == null) return json({ error: 'Kalshi market has no usable YES price' }, 422)

    const spread = yesBid != null && yesAsk != null ? clamp(yesAsk - yesBid, 0, 1) : null
    const volume = Math.max(0, numberValue(market.volume_fp) ?? numberValue(market.volume) ?? 0)
    const liquidity = clamp(Math.log10(volume + 1) / 4)
    const spreadQuality = spread == null ? 0.65 : clamp(1 - spread * 2.5, 0.2, 1)
    const rawWeight = 0.55 + liquidity * 0.85
    const calibratedWeight = Math.max(0.15, rawWeight * spreadQuality)
    const confidence = clamp(0.42 + liquidity * 0.34 + spreadQuality * 0.24)
    const manipulationRisk = clamp((spread ?? 0.15) * 1.5 + (volume < 25 ? 0.22 : 0) + (volume < 5 ? 0.15 : 0))

    const marketTitle = [market.title, market.yes_sub_title, market.subtitle]
      .find((value) => typeof value === 'string' && value.trim()) as string | undefined

    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await admin.rpc('perception_record_market_signal_internal', {
      p_user_id: userData.user.id,
      p_forecast_id: forecastId,
      p_provider: 'kalshi',
      p_market_ticker: ticker,
      p_market_title: marketTitle ?? ticker,
      p_implied_probability: impliedProbability,
      p_yes_bid: yesBid,
      p_yes_ask: yesAsk,
      p_last_price: lastPrice,
      p_spread: spread,
      p_volume: volume,
      p_source_ref: sourceRef,
      p_raw_payload: market,
      p_raw_weight: rawWeight,
      p_calibrated_weight: calibratedWeight,
      p_confidence: confidence,
      p_manipulation_risk: manipulationRisk,
    })

    if (error) {
      console.error('Forecast market signal RPC failed', { code: error.code, message: error.message })
      return json({ error: 'Forecast market signal could not be recorded' }, 500)
    }

    return json({
      ok: true,
      provider: 'kalshi',
      market: {
        ticker,
        title: marketTitle ?? ticker,
        implied_probability: impliedProbability,
        yes_bid: yesBid,
        yes_ask: yesAsk,
        last_price: lastPrice,
        spread,
        volume,
        confidence,
        manipulation_risk: manipulationRisk,
      },
      result: data,
    })
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError'
      ? 'Kalshi market request timed out'
      : 'Unexpected forecast intelligence failure'
    console.error('Forecast intelligence failure', error instanceof Error ? error.message : 'unknown')
    return json({ error: message }, message.includes('timed out') ? 504 : 500)
  }
})
