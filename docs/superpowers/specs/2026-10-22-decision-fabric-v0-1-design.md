# Perception Decision Fabric v0.1 — Design

Date: 2026-10-22
Status: design for review
Owner: Legacy Works Ventures LLC

## Intent

Add a fast, typed judgment layer to Perception without replacing any existing Route-to-Reality stage or changing the authority model.

Decision Fabric evaluates bounded evidence and returns machine assessments used to classify, prioritize, route, and escalate work. It does not create Project World truth, satisfy verification by itself, or replace the Responses-based Meaning Resolver.

The existing production proof in issue #80 remains the immediate production gate. Decision Fabric may be developed and tested independently, but it must not widen production execution or be treated as a substitute for restoring access to the canonical Supabase project `zxmdfmiueapjhktqchts`.

## Success criteria

Decision Fabric v0.1 is successful when:

1. Perception can evaluate one shared text or text+image input against a versioned set of independent predicate, choice, and score questions through OpenAI `POST /v1/decisions` using `gpt-6-luna`.
2. The adapter is isolated from the existing Meaning Resolver and execution runtime behind a narrow typed interface.
3. Every returned assessment preserves the question version, selected result, probability distribution where available, confidence where available, model, request/input hash, and timestamp.
4. No Decision Fabric result can directly advance authoritative Project World truth or mark a verification run passed.
5. Low-confidence, refused, malformed, timed-out, or unavailable decisions fail closed into review/deeper reasoning/default runtime behavior rather than silently becoming truth.
6. Existing Route-to-Reality behavior and issue #80 proof requirements remain intact when Decision Fabric is disabled.
7. The first production use is routing/triage only; execution permission classes are never raised by a Decision Fabric result.

## Non-goals

Decision Fabric v0.1 does not:

- replace `resolveObjectiveMeaning` or Structured Outputs;
- determine final factual truth;
- grant P2/P3 permissions;
- perform execution;
- create a new backend or provider-owned state store;
- depend on provider memory, conversations, threads, hosted vector stores, or prior-response chains;
- activate continuous world-signal ingestion in production before the existing production proof is complete;
- automatically tune thresholds from unlabeled production traffic.

## Chosen architecture

Use a separate shared adapter and registry that sit beside the existing model/runtime helpers:

`raw evidence -> Decision Fabric -> route/escalate -> existing reasoning/runtime -> verification -> authoritative state`

Recommended source boundary:

- `supabase/functions/_shared/decision-fabric.ts` — transport, normalization, typed answers, fail-closed behavior.
- `supabase/functions/_shared/decision-registry.ts` — versioned canonical question definitions and threshold policies.
- `src/lib/decision-fabric.test.ts` — transport/normalization/failure tests using injected fetch.
- `src/lib/decision-registry.test.ts` — definition/version/threshold contract tests.

A database migration is deferred until the first consumer requires durable decision receipts. v0.1 first proves the adapter and registry in isolation so issue #80 remains untouched. When persistence is added, receipts must live in LWV-controlled storage and reference existing Project World/evidence identities rather than creating a parallel source of truth.

## Why this approach

Three options were considered:

### A. Separate Decision Fabric adapter — chosen

Keep Decisions as a dedicated fast classification/scoring plane. The existing Meaning Resolver continues to use Responses/Structured Outputs for semantic extraction and explanation.

Advantages:

- additive rather than disruptive;
- easy to disable or fall back from;
- preserves sovereign-storage and verification boundaries;
- supports independent calibration of routing thresholds;
- avoids forcing richer semantic extraction into predicate/choice/score shapes.

### B. Replace parts of the Meaning Resolver with Decisions — rejected for v0.1

This could reduce some model cost, but it would conflate structured semantic extraction with routing decisions and make objective meaning dependent on a public-beta endpoint. It also removes useful free-form structured fields such as constraints, deliverables, and known unknowns.

### C. Add ad hoc Decisions calls inside each runtime component — rejected

This would be fast initially but would scatter question definitions, thresholds, and model assumptions across the codebase, making auditability and calibration difficult.

## Decision registry

Each definition is immutable once released. New behavior receives a new version instead of silently changing an existing question.

Minimum definition shape:

```ts
type DecisionDefinition = {
  id: string
  version: number
  name: string
  type: 'predicate' | 'choice' | 'score'
  instructions: string
  choices?: Array<{ value: string; description: string }>
  levels?: Array<{ label: string; description: string }>
  policy: {
    autoAccept?: number
    escalateBelow?: number
    escalateAbove?: number
  }
}
```

Initial registry set:

- `ingestion.relevance.v1` — predicate: material relevance to the active objective/project.
- `ingestion.novelty.v1` — predicate: contains materially new information relative to supplied bounded context.
- `ingestion.contradiction.v1` — predicate: conflicts with a supplied existing claim or verified state.
- `ingestion.time_sensitive.v1` — predicate: likely to become stale or require near-term action.
- `routing.destination.v1` — choice: `epistemic_ledger`, `execution_ledger`, `project_world_candidate`, `review_queue`, `archive`.
- `evidence.type.v1` — choice: `primary_source`, `secondary_source`, `commentary`, `user_report`, `machine_observation`, `unknown`.
- `evidence.strength.v1` — score: `unsupported`, `weak`, `moderate`, `strong`, `primary_verified_candidate`.
- `routing.urgency.v1` — score: `background`, `normal`, `important`, `critical`.

The string `primary_verified_candidate` is intentional: a Decision Fabric score can nominate evidence for verification but cannot declare it verified.

## Adapter interface

The runtime-facing interface should accept bounded evidence plus named registry definitions rather than raw arbitrary questions from callers.

```ts
type DecisionFabricRequest = {
  input: string | DecisionInputMessage[]
  definitions: DecisionDefinition[]
  inputHash: string
  cacheKey?: string
}

type DecisionReceipt = {
  definitionId: string
  definitionVersion: number
  answerType: 'predicate' | 'choice' | 'score' | 'refusal'
  value: boolean | string | number | null
  probability?: number
  confidence?: number
  probabilities?: Array<{ value: string | number; probability: number; label?: string }>
  model: string
  inputHash: string
  observedAt: string
}
```

The adapter owns API-shape normalization. Callers should not depend on raw provider response objects.

## Provider boundary

Decision Fabric is a bounded processor call. Perception remains authoritative.

The Decisions endpoint is treated as stateless from Perception's perspective. The adapter must not create or rely on provider conversations, threads, vector stores, prior-response IDs, or hosted state. Only the minimum bounded evidence required for the selected questions is sent.

The existing `providerStorageDirectives()` helper must not be blindly reused because `/v1/decisions` has its own request schema. Decision Fabric instead enforces sovereignty structurally: no provider state identifiers are accepted or returned as runtime dependencies, and durable receipts are written only to LWV-controlled storage when persistence is enabled.

## Data flow

1. A caller has bounded input evidence and an existing Perception context identity.
2. The caller selects one or more canonical registry definitions.
3. Decision Fabric constructs a single request against the shared input with independent questions.
4. The adapter validates response cardinality and answer names against the requested definitions.
5. Answers are normalized into Decision Receipts.
6. Threshold policy converts receipts into routing signals such as `accept`, `review`, `escalate`, or `defer`.
7. Routing signals may choose the next existing Perception path, but do not mutate authoritative truth.
8. Any truth-changing path still requires existing evidence and verification gates.

Dependent decisions are separate calls. v0.1 does not create implicit decision chains inside one request.

## Threshold policy

Thresholds belong to versioned Perception policy, not to arbitrary callers.

Initial behavior:

- Relevance/novelty may use high-confidence auto-routing once calibrated.
- Contradiction uses a lower escalation threshold because false negatives are more costly than extra review.
- Safety, permission, and production-risk decisions never auto-authorize execution.
- Uncalibrated definitions default to `review` rather than `autoAccept`.

Exact numeric production thresholds are intentionally not hard-coded in the first adapter commit. They require labeled Perception examples and false-positive/false-negative analysis. Test fixtures may use explicit synthetic thresholds to verify policy behavior.

## Failure behavior

Decision Fabric fails closed.

- Missing API key: return typed unavailable result; preserve existing runtime path.
- HTTP failure/timeout: record failed attempt in local runtime diagnostics; preserve existing runtime path.
- Refusal: route to review/deeper reasoning according to caller policy; never coerce into false/other.
- Answer-name mismatch: reject the response.
- Missing answer: reject the response.
- Unknown answer type: reject the response.
- Malformed probabilities/confidence: reject or omit the malformed optional field; never fabricate values.
- Public-beta incompatibility: feature flag can disable Decision Fabric without changing existing runtime behavior.

## Integration sequence

### Phase 1 — isolated fabric

- Add typed registry.
- Add Decisions transport adapter with injected fetch.
- Add deterministic normalization and fail-closed tests.
- No runtime consumer and no database migration.

### Phase 2 — shadow routing

After Phase 1 passes, attach Decision Fabric to one non-authoritative intake/triage path in shadow mode. Existing runtime output remains controlling; Decision Fabric receipts are compared only for calibration.

Recommended first shadow consumer: classify whether an incoming candidate world signal is relevant, novel, contradictory, and time-sensitive before deeper processing. Continuous ingestion remains disabled in production until issue #80 is satisfied.

### Phase 3 — bounded routing control

After labeled shadow data is reviewed, allow calibrated high-confidence decisions to skip unnecessary deep reasoning or route uncertain cases upward. No truth or permission boundary changes.

### Phase 4 — durable receipts and learning input

Persist Decision Receipts in LWV-controlled storage with references to their source evidence and definition version. Verified outcomes may later be used to calibrate thresholds. Learning may consume verified outcome pairs, not raw model confidence alone.

## Interaction with existing components

### Meaning Resolver

Unchanged. It continues to preserve the submitted objective and use Structured Outputs for semantic resolution. Decision Fabric may later pre-classify urgency/relevance, but cannot replace the structured meaning object.

### Epistemic Ledger

A Decision Receipt is an assessment about evidence, not the evidence itself. If persisted, it is provenance-bearing machine assessment metadata linked to the underlying evidence/claim.

### Execution Ledger

Decision Fabric may classify or score an intended action, but execution phases remain `intended -> authorized -> attempted -> observed -> verified`. A Decision Receipt cannot create `authorized`, `observed`, or `verified` state.

### Permission Gate

No permission promotion. P2/P3 still require the existing explicit scoped authorization path.

### Verification Engine

Decision Fabric may nominate evidence or assign a verification priority. Verification remains independent and authoritative for truth advancement.

### Project World

Decision Fabric cannot directly mutate canonical Project World state. Only existing verified-effect paths may do so.

### Continuous Perception

This is the natural future high-volume consumer. Decision Fabric can cheaply filter and prioritize world signals before deeper cognition, but activation follows the existing production proof gate.

### Learning

Learning uses verified outcomes and explicit corrections to calibrate routing. It does not treat model probabilities as ground truth.

## API assumptions

As of 2026-10-22, OpenAI documents the Decisions API as public beta with `gpt-6-luna` as the supported model. Requests use the dedicated Decisions endpoint and support independent predicate, choice, and score questions against shared text/image input. The implementation must isolate those assumptions behind the adapter so beta API changes do not leak across Perception.

## Testing strategy

Phase 1 requires tests for:

1. one predicate request and normalized probability;
2. one choice request with selected value, confidence, and probability distribution;
3. one score request with weighted score and per-level probabilities;
4. multiple independent questions preserving name-to-answer identity;
5. refusal normalization;
6. HTTP 4xx/5xx handling;
7. network failure/timeout behavior;
8. missing API key behavior;
9. mismatched/missing answer rejection;
10. feature-disabled behavior preserving the existing path;
11. registry definitions have unique IDs and positive integer versions;
12. no definition permits Decision Fabric to mark truth verified or grant execution permission.

Tests should follow existing injected-fetch patterns so the repository test suite does not require live OpenAI credits.

A separate opt-in smoke test may call the live Decisions endpoint when an explicit API key and smoke-test flag are present. It must never be required for ordinary CI.

## Rollout and rollback

Decision Fabric is feature-flagged and disabled by default until Phase 1 tests pass.

Rollback is immediate: disable the flag and all callers continue through the existing runtime path. No authoritative state depends on Decision Fabric v0.1, so rollback requires no Project World repair.

## Security and privacy

- Send the minimum evidence required for selected questions.
- Do not send secrets solely to improve classification.
- Do not put API keys or provider payloads into user-readable Project World state.
- Never use Decision Fabric to bypass RLS, permission grants, or verification.
- Preserve input hashes and definition versions for auditability without making provider state authoritative.

## Relationship to issue #80

Issue #80 remains the first production proof objective. This design does not change its acceptance gates.

Decision Fabric Phase 1 can land as an isolated, disabled-by-default subsystem because it creates no production side effect. Shadow-mode integration or production routing must wait until the canonical production state can be re-established and the proof path is safe to resume.

The first missing dependency for #80 remains read access to the Supabase account/organization that owns `zxmdfmiueapjhktqchts`; no Decision Fabric work should create a replacement backend or obscure that blocker.
