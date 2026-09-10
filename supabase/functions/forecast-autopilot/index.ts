import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const FETCH_TIMEOUT_MS = 6_000
const RESOLUTION_MATCH_MIN = 0.65

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
  return clamp(precision * 0.72 + (shared / Math.max(1, union)) * 0.28)
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

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
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

const dollarPrice = (market: Record<string, unknown>, dollarKey: string, centKey: string): number | null => {
  const dollars = numberValue(market[dollarKey])
  if (dollars != null) return clamp(dollars)
  const cents = numberValue(market[centKey])
  return cents == null ? null : clamp(cents / 100)
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let i = 0; i < left.length; i += 1) difference |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return difference === 0
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Perception-Forecast-Autopilot/1.0' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json() as Record<string, unknown>
  } finally {
    clearTimeout(timeout)
  }
}

type AdminClient = ReturnType<typeof createClient>

type ForecastClaim = {
  forecast_id: string
  user_id: string
  project_id: string
  question: string
  deadline: string
  original_probability: number
  current_probability: number
  last_autopilot_at: string | null
  failures: number
}

type ResolutionCandidate = {
  outcome: boolean
  provider: string
  sourceRef: string
  matchScore: number
  confidence: number
  rationale: string
  snapshot: Record<string, unknown>
}

type MarketReading = {
  provider: 'kalshi' | 'polymarket'
  ticker: string
  title: string
  probability: number | null
  yesBid: number | null
  yesAsk: number | null
  lastPrice: number | null
  spread: number | null
  volume: number
  sourceRef: string
  raw: Record<string, unknown>
  matchScore: number
  resolution: ResolutionCandidate | null
}

async function schedulerAuthorized(admin: AdminClient, request: Request) {
  const token = request.headers.get('x-perception-autopilot-token')?.trim() ?? ''
  if (!token) return false
  const { data, error } = await admin
    .from('perception_runtime_secret_hashes')
    .select('secret_hash')
    .eq('secret_name', 'forecast_autopilot_cron')
    .maybeSingle()
  if (error || !data?.secret_hash) return false
  return constantTimeEqual(await sha256(token), String(data.secret_hash))
}

function marketWeight(input: MarketReading) {
  const liquidity = clamp(Math.log10(Math.max(0, input.volume) + 1) / 5)
  const spreadQuality = input.spread == null ? 0.65 : clamp(1 - input.spread * 2.5, 0.18, 1)
  const matchQuality = clamp(input.matchScore)
  const rawWeight = 0.45 + liquidity * 0.8
  const calibratedWeight = Math.max(0.12, rawWeight * spreadQuality * (0.55 + 0.45 * matchQuality))
  const confidence = clamp(0.34 + liquidity * 0.28 + spreadQuality * 0.22 + matchQuality * 0.16)
  const manipulationRisk = clamp((input.spread ?? 0.15) * 1.5 + (input.volume < 25 ? 0.22 : 0) + (input.volume < 5 ? 0.15 : 0) + (1 - matchQuality) * 0.18)
  return { rawWeight, calibratedWeight, confidence, manipulationRisk }
}

async function recordMarket(admin: AdminClient, claim: ForecastClaim, reading: MarketReading) {
  if (reading.probability == null) return null
  const weight = marketWeight(reading)
  const { data, error } = await admin.rpc('perception_record_market_signal_internal', {
    p_user_id: claim.user_id,
    p_forecast_id: claim.forecast_id,
    p_provider: reading.provider,
    p_market_ticker: reading.ticker,
    p_market_title: reading.title,
    p_implied_probability: clamp(reading.probability),
    p_yes_bid: reading.yesBid,
    p_yes_ask: reading.yesAsk,
    p_last_price: reading.lastPrice,
    p_spread: reading.spread,
    p_volume: reading.volume,
    p_source_ref: reading.sourceRef,
    p_raw_payload: { ...reading.raw, perception_match_score: reading.matchScore, autopilot: true },
    p_raw_weight: weight.rawWeight,
    p_calibrated_weight: weight.calibratedWeight,
    p_confidence: weight.confidence,
    p_manipulation_risk: weight.manipulationRisk,
  })
  if (error) throw new Error(`${reading.provider} signal could not be recorded`)
  return data
}

function kalshiReading(market: Record<string, unknown>, ticker: string, sourceRef: string, matchScore: number): MarketReading {
  const yesBid = dollarPrice(market, 'yes_bid_dollars', 'yes_bid')
  const yesAsk = dollarPrice(market, 'yes_ask_dollars', 'yes_ask')
  const lastPrice = dollarPrice(market, 'last_price_dollars', 'last_price')
  const probability = yesBid != null && yesAsk != null ? clamp((yesBid + yesAsk) / 2)
    : lastPrice ?? yesBid ?? yesAsk
  const spread = yesBid != null && yesAsk != null ? clamp(yesAsk - yesBid) : null
  const volume = Math.max(0, numberValue(market.volume_fp) ?? numberValue(market.volume) ?? 0)
  const title = [market.title, market.yes_sub_title, market.subtitle]
    .find((value) => typeof value === 'string' && value.trim()) as string | undefined
  const status = String(market.status ?? '').toLowerCase()
  const result = String(market.result ?? market.market_result ?? '').toLowerCase()
  const finalized = status === 'finalized' || status === 'settled'
  const outcome = result === 'yes' ? true : result === 'no' ? false : null
  const resolution = finalized && outcome != null && matchScore >= RESOLUTION_MATCH_MIN
    ? {
        outcome,
        provider: 'kalshi',
        sourceRef,
        matchScore,
        confidence: 0.995,
        rationale: `Kalshi market ${ticker} is finalized with result ${result.toUpperCase()}.`,
        snapshot: market,
      }
    : null
  return {
    provider: 'kalshi', ticker, title: title ?? ticker, probability, yesBid, yesAsk, lastPrice,
    spread, volume, sourceRef, raw: market, matchScore, resolution,
  }
}

async function fetchKalshi(ticker: string, matchScore: number) {
  const sourceRef = `https://external-api.kalshi.com/trade-api/v2/markets/${encodeURIComponent(ticker)}`
  const payload = await fetchJson(sourceRef)
  const market = (payload.market && typeof payload.market === 'object' ? payload.market : payload) as Record<string, unknown>
  return kalshiReading(market, ticker, sourceRef, matchScore)
}

function polymarketResolution(market: Record<string, unknown>, sourceRef: string, matchScore: number): ResolutionCandidate | null {
  if (market.closed !== true || matchScore < RESOLUTION_MATCH_MIN) return null
  const outcomes = parseJsonArray(market.outcomes).map((value) => String(value).toLowerCase())
  const prices = parseJsonArray(market.outcomePrices).map(numberValue)
  const yesIndex = outcomes.findIndex((value) => value === 'yes')
  const noIndex = outcomes.findIndex((value) => value === 'no')
  if (yesIndex < 0 || noIndex < 0) return null
  const yes = prices[yesIndex]
  const no = prices[noIndex]
  if (yes == null || no == null) return null
  if (yes >= 0.995 && no <= 0.005) {
    return {
      outcome: true,
      provider: 'polymarket',
      sourceRef,
      matchScore,
      confidence: 0.97,
      rationale: 'Polymarket is closed with terminal YES/NO prices indicating YES.',
      snapshot: market,
    }
  }
  if (no >= 0.995 && yes <= 0.005) {
    return {
      outcome: false,
      provider: 'polymarket',
      sourceRef,
      matchScore,
      confidence: 0.97,
      rationale: 'Polymarket is closed with terminal YES/NO prices indicating NO.',
      snapshot: market,
    }
  }
  return null
}

function polymarketReading(market: Record<string, unknown>, ticker: string, sourceRef: string, matchScore: number): MarketReading {
  const outcomes = parseJsonArray(market.outcomes).map((value) => String(value).toLowerCase())
  const prices = parseJsonArray(market.outcomePrices).map(numberValue)
  const yesIndex = outcomes.findIndex((value) => value === 'yes')
  const yesOutcome = yesIndex >= 0 ? prices[yesIndex] : prices[0]
  const yesBid = numberValue(market.bestBid)
  const yesAsk = numberValue(market.bestAsk)
  const lastPrice = numberValue(market.lastTradePrice) ?? yesOutcome ?? null
  const probability = yesBid != null && yesAsk != null ? clamp((yesBid + yesAsk) / 2)
    : lastPrice == null ? null : clamp(lastPrice)
  const spread = numberValue(market.spread) ?? (yesBid != null && yesAsk != null ? clamp(yesAsk - yesBid) : null)
  const volume = Math.max(0, numberValue(market.volume24hr) ?? numberValue(market.volume) ?? 0)
  const title = typeof market.question === 'string' && market.question.trim() ? market.question : ticker
  return {
    provider: 'polymarket', ticker, title, probability, yesBid, yesAsk, lastPrice, spread, volume,
    sourceRef, raw: market, matchScore, resolution: polymarketResolution(market, sourceRef, matchScore),
  }
}

async function fetchPolymarket(ticker: string, sourceRef: string | null, matchScore: number) {
  const url = sourceRef?.startsWith('https://gamma-api.polymarket.com/markets/')
    ? sourceRef
    : `https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(ticker)}`
  const market = await fetchJson(url)
  return polymarketReading(market, ticker, url, matchScore)
}

async function discoverKalshi(claim: ForecastClaim) {
  const payload = await fetchJson('https://external-api.kalshi.com/trade-api/v2/markets?status=open&limit=1000&mve_filter=exclude')
  const markets = Array.isArray(payload.markets)
    ? payload.markets.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : []
  let best: { market: Record<string, unknown>; score: number; lexical: number } | null = null
  for (const market of markets) {
    const text = [market.title, market.subtitle, market.yes_sub_title, market.event_ticker, market.ticker].filter(Boolean).join(' ')
    const lexical = similarity(claim.question, text)
    const score = lexical * 0.88 + deadlineFit(claim.deadline, market.expected_expiration_time ?? market.close_time ?? market.expiration_time) * 0.12
    if (!best || score > best.score) best = { market, score, lexical }
  }
  if (!best || best.lexical < 0.34 || best.score < 0.42) return null
  const ticker = typeof best.market.ticker === 'string' ? best.market.ticker : ''
  return ticker ? fetchKalshi(ticker, best.score) : null
}

async function discoverPolymarket(claim: ForecastClaim) {
  const query = tokens(claim.question).slice(0, 6).join(' ')
  if (!query) return null
  const search = await fetchJson(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(query)}`)
  const events = Array.isArray(search.events)
    ? search.events.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').slice(0, 6)
    : []
  let best: { market: Record<string, unknown>; score: number; lexical: number } | null = null
  for (const event of events) {
    const id = event.id != null ? String(event.id) : ''
    if (!id) continue
    let detail: Record<string, unknown>
    try { detail = await fetchJson(`https://gamma-api.polymarket.com/events/${encodeURIComponent(id)}`) } catch { continue }
    const eventTitle = typeof detail.title === 'string' ? detail.title : ''
    const markets = Array.isArray(detail.markets)
      ? detail.markets.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      : []
    for (const market of markets) {
      if (market.closed === true || market.active === false) continue
      const lexical = similarity(claim.question, [eventTitle, market.question, market.slug].filter(Boolean).join(' '))
      const score = lexical * 0.88 + deadlineFit(claim.deadline, market.endDate ?? market.end_date ?? detail.endDate) * 0.12
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
  return polymarketReading(market, slug || id, sourceRef, best.score)
}

async function ensurePrior(admin: AdminClient, claim: ForecastClaim) {
  const { data } = await admin
    .from('perception_forecaster_outputs')
    .select('id')
    .eq('forecast_id', claim.forecast_id)
    .eq('model_key', 'prior')
    .limit(1)
    .maybeSingle()
  if (data?.id) return
  await admin.rpc('perception_record_forecaster_output_internal', {
    p_user_id: claim.user_id,
    p_forecast_id: claim.forecast_id,
    p_model_key: 'prior',
    p_model_family: 'base_rate',
    p_probability: claim.original_probability,
    p_raw_weight: 0.28,
    p_calibrated_weight: 0.28,
    p_confidence: 0.3,
    p_rationale: 'Original prior retained as a weak anchor for scheduled forecasting.',
    p_evidence_ids: [],
    p_metadata: { source: 'forecast.original_probability', autopilot: true },
  })
}

async function recordInternalBaseRate(admin: AdminClient, claim: ForecastClaim) {
  const { data, error } = await admin
    .from('perception_forecasts')
    .select('question,outcome,resolved_at')
    .eq('user_id', claim.user_id)
    .eq('status', 'resolved')
    .not('outcome', 'is', null)
    .order('resolved_at', { ascending: false })
    .limit(250)
  if (error) return null
  const matches = (data ?? []).map((row) => ({ row, similarity: similarity(claim.question, String(row.question ?? '')) }))
    .filter((item) => item.similarity >= 0.28).slice(0, 30)
  if (matches.length < 3) return null
  const weightSum = matches.reduce((sum, item) => sum + item.similarity, 0)
  const probability = matches.reduce((sum, item) => sum + (item.row.outcome ? 1 : 0) * item.similarity, 0) / Math.max(weightSum, 0.001)
  const confidence = clamp(0.32 + Math.min(matches.length, 15) * 0.035)
  const modelWeight = clamp(0.25 + Math.min(matches.length, 12) * 0.05, 0.25, 0.85)
  const { error: outputError } = await admin.rpc('perception_record_forecaster_output_internal', {
    p_user_id: claim.user_id,
    p_forecast_id: claim.forecast_id,
    p_model_key: 'internal_base_rate',
    p_model_family: 'historical_base_rate',
    p_probability: probability,
    p_raw_weight: modelWeight,
    p_calibrated_weight: modelWeight,
    p_confidence: confidence,
    p_rationale: `Empirical outcome rate from ${matches.length} similar resolved Perception forecasts.`,
    p_evidence_ids: [],
    p_metadata: { matched_forecasts: matches.length, minimum_similarity: 0.28, autopilot: true },
  })
  if (outputError) return null
  return { probability, matched_forecasts: matches.length }
}

async function scoutNews(admin: AdminClient, claim: ForecastClaim) {
  const query = tokens(claim.question).slice(0, 5).join(' ')
  if (!query) return 0
  const source = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=12&timespan=7d&sort=datedesc&format=json`
  let payload: Record<string, unknown>
  try { payload = await fetchJson(source) } catch { return 0 }
  const candidates = [payload.articles, payload.items, payload.results].find(Array.isArray) as unknown[] | undefined
  const { data: recent } = await admin
    .from('perception_forecast_evidence')
    .select('source_ref')
    .eq('forecast_id', claim.forecast_id)
    .gte('created_at', new Date(Date.now() - 48 * 3_600_000).toISOString())
    .limit(200)
  const seen = new Set((recent ?? []).map((row) => String(row.source_ref ?? '')).filter(Boolean))
  let recorded = 0
  for (const item of candidates ?? []) {
    if (recorded >= 4 || !item || typeof item !== 'object') break
    const article = item as Record<string, unknown>
    const title = typeof article.title === 'string' ? article.title.trim() : ''
    const url = typeof article.url === 'string' ? article.url : ''
    if (!title || !url.startsWith('https://') || seen.has(url)) continue
    const relevance = similarity(claim.question, title)
    if (relevance < 0.18) continue
    let domain = typeof article.domain === 'string' ? article.domain : ''
    if (!domain) {
      try { domain = new URL(url).hostname } catch { domain = 'news' }
    }
    const { error } = await admin.rpc('perception_record_forecast_evidence_internal', {
      p_user_id: claim.user_id,
      p_forecast_id: claim.forecast_id,
      p_source_kind: 'news_discovery',
      p_source_name: domain,
      p_source_ref: url,
      p_claim: title,
      p_stance: 'neutral',
      p_reliability: 0.58,
      p_corroboration: 0.5,
      p_freshness: 0.9,
      p_independence: 0.8,
      p_specificity: clamp(0.38 + relevance * 0.58),
      p_manipulation_risk: 0.28,
      p_observed_at: new Date().toISOString(),
      p_metadata: { discovery_provider: 'gdelt', search_query: query, relevance, autopilot: true },
    })
    if (!error) {
      seen.add(url)
      recorded += 1
    }
  }
  return recorded
}

async function latestKnownMarkets(admin: AdminClient, claim: ForecastClaim) {
  const { data } = await admin
    .from('perception_external_market_signals')
    .select('provider,market_ticker,source_ref,raw_payload,captured_at')
    .eq('forecast_id', claim.forecast_id)
    .order('captured_at', { ascending: false })
    .limit(30)
  const unique = new Map<string, Record<string, unknown>>()
  for (const row of data ?? []) {
    const key = `${row.provider}:${row.market_ticker}`
    if (!unique.has(key)) unique.set(key, row as Record<string, unknown>)
  }
  return [...unique.values()].slice(0, 4)
}

async function refreshMarkets(admin: AdminClient, claim: ForecastClaim) {
  const known = await latestKnownMarkets(admin, claim)
  const readings: MarketReading[] = []
  for (const row of known) {
    const provider = String(row.provider ?? '').toLowerCase()
    const ticker = String(row.market_ticker ?? '')
    const sourceRef = typeof row.source_ref === 'string' ? row.source_ref : null
    const raw = row.raw_payload && typeof row.raw_payload === 'object' ? row.raw_payload as Record<string, unknown> : {}
    const matchScore = clamp(numberValue(raw.perception_match_score) ?? 1)
    try {
      if (provider === 'kalshi') readings.push(await fetchKalshi(ticker, matchScore))
      else if (provider === 'polymarket') readings.push(await fetchPolymarket(ticker, sourceRef, matchScore))
    } catch {
      // Provider failures are isolated; the run continues with remaining sources.
    }
  }

  if (!readings.some((reading) => reading.provider === 'kalshi')) {
    try {
      const discovered = await discoverKalshi(claim)
      if (discovered) readings.push(discovered)
    } catch { /* abstain */ }
  }
  if (!readings.some((reading) => reading.provider === 'polymarket')) {
    try {
      const discovered = await discoverPolymarket(claim)
      if (discovered) readings.push(discovered)
    } catch { /* abstain */ }
  }

  for (const reading of readings) await recordMarket(admin, claim, reading)
  return readings
}

function chooseResolution(claim: ForecastClaim, readings: MarketReading[]) {
  const candidates = readings.map((reading) => reading.resolution).filter((value): value is ResolutionCandidate => value !== null)
  if (!candidates.length) return { candidate: null as ResolutionCandidate | null, conflict: false }
  const yes = candidates.filter((candidate) => candidate.outcome)
  const no = candidates.filter((candidate) => !candidate.outcome)
  if (yes.length && no.length) return { candidate: null as ResolutionCandidate | null, conflict: true }
  const outcome = yes.length > 0
  if (!outcome && new Date(claim.deadline).getTime() > Date.now()) {
    return { candidate: null as ResolutionCandidate | null, conflict: false }
  }
  const strongest = [...candidates].sort((a, b) => (b.confidence * b.matchScore) - (a.confidence * a.matchScore))[0]
  if (candidates.length > 1) {
    return {
      candidate: {
        ...strongest,
        provider: `consensus:${candidates.map((candidate) => candidate.provider).sort().join('+')}`,
        sourceRef: candidates.map((candidate) => candidate.sourceRef).join(' | '),
        confidence: clamp(Math.max(...candidates.map((candidate) => candidate.confidence)) + 0.003),
        rationale: `${candidates.length} independent market sources agree on ${outcome ? 'YES' : 'NO'}.`,
        snapshot: { sources: candidates.map((candidate) => ({ provider: candidate.provider, source_ref: candidate.sourceRef, confidence: candidate.confidence })) },
      },
      conflict: false,
    }
  }
  return { candidate: strongest, conflict: false }
}

async function proposeResolution(admin: AdminClient, claim: ForecastClaim, readings: MarketReading[]) {
  const { candidate, conflict } = chooseResolution(claim, readings)
  if (conflict) {
    await admin.from('perception_model_events').insert({
      user_id: claim.user_id,
      project_id: claim.project_id,
      event_type: 'forecast.resolution.conflict',
      payload: { forecast_id: claim.forecast_id, detected_at: new Date().toISOString() },
    })
    return { proposed: false, conflict: true }
  }
  if (!candidate) return { proposed: false, conflict: false }
  const { data, error } = await admin.rpc('perception_propose_forecast_resolution_internal', {
    p_user_id: claim.user_id,
    p_forecast_id: claim.forecast_id,
    p_outcome: candidate.outcome,
    p_provider: candidate.provider,
    p_source_ref: candidate.sourceRef,
    p_source_snapshot: candidate.snapshot,
    p_match_score: candidate.matchScore,
    p_confidence: candidate.confidence,
    p_rationale: candidate.rationale,
  })
  if (error) throw new Error('Resolution proposal could not be recorded')
  return { proposed: true, conflict: false, proposal: data }
}

async function processForecast(admin: AdminClient, claim: ForecastClaim) {
  try {
    await ensurePrior(admin, claim)
    const [readings, news, baseRate] = await Promise.all([
      refreshMarkets(admin, claim),
      scoutNews(admin, claim),
      recordInternalBaseRate(admin, claim),
    ])
    const resolution = await proposeResolution(admin, claim, readings)
    const { data: consensus, error: consensusError } = await admin.rpc('perception_recompute_forecast_consensus_internal', {
      p_user_id: claim.user_id,
      p_forecast_id: claim.forecast_id,
    })
    if (consensusError) throw new Error('Consensus could not be recomputed')
    const summary = {
      markets_refreshed: readings.length,
      news_recorded: news,
      base_rate: baseRate,
      resolution_proposed: resolution.proposed,
      resolution_conflict: resolution.conflict,
      consensus_probability: (consensus as Record<string, unknown>)?.forecast && typeof (consensus as Record<string, unknown>).forecast === 'object'
        ? ((consensus as { forecast?: { current_probability?: number } }).forecast?.current_probability ?? null)
        : null,
    }
    await admin.rpc('perception_complete_autopilot_run_internal', {
      p_user_id: claim.user_id,
      p_forecast_id: claim.forecast_id,
      p_success: true,
      p_error: null,
      p_summary: summary,
    })
    return { forecast_id: claim.forecast_id, status: 'succeeded', ...summary }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown autopilot failure'
    await admin.rpc('perception_complete_autopilot_run_internal', {
      p_user_id: claim.user_id,
      p_forecast_id: claim.forecast_id,
      p_success: false,
      p_error: message,
      p_summary: {},
    }).catch(() => undefined)
    return { forecast_id: claim.forecast_id, status: 'failed', error: message }
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
  const secretKey = secretKeys.default
  if (!url || !secretKey) return json({ error: 'Autopilot runtime unavailable' }, 503)

  const admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  if (!await schedulerAuthorized(admin, request)) return json({ error: 'Invalid scheduler credential' }, 401)

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  if (body.action !== 'scheduled_refresh') return json({ error: 'Unsupported action' }, 400)

  const { data, error } = await admin.rpc('perception_claim_due_forecasts_internal', { p_limit: 4 })
  if (error) {
    console.error('Autopilot claim failed', { code: error.code, message: error.message })
    return json({ error: 'Autopilot could not claim due forecasts' }, 500)
  }

  const claims = Array.isArray(data) ? data as ForecastClaim[] : []
  const results = await Promise.all(claims.map((claim) => processForecast(admin, claim)))
  const succeeded = results.filter((result) => result.status === 'succeeded').length
  const failed = results.length - succeeded

  return json({
    ok: true,
    action: 'scheduled_refresh',
    claimed: claims.length,
    succeeded,
    failed,
    results,
    completed_at: new Date().toISOString(),
  })
})
