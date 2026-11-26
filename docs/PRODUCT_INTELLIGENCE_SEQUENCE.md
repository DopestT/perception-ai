# PERCEPTION — product and intelligence development sequence
2026-11-26 | Proposed product translation of the founder-supplied research “Google’s Development History: From BackRub to AI Search.” Historical citations were not independently rechecked here; this is a Perception engineering plan, not a historical fact certification or approval to release.

## Product promise
Find useful information immediately, understand the evidence when needed, discover useful connections, and take action only by explicit choice and authorization. Keep Perception's own plasma/fish visual identity and simple input. Do not copy another product's visual identity or claim comparable scale.

## P0: a real guest-search result
Existing draft PR #128 is the product foundation. Its head at review was 8ae5ba2caa4a8294a3bd436485ac7d47570b23dc. Provider, usage rights, quota, activation and browser delivery remain unverified/approval-gated; do not claim guest search is live. First complete the ordinary signed-out query-to-clickable-source journey on a nonproduction preview, with real provider results only after rights and cost approval. Error and quota states must be honest. No Project World, account, automatic LLM call, or first-action brief required.
Acceptance: genuine ranked links/snippets/provenance; keyboard and mobile usability; no forced sign-in; no automatic workflow; truthful empty/outage/quota behavior; preserve the existing look and motion. Verify current head CI and browser evidence separately.

## Progressive depth: same query, distinct jobs
- Search: ranked links, source context, optional short grounded synthesis when warranted; default conventional results if evidence insufficient. Preserve the original query and result state.
- Discover: explicit request for related topics, alternative approaches, unexplored sources and meaningful connections; explain why each relates, do not silently personalize.
- Percive: explicit deeper analysis of the objective, evidence and counterevidence; distinguish findings, uncertainty and possible actions. An intent label never authorizes a workflow. Review action separately and require trusted server authorization before execution.
- Explore: show completed example journeys and their evidence, with demonstrations marked as such. No invented customer activity or fake results.
- How It Works: explain the useful result first, then retrieval, ranking, grounding, uncertainty and optional action.
- About: communicate Perception's verified purpose and capability, not speculative scale.
- Test Lab: display version, dataset provenance, held-out versus development split, expected/actual behavior, errors, regressions and last verified timestamp. Publish only approved safe, nonsensitive fixtures and results; no private examples, secrets or false claims. Lab experiments never silently become production.

## Shared intelligence and progression
1. Accessible search.
2. Relevance, spelling, intent and ranking.
3. Source/entity/relationship foundation.
4. Discovery with relevance and diversity evaluation.
5. Grounded reasoning, contradiction and abstention.
6. Consented, reviewed feedback and versioned improvement.
7. Multimodal interfaces once distinct use cases are validated.
8. Explicitly authorized execution.
9. Reusable developer services when demonstrated demand justifies them.
These are capability gates, not dates. Algorithm Laboratory stays isolated in review-only development until a candidate passes independent tests and explicit release approval. Reuse retrieval, ranking, source provenance, evidence and evaluation across modes; use Supabase only after staging schema/security review. Do not initiate live data collection.

## Measurement
First user-complete event: a signed-out query results in usable source links. Measure successful retrieval rate, time to first useful result, relevance judgments (NDCG@5, Recall@10), source freshness, error/abandonment, citation support, abstention and task completion. Record numerator, denominator, sample, version, confidence and failures. Use minimal consented privacy-preserving telemetry only after approval. Optimize usefulness, not dwell time or forced conversion. Compare against frozen baselines; do not equate synthetic intent accuracy with search quality or product adoption.

## Immediate engineering queue
P0: verify #128 exact-head CI and preview; settle zero-overage provider rights and quota gates, then obtain approval to activate a bounded pilot. P1: nonproduction query-to-result UX smoke tests and integration review of routing contract; independent evaluation and difficult-intent work continue in parallel. P2: shared query context and distinct Discover/Percive contracts; design public Test Lab evidence view from existing Auditor records. P3: review completed journeys for Explore and source-first How It Works/About. No production deployment, merge, spending, public publishing, private data collection or new permissions authorized by this plan.
