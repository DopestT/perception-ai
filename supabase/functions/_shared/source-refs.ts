export type BoundedSourceRef = {
  kind: string
  ref: string
  source?: string
  place_id?: string
  entity_id?: string
  snapshot_hash?: string
  observed_at?: string
}

const allowedKeys = [
  'kind',
  'ref',
  'source',
  'place_id',
  'entity_id',
  'snapshot_hash',
  'observed_at',
] as const

const limits: Record<(typeof allowedKeys)[number], number> = {
  kind: 80,
  ref: 500,
  source: 120,
  place_id: 120,
  entity_id: 160,
  snapshot_hash: 160,
  observed_at: 80,
}

function boundedString(value: unknown, limit: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  return normalized.slice(0, limit)
}

export function normalizeSourceRefs(value: unknown, limit = 12): BoundedSourceRef[] {
  if (!Array.isArray(value)) return []

  const refs: BoundedSourceRef[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const kind = boundedString(record.kind, limits.kind)
    const ref = boundedString(record.ref, limits.ref)
    if (!kind || !ref) continue

    const normalized: Record<string, string> = { kind, ref }
    for (const key of allowedKeys) {
      if (key === 'kind' || key === 'ref') continue
      const next = boundedString(record[key], limits[key])
      if (next) normalized[key] = next
    }

    refs.push(normalized as BoundedSourceRef)
    if (refs.length >= Math.max(0, limit)) break
  }

  return refs
}

export function mergeSourceRefs(existing: unknown, incoming: BoundedSourceRef[], limit = 24): BoundedSourceRef[] {
  const preservedExisting: BoundedSourceRef[] = Array.isArray(existing)
    ? existing
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
        .filter((item) => typeof item.kind === 'string' && typeof item.ref === 'string')
        .map((item) => ({ ...item }) as BoundedSourceRef)
    : []

  const merged = [
    ...preservedExisting,
    ...normalizeSourceRefs(incoming, limit),
  ]

  const unique: BoundedSourceRef[] = []
  const seen = new Set<string>()
  for (const ref of merged) {
    const key = String(ref.kind) + '|' + String(ref.ref)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(ref)
    if (unique.length >= Math.max(0, limit)) break
  }
  return unique
}
