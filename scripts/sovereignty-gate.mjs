import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const runtimeRoots = [
  path.join(root, 'src'),
  path.join(root, 'supabase', 'functions'),
]
const forbidden = [
  { pattern: /previous_response_id\b/, label: 'provider previous-response chain' },
  { pattern: /\/v1\/conversations\b/, label: 'provider conversation API' },
  { pattern: /\/v1\/vector_stores\b/, label: 'provider vector-store API' },
  { pattern: /\/v1\/threads\b/, label: 'provider thread API' },
  { pattern: /\/v1\/assistants\b/, label: 'provider assistants API' },
  { pattern: /\bassistant_id\b/, label: 'provider assistant identifier' },
  { pattern: /\bthread_id\b/, label: 'provider thread identifier' },
  { pattern: /\bvector_store_id\b/, label: 'provider vector-store identifier' },
  { pattern: /\bconversation_id\b/, label: 'provider conversation identifier' },
  { pattern: /perception:workspace:v[0-9]+/, label: 'browser Project World persistence' },
]

const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const failures = []

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) return []
    return extensions.has(path.extname(entry.name)) ? [full] : []
  })
}

for (const file of runtimeRoots.flatMap(walk)) {
  const relative = path.relative(root, file)
  if (relative === 'scripts/sovereignty-gate.mjs') continue
  const source = fs.readFileSync(file, 'utf8')
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) {
      failures.push(`${relative}: forbidden ${rule.label}`)
    }
  }
}

const modelCallSites = [
  'supabase/functions/_shared/meaning-resolver.ts',
  'supabase/functions/_shared/local-runtime.ts',
  'supabase/functions/_shared/code-plan-materializer.ts',
]

for (const relative of modelCallSites) {
  const file = path.join(root, relative)
  const source = fs.readFileSync(file, 'utf8')
  if (!source.includes("from './provider-boundary.ts'")) {
    failures.push(`${relative}: model call site does not import provider-boundary`)
  }
  if (!source.includes('providerStorageDirectives(')) {
    failures.push(`${relative}: model call site does not apply provider storage directives`)
  }
  if (!source.includes('providerSystemPrompt(')) {
    failures.push(`${relative}: model call site does not label bounded provider context`)
  }
}

const legacyStore = path.join(root, 'src', 'lib', 'perception-store.ts')
if (fs.existsSync(legacyStore)) {
  failures.push('src/lib/perception-store.ts: legacy browser workspace store must not exist in production runtime')
}

const runtimeEntry = path.join(root, 'supabase', 'functions', 'perceive-objective', 'index.ts')
if (!fs.existsSync(runtimeEntry)) {
  failures.push('supabase/functions/perceive-objective/index.ts: runtime entry is missing')
} else {
  const runtime = fs.readFileSync(runtimeEntry, 'utf8')
  for (const required of [
    'perception_record_provider_call_internal',
    'providerStorageAuditMode',
    'provider_provenance',
  ]) {
    if (!runtime.includes(required)) {
      failures.push(`supabase/functions/perceive-objective/index.ts: missing canonical provider provenance marker: ${required}`)
    }
  }
}

const sovereignDoc = path.join(root, 'docs', 'SOVEREIGN_STORAGE.md')
if (!fs.existsSync(sovereignDoc)) {
  failures.push('docs/SOVEREIGN_STORAGE.md: sovereign storage contract is missing')
} else {
  const doc = fs.readFileSync(sovereignDoc, 'utf8')
  for (const phrase of [
    'Legacy Works Ventures',
    'provider memory',
    'cannot serve as Perception’s system of record',
    'non-authoritative working copy',
  ]) {
    if (!doc.includes(phrase)) failures.push(`docs/SOVEREIGN_STORAGE.md: missing required contract phrase: ${phrase}`)
  }
}

if (failures.length) {
  console.error('Perception sovereignty gate failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Perception sovereignty gate passed')
