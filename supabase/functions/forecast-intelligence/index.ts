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

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'before', 'by', 'do', 'does', 'for',
  'from', 'has', 'have', 'how', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the',
  'this', 'to', 'was', 'were', 'what', 'when', 'where', 'which', 'who', 'will',
  'with', 'would', 'yes', 'no',
])

function tokens(value: string) {
  return [...new Set((value.toLowerCase().match(/[a-z0-9][a-z0-9'-]{1,}/g) ?? [])
    .filter((token) => !STOP_WORDS.has(token) && token.length > 2))]
}

function similarity(left: string, right: string) {
  const a = new Set(tokens(left))
  const b = new Set(tokens(right))
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared += 1
  const precision = shared / Math.max(1, Math.min(a.size, b.size))
  const union = new Set([...a, ...b]).size
  const jaccard = shared / Math.max(1, union)
  return clamp(precision * 0.72 + jaccard * 0.28)
}

function deadlineFit(forecastDeadline: string, candidateDeadline: unknown) {
  if (typeof candidateDeadline !== 'string' || !candidateDeadline) return 0.45
  const target = new Date(forecastDeadline).getTime()
  const candidate = new Date(candidateDeadline).getTime()
  if (!Number.isFinite(target) || !Number.isFinite(candidate)) return 0.45
  const days = Math.abs(candidate - target) / 86_400_000
  if (days <= 2) return 1
  if (days <= 7) return 0.9
  if (days <= 30) return 0.72
  if (days <= 90) return 0.5
  return 0.25
}

function freshness(value: unknown) {
  if (typeof value !== 'string' || !value) return 0.55
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return 0.55
  const ageDays = Math.max(0, Date.now() - time) / 86_400_000
  if (ageDays <= 1) return 1
  if (ageDays <= 3) return 0.92
  if (ageDays <= 7) return 0.82
  if (ageDays <= 30) return 0.62
  return 0.42
}

async function fetchJson(url: string, timeoutMs = 9_000): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Perception-Forecast/2.0' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json() as Record<string, unknown>
  } finally {
    clearTimeout(timeout)
  }
}

const dollarPrice = (market: Record<string, unknown>, dollarKey: string, centKey: string): number | null => {
  const dollars = numberValue(market[dollarKey])
  if (dollars != null) return clamp(dollars)
  const cents = numberValue(market[centKey])
  return cents == null ? null : clamp(cents / 100)
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

type AdminClient = ReturnType<typeof createClient>

type ForecastRow = {
  id: string
  user_id: string
  project_id: string
  question: string
  deadline: string
  original_probability: number
  current_probability: number
  status: string
}

async function getForecast(admin: AdminClient, userId: string, forecastId: string): Promise<ForecastRow> {
  const { data, error } = await admin
    .from('perception_forecasts')
    .select('id,user_id,project_id,question,deadline,original_probability,current_probability,status')
    .eq('id', forecastId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) throw new Error('Forecast not found')
  if (data.status !== 'open') throw new Error('Forecast is not open')
  return data as ForecastRow
}

async function recordMarketSignal(
  admin: AdminClient,
  userId: string,
  forecastId: string,
  input: {
    provider: string
    ticker: string
    title: string
    probability: number
    yesBid: number | null
    yesAsk: number | null
    lastPrice: number | null
    spread: number | null
    volume: number
    sourceRef: string
    raw: Record<string, unknown>
    matchScore?: number
  },
) {
  const liquidity = clamp(Math.log10(input.volume + 1) / 5)
  const spreadQuality = input.spread == null ? 0.65 : clamp(1 - input.spread * 2.5, 0.18, 1)
  const matchQuality = clamp(input.matchScore ?? 1)
  const rawWeight = 0.45 + liquidity * 0.8
  const calibratedWeight = Math.max(0.12, rawWeight * spreadQuality * (0.55 + 0.45 * matchQuality))
  const confidence = clamp(0.34 + liquidity * 0.28 + spreadQuality * 0.22 + matchQuality * 0.16)
  const manipulationRisk = clamp((input.spread ?? 0.15) * 1.5 + (input.volume < 25 ? 0.22 : 0) + (input.volume < 5 ? 0.15 : 0) + (1 - matchQuality) * 0.18)

  const { data, error } = await admin.rpc('perception_record_market_signal_internal', {
    p_user_id: userId,
    p_forecast_id: forecastId,
    p_provider: input.provider,
    p_market_ticker: input.ticker,
    p_market_title: input.title,
    p_implied_probability: clamp(input.probability),
    p_yes_bid: input.yesBid,
    p_yes_ask: input.yesAsk,
    p_last_price: input.lastPrice,
    p_spread: input.spread,
    p_volume: input.volume,
    p_source_ref: input.sourceRef,
    p_raw_payload: { ...input.raw, perception_match_score: matchQuality },
    p_raw_weight: rawWeight,
    p_calibrated_weight: calibratedWeight,
    p_confidence: confidence,
    p_manipulation_risk: manipulationRisk,
  })
  if (error) throw new Error(`Could not record ${input.provider} signal`)
  return { result: data, confidence, manipulationRisk, calibratedWeight }
}

async function fetchKalshiMarket(ticker: string) {
  const sourceRef = `https://external-api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(ticker)}`
  const payload = await fetchJson(sourceRef)
  const market = (payload.market && typeof payload.market === 'object' ? payload.market : payload) as Record<string, unknown>
  const yesBid = dollarPrice(market, 'yes_bid_dollars', 'yes_bid')
  const yesAsk = dollarPrice(market, 'yes_ask_dollars', 'yes_ask')
  const lastPrice = dollarPrice(market, 'last_price_dollars', 'last_price')
  const probability = yesBid != null && yesAsk != null ? clamp((yesBid + yesAsk) / 2)
    : lastPrice ?? yesBid ?? yesAsk
  if (probability == null) throw new Error('Kalshi market has no usable YES price')
  const spread = yesBid != null && yesAsk != null ? clamp(yesAsk - yesBid) : null
  const volume = Math.max(0, numberValue(market.volume_fp) ?? numberValue(market.volume) ?? 0)
  const title = [market.title, market.yes_sub_title, market.subtitle]
    .find((value) => typeof value === 'string' && value.trim()) as string | undefined
  return { provider: 'kalshi', ticker, title: title ?? ticker, probability, yesBid, yesAsk, lastPrice, spread, volume, sourceRef, raw: market }
}

async function autoMatchKalshi(forecast: ForecastRow) {
  const url = 'https://external-api.kalshi.com/trade-api/v2/markets?status=open&limit=1000&mve_filter=exclude'
  const payload = await fetchJson(url)
  const markets = Array.isArray(payload.markets) ? payload.markets.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : []
  let best: { market: Record<string, unknown>; score: number; lexical: number } | null = null
  for (const market of markets) {
    const text = [market.title, market.subtitle, market.yes_sub_title, market.event_ticker, market.ticker].filter(Boolean).join(' ')
    const lexical = similarity(forecast.question, text)
    const timing = deadlineFit(forecast.deadline, market.expected_expiration_time ?? market.close_time ?? market.expiration_time)
    const score = lexical * 0.88 + timing * 0.12
    if (!best || score > best.score) best = { market, score, lexical }
  }
  if (!best || best.lexical < 0.34 || best.score < 0.42) return null
  const ticker = typeof best.market.ticker === 'string' ? best.market.ticker : ''
  if (!ticker) return null
  const full = await fetchKalshiMarket(ticker)
  return { ...full, matchScore: best.score }
}

async function autoMatchPolymarket(forecast: ForecastRow) {
  const query = tokens(forecast.question).slice(0, 6).join(' ')
  if (!query) return null
  const searchUrl = `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(query)}`
  const search = await fetchJson(searchUrl)
  const events = Array.isArray(search.events) ? search.events.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').slice(0, 6) : []
  const detailed = await Promise.all(events.map(async (event) => {
    const id = typeof event.id === 'string' || typeof event.id === 'number' ? String(event.id) : ''
    if (!id) return null
    try { return await fetchJson(`https://gamma-api.polymarket.com/events/${encodeURIComponent(id)}`) } catch { return null }
  }))

  let best: { market: Record<string, unknown>; score: number; lexical: number } | null = null
  for (const event of detailed) {
    if (!event) continue
    const eventTitle = typeof event.title === 'string' ? event.title : ''
    const markets = Array.isArray(event.markets) ? event.markets.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : []
    for (const market of markets) {
      if (market.closed === true || market.active === false) continue
      const text = [eventTitle, market.question, market.slug].filter(Boolean).join(' ')
      const lexical = similarity(forecast.question, text)
      const timing = deadlineFit(forecast.deadline, market.endDate ?? market.end_date ?? event.endDate)
      const score = lexical * 0.88 + timing * 0.12
      if (!best || score > best.score) best = { market, score, lexical }
    }
  }
  if (!best || best.lexical < 0.34 || best.score < 0.42) return null

  const id = best.market.id != null ? String(best.market.id) : ''
  const slug = typeof best.market.slug === 'string' ? best.market.slug : ''
  if (!id && !slug) return null
  const sourceRef = id
    ? `https://gamma-api.polymarket.com/markets/${encodeURIComponent(id)}`
    : `https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(slug)}`
  const market = await fetchJson(sourceRef)
  if (market.closed === true || market.active === false) return null

  const prices = parseJsonArray(market.outcomePrices)
  const yesOutcome = numberValue(prices[0])
  const yesBid = numberValue(market.bestBid)
  const yesAsk = numberValue(market.bestAsk)
  const lastPrice = numberValue(market.lastTradePrice) ?? yesOutcome
  const probability = yesBid != null && yesAsk != null ? clamp((yesBid + yesAsk) / 2)
    : lastPrice == null ? null : clamp(lastPrice)
  if (probability == null) return null
  const spread = numberValue(market.spread) ?? (yesBid != null && yesAsk != null ? clamp(yesAsk - yesBid) : null)
  const volume = Math.max(0, numberValue(market.volume24hr) ?? numberValue(market.volume) ?? 0)
  const title = typeof market.question === 'string' && market.question.trim() ? market.question : slug || id

  return {
    provider: 'polymarket',
    ticker: slug || id,
    title,
    probability,
    yesBid,
    yesAsk,
    lastPrice,
    spread,
    volume,
    sourceRef,
    raw: market,
    matchScore: best.score,
  }
}

async function recordPrior(admin: AdminClient, userId: string, forecast: ForecastRow) {
  const { error } = await admin.rpc('perception_record_forecaster_output_internal', {
    p_user_id: userId,
    p_forecast_id: forecast.id,
    p_model_key: 'prior',
    p_model_family: 'base_rate',
    p_probability: forecast.original_probability,
    p_raw_weight: 0.28,
    p_calibrated_weight: 0.28,
    p_confidence: 0.3,
    p_rationale: 'Original prior retained as a weak anchor for autonomous forecasting.',
    p_evidence_ids: [],
    p_metadata: { source: 'forecast.original_probability', autonomous: true },
  })
  if (error) throw new Error('Could not retain forecast prior')
}

async function recordInternalBaseRate(admin: AdminClient, userId: string, forecast: ForecastRow) {
  const { data, error } = await admin
    .from('perception_forecasts')
    .select('question,outcome,resolved_at')
    .eq('user_id', userId)
    .eq('status', 'resolved')
    .not('outcome', 'is', null)
    .order('resolved_at', { ascending: false })
    .limit(250)
  if (error) return null

  const matches = (data ?? []).map((row) => ({
    row,
    similarity: similarity(forecast.question, String(row.question ?? '')),
  })).filter((item) => item.similarity >= 0.28).slice(0, 30)
  if (matches.length < 3) return null

  const weightSum = matches.reduce((sum, item) => sum + item.similarity, 0)
  const probability = matches.reduce((sum, item) => sum + (item.row.outcome ? 1 : 0) * item.similarity, 0) / Math.max(weightSum, 0.001)
  const confidence = clamp(0.32 + Math.min(matches.length, 15) * 0.035)
  const modelWeight = clamp(0.25 + Math.min(matches.length, 12) * 0.05, 0.25, 0.85)

  const { error: outputError } = await admin.rpc('perception_record_forecaster_output_internal', {
    p_user_id: userId,
    p_forecast_id: forecast.id,
    p_model_key: 'internal_base_rate',
    p_model_family: 'historical_base_rate',
    p_probability: probability,
    p_raw_weight: modelWeight,
    p_calibrated_weight: modelWeight,
    p_confidence: confidence,
    p_rationale: `Empirical outcome rate from ${matches.length} similar resolved Perception forecasts.`,
    p_evidence_ids: [],
    p_metadata: { matched_forecasts: matches.length, minimum_similarity: 0.28, autonomous: true },
  })
  if (outputError) return null
  return { probability, matched_forecasts: matches.length, confidence, weight: modelWeight }
}

async function scoutNewsEvidence(admin: AdminClient, userId: string, forecast: ForecastRow) {
  const terms = tokens(forecast.question).slice(0, 5)
  if (!terms.length) return { recorded: 0, sources: [] as string[] }
  const query = terms.join(' ')
  const sourceRef = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=20&timespan=7d&sort=datedesc&format=json`
  let payload: Record<string, unknown>
  try { payload = await fetchJson(sourceRef, 10_000) } catch { return { recorded: 0, sources: [] as string[] } }
  const candidates = [payload.articles, payload.items, payload.results]
    .find((value) => Array.isArray(value)) as unknown[] | undefined
  const articles = (candidates ?? []).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
  const seenDomains = new Set<string>()
  let recorded = 0
  const sources: string[] = []

  for (const article of articles) {
    if (recorded >= 8) break
    const title = typeof article.title === 'string' ? article.title.trim() : ''
    const url = typeof article.url === 'string' ? article.url : ''
    if (!title || !url.startsWith('https://')) continue
    const relevance = similarity(forecast.question, title)
    if (relevance < 0.18) continue
    let domain = typeof article.domain === 'string' ? article.domain : ''
    if (!domain) {
      try { domain = new URL(url).hostname } catch { domain = 'news' }
    }
    const independent = seenDomains.has(domain) ? 0.35 : 0.82
    seenDomains.add(domain)
    const published = article.seendate ?? article.date ?? article.published_at

    const { error } = await admin.rpc('perception_record_forecast_evidence_internal', {
      p_user_id: userId,
      p_forecast_id: forecast.id,
      p_source_kind: 'news_discovery',
      p_source_name: domain,
      p_source_ref: url,
      p_claim: title,
      p_stance: 'neutral',
      p_reliability: 0.58,
      p_corroboration: clamp(0.34 + Math.min(seenDomains.size, 5) * 0.06),
      p_freshness: freshness(published),
      p_independence: independent,
      p_specificity: clamp(0.38 + relevance * 0.58),
      p_manipulation_risk: 0.28,
      p_observed_at: new Date().toISOString(),
      p_metadata: { discovery_provider: 'gdelt', search_query: query, relevance, published_at: published ?? null },
    })
    if (!error) {
      recorded += 1
      sources.push(domain)
    }
  }
  return { recorded, sources: [...new Set(sources)] }
}

async function runAutonomous(admin: AdminClient, userId: string, forecast: ForecastRow) {
  await recordPrior(admin, userId, forecast)
  const [kalshiResult, polymarketResult, newsResult, baseRate] = await Promise.all([
    autoMatchKalshi(forecast).catch(() => null),
    autoMatchPolymarket(forecast).catch(() => null),
    scoutNewsEvidence(admin, userId, forecast).catch(() => ({ recorded: 0, sources: [] as string[] })),
    recordInternalBaseRate(admin, userId, forecast).catch(() => null),
  ])

  const markets: Array<Record<string, unknown>> = []
  if (kalshiResult) {
    const recorded = await recordMarketSignal(admin, userId, forecast.id, kalshiResult)
    markets.push({ provider: 'kalshi', ticker: kalshiResult.ticker, title: kalshiResult.title, probability: kalshiResult.probability, match_score: kalshiResult.matchScore, weight: recorded.calibratedWeight })
  }
  if (polymarketResult) {
    const recorded = await recordMarketSignal(admin, userId, forecast.id, polymarketResult)
    markets.push({ provider: 'polymarket', ticker: polymarketResult.ticker, title: polymarketResult.title, probability: polymarketResult.probability, match_score: polymarketResult.matchScore, weight: recorded.calibratedWeight })
  }

  const { data: consensus, error: consensusError } = await admin.rpc('perception_recompute_forecast_consensus_internal', {
    p_user_id: userId,
    p_forecast_id: forecast.id,
  })
  if (consensusError) throw new Error('Could not recompute autonomous consensus')

  await admin.from('perception_model_events').insert({
    user_id: userId,
    project_id: forecast.project_id,
    event_type: 'forecast.autonomous.completed',
    payload: {
      forecast_id: forecast.id,
      markets_found: markets.length,
      news_evidence_recorded: newsResult.recorded,
      news_source_count: newsResult.sources.length,
      internal_base_rate: baseRate,
      completed_at: new Date().toISOString(),
    },
  })

  return {
    ok: true,
    action: 'autonomous_run',
    forecast: (consensus as Record<string, unknown>)?.forecast ?? null,
    consensus,
    markets,
    news: newsResult,
    base_rate: baseRate,
    abstentions: [
      ...(kalshiResult ? [] : ['kalshi:no_confident_match']),
      ...(polymarketResult ? [] : ['polymarket:no_confident_match']),
      ...(baseRate ? [] : ['internal_base_rate:insufficient_history']),
    ],
  }
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
    const forecastId = typeof body?.forecast_id === 'string' ? body.forecast_id.trim() : ''
    if (!forecastId) return json({ error: 'forecast_id required' }, 400)

    const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const forecast = await getForecast(admin, userData.user.id, forecastId)

    if (action === 'autonomous_run') {
      return json(await runAutonomous(admin, userData.user.id, forecast))
    }

    if (action === 'kalshi_market') {
      const ticker = typeof body?.ticker === 'string' ? body.ticker.trim() : ''
      if (!ticker) return json({ error: 'ticker required' }, 400)
      if (!/^[A-Za-z0-9._:-]{2,160}$/.test(ticker)) return json({ error: 'Invalid Kalshi ticker format' }, 400)
      const market = await fetchKalshiMarket(ticker)
      const recorded = await recordMarketSignal(admin, userData.user.id, forecast.id, market)
      return json({
        ok: true,
        provider: 'kalshi',
        market: {
          ticker: market.ticker,
          title: market.title,
          implied_probability: market.probability,
          yes_bid: market.yesBid,
          yes_ask: market.yesAsk,
          last_price: market.lastPrice,
          spread: market.spread,
          volume: market.volume,
          confidence: recorded.confidence,
          manipulation_risk: recorded.manipulationRisk,
        },
        result: recorded.result,
      })
    }

    return json({ error: 'Unsupported action' }, 400)
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError'
    console.error('Forecast intelligence failure', error instanceof Error ? error.message : 'unknown')
    return json({ error: timedOut ? 'Forecast source request timed out' : 'Unexpected forecast intelligence failure' }, timedOut ? 504 : 500)
  }
})
