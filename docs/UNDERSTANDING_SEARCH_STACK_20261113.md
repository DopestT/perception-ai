# PERCEPTION — Search + Understanding Software Stack (phase 0)

Date: 2026-11-13. Status: **draft specification and local benchmark utilities, not an installed production search service.**

## Product principle
A user asks something. **Before responding**, PERCEPTION hypothesizes what success would look like, works backward to the information needed, retrieves grounded evidence, challenges its candidate answer, and refines it toward the user's actual intent. An imagined outcome is an internal hypothesis, never a verified claim or authority to execute external actions.

## Reuse rather than replace
- Existing app: React/Vite frontend, Supabase backend, Perception Meaning Resolver, Project World, Epistemic and Execution Ledgers, provider model routing.
- Do not establish provider-owned canonical long-term memory or duplicate the project ledger.
- Relevant existing work: #92 (governed workforce), #95 (search), #96 (AI reasoning), #106 (auth/iPad), #116 and #118 (free-entry alternatives). Do not merge overlapping auth PRs blindly.

## Acquisition and integration sequence
| Layer | Recommended software | Why | Installation state | Approval requirement |
|---|---|---|---|---|
| Intent, outcome and pre-response critique | Existing Perception Meaning Resolver + model routing; OpenAI Responses API as an adapter | Hypothesize desired outcome, reverse-map evidence, correct relevance gaps | Existing code foundation; new reasoning contract **not wired** | New API calls can cost money; no keys here |
| External live search | OpenAI Responses API `web_search` | Primary sources, dated citations, current information | **Not wired** to main Perception search | Pricing and credential review |
| Sovereign internal retrieval | Existing Supabase/Postgres with pgvector and Postgres text search | Project-scoped semantic + lexical retrieval | Supabase exists; exact extension/index coverage **unverified** | Read-only schema audit first; migration requires approval |
| Optional reranking | Cohere Rerank v5 API (or cheaper local cross-encoder benchmark first) | Compare retrieved passages with original user intent | **Not installed** | New vendor agreement/credentials/paid calls require approval |
| Evaluation/observability | Existing Vitest + this `understanding-benchmark.ts` first; consider Langfuse later | Reproducible tests of unsupported claims, source coverage, goal drift, latency/cost | Initial pure benchmark now in draft branch | No paid SaaS needed for phase 0 |
| Dedicated vector infrastructure | Qdrant later only if measurements show Postgres inadequate | Large-scale multivector search | **Deferred** | Infrastructure spend requires approval |

Official technical references:
- https://developers.openai.com/api/docs/guides/tools-web-search
- https://supabase.com/docs/guides/ai/hybrid-search
- https://docs.cohere.com/docs/rerank
- https://langfuse.com/docs

## Safe pre-response contract
1. Preserve the exact original request, uncertainty and user-provided constraints.
2. Interpret the *likely intended outcome* and indicate ambiguity instead of silently changing the goal.
3. Hypothesize what a satisfactory answer would contain and work backward to missing facts.
4. Retrieve current primary sources where needed; keep authorization/project scoping.
5. Ground material factual claims in traceable passages; capture contradictions and freshness.
6. Assess user-goal alignment, evidence sufficiency, unsupported claims and latency before returning.
7. Revise within bounded time/cost; if necessary, say what remains unknown or ask one targeted question.
8. Do not present internal imagined outcomes as completed external effects. P2/P3 remains gated.

## What was actually added
- `src/lib/understanding-benchmark.ts`: **pure**, zero-provider-call evidence and goal-drift checking utilities. This is an acceptance *gate*, **not** an LLM, semantic evaluator, live search tool, or installed provider.
- `src/lib/understanding-benchmark.test.ts`: six regression tests for positive cases, invented evidence, drift, misleading answer, missing results, empty benchmark.
- No dependency install or changed lockfile; no deployed service, API credential, usage charge, migrations or production modifications.

## Acceptance criteria for next phases
- Build a curated 200-item evaluation set (ambiguous intent, ordinary questions, contradictory sources, high-quality research, current facts, project privacy, and free-user access).
- For each, independently label intended outcome, required evidence, acceptable uncertainty, relevance, correctness and latency.
- Run real responses only once a bounded, approved testing budget exists; benchmark baseline first, then compare adapters.
- A versioned cited response must withstand evidence/contradiction challenge and preserve project isolation.
- Confirm guest experience is genuinely useful, not a static substitute for live AI; estimate per-query unit economics before committing to unlimited service.
- Only after tests and approvals integrate the first external search adapter on a separate branch with a disabled-by-default flag.

## Verification distinctions
**Implemented in this draft:** a local contract checker and tests. **Not yet independently tested at writing:** CI/test/build. **Not done:** model, external search, reranker, Langfuse or Qdrant activation. **No production/user-facing effect.**
