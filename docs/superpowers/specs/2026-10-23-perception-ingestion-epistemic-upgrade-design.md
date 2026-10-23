# Perception Ingestion + Epistemic Upgrade — Design

Date: 2026-10-23
Status: design for review
Owner: Legacy Works Ventures LLC

## Intent

Upgrade Perception's existing ingestion and Continuous Mind architecture into a durable, provenance-first epistemic system that can continuously absorb observations, extract atomic claims, reconcile evidence, detect contradictions, manage freshness, schedule verification, and improve Project World readiness without replacing any existing Perception subsystem.

This is explicitly an additive upgrade. It preserves the existing source-ingestion, Continuous Mind, learning-candidate, learning-ledger, belief, world-signal, verification, permission, execution-ledger, and model-event machinery. The new epistemic layer sits between "Perception observed or learned something" and "Perception may treat it as verified Project World truth."

The governing rule is:

> Accepted learning is not verified truth. Only claims that cross an explicit verification boundary may automatically advance canonical Project World truth.

The existing production proof in issue #80 remains the production gate. The canonical Perception backend remains `zxmdfmiueapjhktqchts`. No replacement Supabase project may be created. As of this design, that canonical project is still unavailable through the currently connected Supabase accounts, so this design may be implemented and tested in repository/local or otherwise authorized non-production environments, but canonical production state must not be certified or modified until access is restored.

## Established foundations that remain authoritative

The upgrade builds on the current Perception data plane rather than creating a parallel knowledge system.

Existing components retained:

- `perception_sources` — registered evidence sources and connector identity.
- `perception_project_source_bindings` — explicit source-to-Project-World bindings.
- `perception_source_observations` — append-oriented raw source observations with source identity and content hashes.
- `perception_learning_sources` — approved recurring Continuous Mind sources.
- `perception_study_runs` — durable study-cycle execution records.
- `perception_learning_candidates` — item-level findings worth evaluating or learning from.
- `perception_learning_ledger` — durable accepted learning history.
- `perception_beliefs` — Project World beliefs with state, evidence, contradictions, and confidence.
- `perception_world_signals` — material verified or otherwise accepted world changes that may affect routing.
- `perception_verification_runs` — existing route/execution verification records.
- `perception_model_events` — append-oriented audit events.
- Continuous Mind source claiming, fetch protections, ETag/Last-Modified support, retry/backoff, and Scenario Forge refresh.
- Perception Sovereign Storage Rule — canonical state remains on LWV-controlled infrastructure.
- Route-to-Reality permission and verification boundaries.

The upgrade may tighten the semantics of existing flows, but it must not silently redefine historical records or erase prior learning history.

## Success criteria

The design is successful when the implementation can prove all of the following:

1. Any supported connector can submit information through one provider-independent intake contract.
2. Raw source observations remain immutable evidence and never become canonical truth merely because they were ingested.
3. One observation may yield zero, one, or many atomic claims without losing the exact provenance back to the observation.
4. Repeated ingestion of the same source event is idempotent.
5. Multiple URLs derived from one original source lineage do not count as independent corroboration.
6. Independent corroborating evidence increases support for a claim.
7. Credible contradictory evidence creates an explicit conflict rather than overwriting an earlier claim.
8. Temporal changes can supersede prior claims without rewriting history.
9. Freshness decays independently from truth; a verified claim may become stale without becoming false.
10. Model confidence, source trust, and materiality may prioritize verification but cannot independently create verified truth.
11. Every promotion to verified state has a machine-readable reason and supporting evidence graph.
12. Every Project World truth derived from external evidence is traceable to evidence or explicit user authority.
13. Continuous Mind may study, extract, reconcile, queue verification, and precompute routes while idle without gaining execution authority.
14. Provider/model outages do not destroy evidence or prevent deterministic intake from continuing.
15. The entire epistemic state remains reconstructable from LWV-controlled storage.

## Non-goals

This design does not:

- replace Continuous Mind;
- replace existing source ingestion;
- replace `perception_learning_candidates` with claims;
- replace `perception_learning_ledger` with a new ledger;
- replace `perception_beliefs` or `perception_world_signals`;
- grant execution permission through ingestion or learning;
- allow model consensus to count as independent evidence;
- make vector search, provider memory, hosted threads, or provider-side storage authoritative;
- create a second Project World;
- automatically trust a source forever because it was once highly ranked;
- treat freshness expiration as falsification;
- create a new production backend to work around issue #80.

## Chosen architecture

The canonical flow is:

```text
SOURCE / CONNECTOR / USER / SYSTEM
              |
              v
        INTAKE ENVELOPE
              |
              v
       RAW OBSERVATION
              |
              v
     NORMALIZE / VALIDATE
              |
              v
       CLAIM EXTRACTION
              |
              v
      ENTITY RESOLUTION
              |
              v
     EVIDENCE RECONCILE
              |
              v
      EPISTEMIC GRAPH
              |
              v
         VERIFICATION
              |
              v
       VERIFIED CLAIM
              |
              v
         PROJECT WORLD
```

Existing learning and world-signal flows consume this stronger epistemic state rather than being removed.

### Why this approach

Three approaches were considered.

#### A. Extend the existing observation and Continuous Mind architecture — chosen

Advantages:

- preserves already-working ingestion, source binding, study, learning, verification, and audit machinery;
- minimizes migration risk;
- keeps raw evidence and authoritative truth structurally separate;
- allows gradual rollout and shadow operation;
- fits the existing Sovereign Storage Rule;
- creates a reusable epistemic substrate for all Perception objectives.

#### B. Replace ingestion with a new universal event-sourced knowledge system — rejected

A fully new event system could be elegant, but it would duplicate current ledgers, require expensive migration/reconciliation, and risk breaking already-established Project World semantics.

#### C. Use vector/embedding retrieval as the primary memory and truth layer — rejected

Vector search may accelerate retrieval, clustering, and candidate matching, but it is not a sufficient canonical representation for provenance, contradiction, temporal validity, deterministic replay, or truth promotion.

## Core truth boundary

The following states are intentionally different:

- **observed** — raw evidence exists;
- **extracted** — a candidate assertion has been parsed from evidence;
- **supported** — one or more pieces of evidence support the assertion;
- **conflicted** — credible evidence materially disagrees;
- **verification_pending** — the assertion matters enough to verify;
- **verified** — an accepted verification strategy passed;
- **rejected** — verification failed or authoritative evidence disproved the assertion;
- **stale** — prior verification is older than the claim's freshness policy allows;
- **superseded** — a later claim validly replaces the earlier one while preserving historical correctness.

Only `verified` claims may automatically advance canonical Project World truth.

A `supported` or high-confidence claim may inform research, hypotheses, candidate routes, and verification prioritization, but it must remain explicitly non-authoritative.

## Additive data model

The implementation should add an epistemic layer around the existing tables.

### `perception_ingestion_runs`

Purpose: one durable audit record for every intake operation, regardless of connector.

Minimum fields:

- `id`
- `user_id`
- `project_id`
- `source_id`
- `trigger_kind` (`manual`, `scheduled`, `webhook`, `push`, `backfill`, `internal_event`)
- `connector`
- `external_event_id`
- `schema_version`
- `status`
- `received_at`
- `observed_at`
- `source_published_at`
- `content_hash`
- `raw_observation_id`
- `items_seen`
- `claims_extracted`
- `claims_new`
- `claims_conflicted`
- `verifications_queued`
- `error`
- `metadata`

The run records processing status but does not duplicate raw source payloads.

### `perception_entities`

Purpose: canonical Project World entity identity for subjects and objects referenced by claims.

Minimum fields:

- `id`
- `user_id`
- `project_id`
- `entity_type`
- `canonical_name`
- `canonical_key`
- `metadata`
- `created_at`
- `updated_at`

Entity types are extensible and may include people, organizations, repositories, products, domains, documents, facilities, accounts, events, places, concepts, and project-specific objects.

### `perception_entity_aliases`

Purpose: preserve source wording while resolving multiple labels to one entity.

Minimum fields:

- `entity_id`
- `alias`
- `normalized_alias`
- `source_observation_id`
- `confidence`
- `created_at`

Aliases do not overwrite canonical names.

### `perception_claims`

Purpose: atomic, normalized assertions extracted from observations or verified internal events.

Minimum fields:

- `id`
- `user_id`
- `project_id`
- `subject_entity_id`
- `predicate`
- `object_kind` (`entity`, `string`, `number`, `boolean`, `timestamp`, `json`)
- `object_value`
- `canonical_statement`
- `qualifiers`
- `valid_from`
- `valid_to`
- `claim_fingerprint`
- `state`
- `effective_confidence`
- `confidence_components`
- `extraction_method`
- `extractor_version`
- `first_observed_at`
- `last_observed_at`
- `verified_at`
- `stale_after`
- `superseded_by_claim_id`
- `created_at`
- `updated_at`

`claim_fingerprint` is deterministic over the canonicalized semantic identity of the claim, not over source wording.

A claim may use a normalized natural-language predicate/value representation when forcing a rigid subject-predicate-object shape would lose meaning. The invariant is atomicity and deterministic identity, not a specific ontology.

### `perception_claim_evidence`

Purpose: connect claims to supporting or contradicting observations.

Minimum fields:

- `claim_id`
- `observation_id`
- `stance` (`supports`, `contradicts`, `qualifies`, `supersedes`, `duplicates`)
- `extraction_confidence`
- `evidence_strength`
- `provenance_root`
- `is_independent_root`
- `created_at`

This relation is append-oriented. Reconciliation may add new relations but must not erase earlier evidence history.

### `perception_claim_relations`

Purpose: express claim-to-claim semantic relationships.

Supported relation types:

- `supports`
- `contradicts`
- `refines`
- `supersedes`
- `duplicates`
- `depends_on`
- `temporally_compatible`

Each relation stores confidence, method/version, and supporting evidence references.

### `perception_observation_lineage`

Purpose: represent provenance ancestry so syndicated or copied content does not inflate corroboration.

Minimum fields:

- `observation_id`
- `parent_observation_id`
- `root_fingerprint`
- `lineage_kind` (`original`, `syndicated`, `quoted`, `mirrored`, `derived`, `unknown`)
- `confidence`
- `method`
- `created_at`

Independent corroboration is calculated from provenance roots, not URL count.

### `perception_verification_tasks`

Purpose: durable queue and receipt for claim verification.

Minimum fields:

- `id`
- `user_id`
- `project_id`
- `claim_id`
- `priority`
- `materiality`
- `uncertainty`
- `route_impact`
- `freshness_urgency`
- `contradiction_severity`
- `estimated_cost`
- `strategy`
- `requirements`
- `status`
- `attempts`
- `result`
- `evidence`
- `requested_at`
- `started_at`
- `finished_at`

The task may reference an existing `perception_verification_runs` record where route/execution verification is the appropriate proof mechanism. The new table is not a replacement for route-node verification; it covers epistemic claim verification that may occur outside a route node.

### `perception_source_domain_stats`

Purpose: learned source calibration by domain rather than one permanent global trust number.

Minimum fields:

- `source_id`
- `domain_key`
- `prior_trust`
- `verified_supports`
- `verified_failures`
- `retractions`
- `contradictions`
- `median_freshness_lag_seconds`
- `precision_estimate`
- `reliability_score`
- `sample_size`
- `updated_at`

Existing `perception_sources.trust_weight` and `perception_learning_sources.trust_weight` remain user/configuration priors. Learned calibration modifies effective trust but never becomes a truth gate by itself.

## Existing-table compatibility

The new layer does not replace the existing item-level learning model.

Relationship:

```text
source observation
      |
      +--> learning candidate  (item-level usefulness)
      |
      +--> claim(s)            (fact-level assertions)
               |
               +--> evidence graph
               +--> conflicts
               +--> verification tasks
               +--> verified claim
                        |
                        +--> world signal / belief update candidate
                        +--> learning ledger
```

`perception_learning_candidates.status = accepted` continues to mean "accepted as useful learning." It must no longer imply "verified as external truth."

Existing internal events that already originate from a completed Perception verification may still create immediate learning-ledger entries because their verification happened upstream and its evidence can be referenced.

Historical records are not rewritten when the new semantics are introduced.

## Universal intake envelope

All connector-specific input is normalized into a shared envelope before epistemic processing.

Minimum envelope:

```ts
type PerceptionIntakeEnvelope = {
  ingestionRunId: string
  projectId: string | null
  sourceId: string
  connector: string
  externalEventId: string | null
  observedAt: string
  receivedAt: string
  sourcePublishedAt: string | null
  contentHash: string
  contentType: string
  schemaVersion: number
  parentObservationId: string | null
  provenanceHints: Array<Record<string, unknown>>
  rawObservationId: string
  permissions: {
    mayExtract: boolean
    mayVerify: boolean
    mayUseForRouting: boolean
  }
}
```

Connector adapters own authentication, provider-specific normalization, payload limits, and source identity. Everything after the envelope is provider-independent.

Invalid or missing source timestamps are rejected when the source contract requires an authoritative observation time. They must not be silently replaced with server time. Server receipt time remains available separately as `received_at`.

## Two-speed processing engine

### Fast lane — deterministic first

The default path performs cheap, deterministic work before invoking a model:

- payload validation;
- stable hashing and deduplication;
- source identity normalization;
- timestamp normalization;
- structural parsing;
- exact entity identifiers;
- exact/typed field changes;
- deterministic freshness calculations;
- known claim fingerprint matching;
- exact contradiction checks;
- previously learned provenance lineage matches;
- policy and permission checks.

If the observation can be fully reconciled deterministically, no model call is required.

### Deep lane — bounded model assistance

Models may be used for:

- semantic claim extraction;
- ambiguous entity resolution;
- nuanced contradiction classification;
- temporal interpretation;
- provenance-lineage suggestions;
- Project World relevance assessment;
- verification-plan suggestions;
- explanation of why evidence matters.

Models may propose but do not govern truth transitions.

## Model authority boundary

Models may:

- propose claims;
- propose entity links;
- classify semantic relationships;
- summarize observations;
- flag possible conflicts;
- estimate extraction certainty;
- suggest verification strategies;
- prioritize deeper review.

Models may not:

- set final verified state;
- fabricate or substitute observation timestamps;
- overwrite provenance;
- erase conflicting evidence;
- treat repeated model agreement as corroboration;
- grant P1/P2/P3 execution permissions;
- mark an execution or route verification passed;
- directly mutate canonical Project World truth.

Decision Fabric, where used, follows the same rule. Its classifications are machine assessments that may route or prioritize evidence but do not become evidence or verification by themselves.

## Confidence model

Perception stores confidence as an explainable decomposition rather than one opaque model-provided scalar.

Required components:

- `source_trust`
- `extraction_certainty`
- `freshness`
- `independent_corroboration`
- `contradiction_pressure`
- `verification_strength`
- `specificity`

Initial effective confidence should use a versioned deterministic function. The first implementation may use a weighted geometric or weighted arithmetic composition, but the exact function must be versioned and stored with the claim so scores remain reproducible.

Hard rule: no confidence score, including `1.0`, bypasses verification when the claim would advance external Project World truth.

Confidence therefore answers "how strongly should Perception treat this as supported and how urgently should it verify it?" rather than "is this automatically true?"

## Provenance lineage and independence

Corroboration uses independent provenance roots.

Example:

```text
Reuters original
  |- Yahoo syndication
  |- MSN syndication
  |- Blog A quotation
       `- Blog B quotation
```

This is one independent root unless another source independently observed or established the fact.

Lineage detection may use deterministic metadata first and model-assisted similarity second. Uncertain lineage is conservative: it does not increase independent corroboration until independence is established.

## Contradiction engine

Each new or changed claim is reconciled against relevant active and historical claims.

Possible relationships:

- `same`
- `supports`
- `refines`
- `supersedes`
- `contradicts`
- `temporally_compatible`
- `unrelated`
- `uncertain`

Time is first-class.

A January claim that a facility has 200 MW planned capacity and an October claim that it has 350 MW may be a legitimate supersession. A claim that a facility opened October 4 and credible evidence that it remained unopened October 10 is a material contradiction.

Uncertain contradiction classification creates a review/verification candidate. It does not average incompatible facts together.

## Freshness model

Freshness belongs to the claim type/domain, not merely the source.

Examples:

- birth date — effectively permanent unless corrected;
- current CEO — periodic refresh;
- repository head SHA — change-driven/immediate;
- production deployment — minutes/hours;
- price — minutes;
- election polling — hours;
- data-center construction status — days;
- permits/filings — event-driven plus periodic check.

When freshness expires:

```text
verified -> stale
```

not:

```text
verified -> rejected
```

Stale claims retain their historical verification evidence and enter the verification queue for refresh if still material.

## Verification scheduler

Verification work is prioritized by a deterministic policy based on:

```text
materiality
x uncertainty
x route impact
x freshness urgency
x contradiction severity
/ estimated verification cost
```

The implementation may normalize each factor into `[0,1]`; zero cost is forbidden and a minimum denominator prevents runaway priority.

Priority is a queueing mechanism only. It does not weaken verification requirements.

## Verification strategies

Supported strategies include:

### Direct read-back

Query the system whose state is being asserted and independently observe the current result.

### Primary-source confirmation

Use an authoritative API, filing, repository, deployment service, government record, or other primary source appropriate to the claim.

### Independent corroboration

Require multiple provenance-independent sources when no single authoritative source exists.

### Temporal confirmation

Recheck after an expected state transition or after the freshness window expires.

### User-authoritative declaration

For facts where the user is legitimately the authority, explicit user input may verify the claim. The receipt must record that authority type rather than pretending it was independently observed.

### Execution verification

For action outcomes, use the existing intended -> authorized -> attempted -> observed -> verified execution contract.

### Cross-system reconciliation

Compare two authoritative systems when consistency itself is the claim, for example repository commit versus production deployment commit.

Every verification receipt records the strategy, requirements, evidence, result, and timestamps.

## Promotion gate

External learning reaches Project World truth only through one controlled promotion path.

Conceptually:

```text
observation
 -> claim
 -> support/conflict analysis
 -> verification task
 -> verification passed
 -> claim state = verified
 -> promotion event
 -> world signal / belief update candidate
 -> existing learning + routing machinery
```

The promotion function/RPC must:

- require the claim to be in a promotable state;
- require an eligible successful verification receipt;
- preserve all evidence references;
- emit an append-only model event;
- be idempotent;
- reject attempts to promote merely from confidence/materiality/source trust;
- never grant execution permissions.

## Continuous Mind semantic upgrade

The existing Continuous Mind status vocabulary can remain for backward compatibility, but its external-truth semantics change.

Current risky behavior conceptually allows:

```text
high materiality + high confidence + high source trust
 -> accepted learning
 -> verified world signal path
```

The upgraded behavior is:

```text
high materiality + high confidence + high source trust
 -> accepted learning candidate
 -> high-priority verification task
 -> independent verification
 -> verified claim
 -> world signal / belief promotion
```

This is the most important correctness change in the upgrade.

Existing internally verified Perception events are exempt from redundant re-verification only when their upstream verification receipt is explicit and linked.

## Source reputation engine

Trust becomes adaptive and domain-specific.

Per source/domain, Perception tracks:

- verified supports;
- verified failures;
- later corrections;
- retractions;
- contradictions;
- freshness/latency;
- primary versus secondary source behavior;
- sample size;
- precision/reliability estimates.

Configured trust weights remain priors. Learned reputation adjusts prioritization and confidence components, but does not independently cross the truth boundary.

Sparse-data domains must remain conservative. A source with one success does not become globally trusted.

## Dormant-time Continuous Mind MAX

The existing scheduler remains the base runtime. Idle cycles are expanded in place rather than replaced.

A scheduled cycle may perform, within policy and budget:

1. claim due approved sources;
2. fetch and ingest new observations;
3. extract atomic claims;
4. resolve entities;
5. reconcile evidence;
6. detect contradictions and supersessions;
7. recalculate freshness for material claims;
8. queue verification work;
9. execute eligible P0 verification actions;
10. update claim states from verified results;
11. update source-domain calibration;
12. score previous forecasts against observed outcomes where applicable;
13. refresh Scenario Forge;
14. precompute candidate Reality Routes and verification plans;
15. emit an auditable summary of what changed.

Dormant work may create hypotheses, candidate routes, forecasts, research questions, and verification plans. These remain provisional unless they separately satisfy their existing truth and permission gates.

Dormant ingestion never grants execution authority.

## Budget governor

Continuous ingestion is bounded by explicit per-cycle limits:

- maximum source fetches;
- maximum bytes fetched;
- maximum model tokens/calls;
- maximum verification tasks attempted;
- maximum runtime;
- maximum monetary cost where cost accounting is available;
- maximum concurrency by connector and project.

The scheduler spends budget in descending expected-information-value order. Low-value background work yields to material uncertainty, stale route dependencies, and contradictions affecting active objectives.

A budget stop produces a resumable partial run, not an error and not data loss.

## Idempotency and replay

Stable identities are required for:

- source events;
- observations;
- claims;
- claim/evidence relations;
- provenance roots;
- verification requests;
- promotion events.

Retrying the same source event many times must not create duplicate knowledge.

Raw observations remain replayable. A newer extractor version may derive improved claims from the same immutable observation, but the earlier extraction remains auditable. Re-extraction records its extractor version and relationship to prior claims.

## Failure behavior

The entire pipeline fails closed and degrades gracefully.

- Invalid payload -> reject before storage except for a bounded audit failure record where appropriate.
- Missing/invalid authoritative observation timestamp -> reject; do not substitute server time.
- Duplicate event -> return idempotent success with existing identities.
- Extraction failure -> keep the raw observation and mark the ingestion run partial/failed at extraction.
- Entity resolution failure -> keep the claim unresolved rather than guessing.
- Contradiction uncertainty -> create a conflict/verification candidate.
- Verification failure -> do not advance truth.
- Source outage -> preserve prior evidence; freshness continues to age.
- Model outage -> deterministic intake, hashing, dedupe, freshness, and exact reconciliation continue.
- Scheduler outage -> canonical knowledge remains intact and queued work resumes later.
- Budget exhaustion -> persist checkpoint and resume on a later cycle.
- Connector authentication failure -> record bounded connector error; do not widen credentials or fall back to an unapproved source.

## Security, permissions, and sovereignty

### Storage

Canonical observations, claims, entities, lineage, verification tasks, evidence, and promotion receipts live on LWV-controlled Perception infrastructure.

Provider calls receive bounded copies only. Provider memory, hosted vector stores, conversations, threads, prior-response chains, or proprietary memory cannot become the system of record.

### RLS and privileged functions

Any new exposed table must use RLS. User-visible reads must remain owner/project scoped. Internal cross-table mutation or promotion functions must use the narrowest privileges possible, explicitly revoke `PUBLIC`/`anon`/`authenticated` execution where not required, and remain callable only through the intended trusted runtime boundary.

### Permission separation

Ingestion and epistemic verification are knowledge operations. They do not imply action authorization.

Existing permission classes remain authoritative. Background verification may only perform actions already permitted as P0 or otherwise explicitly authorized under current Perception policy.

### Audit

Every state transition that can affect Project World truth emits an append-oriented event with the relevant claim, evidence, verification, and prior-state references.

## Interaction with Decision Fabric

Decision Fabric may be used in the deep lane for bounded relevance, novelty, contradiction, evidence-type, or urgency assessments.

Its outputs are assessments, not evidence. A Decision Fabric receipt may:

- route a candidate;
- lower/raise review priority;
- nominate a contradiction;
- select a verification strategy;
- decide whether deeper processing is worth the cost.

It may not:

- verify a factual claim by itself;
- count as an independent source;
- promote Project World truth;
- grant execution permission.

The ingestion architecture remains functional when Decision Fabric is disabled.

## Observability and inspection

Perception must be able to answer, for any material claim:

- What exactly is the claim?
- Where did it come from?
- What raw observations support it?
- Which sources are actually independent?
- What contradicts it?
- How fresh is it?
- What confidence components produced the current score?
- Has it been verified?
- By what strategy?
- What Project World state depends on it?
- What changed when it was promoted, rejected, made stale, or superseded?

Operational metrics should include:

- observations ingested;
- dedupe rate;
- claims extracted;
- claims per observation;
- unresolved entity rate;
- conflict rate;
- verification queue depth/age;
- verification pass/fail rate;
- stale verified claims;
- provenance-root compression ratio;
- model calls avoided by deterministic fast lane;
- per-source/domain reliability sample size;
- idle-cycle cost and information yield.

## Compatibility and rollout boundaries

The design is intentionally additive.

No existing table is removed. Existing public/runtime contracts should continue working while the epistemic layer is introduced behind feature flags or shadow mode where needed.

Recommended rollout semantics:

1. Persist new ingestion/claim/evidence structures in shadow mode.
2. Compare claim extraction/reconciliation with current learning behavior.
3. Change external Continuous Mind auto-acceptance so it queues verification instead of creating verified world signals.
4. Enable verified-claim promotion into existing world-signal/belief machinery.
5. Expand dormant-time verification and source calibration only after the core truth gate is proven.

These are architectural rollout boundaries, not the implementation task plan. The implementation plan is written only after this design is reviewed and approved.

## Production gate and issue #80

This work does not supersede issue #80.

Before canonical production activation:

- restore access to canonical Supabase project `zxmdfmiueapjhktqchts`;
- reconcile applied migrations with repository migrations;
- enumerate deployed Edge Function versions;
- review security/runtime advisors;
- prove the existing Route-to-Reality production contract;
- confirm Sovereign Storage invariants;
- then apply and verify the epistemic upgrade through the normal migration/deployment process.

If production evidence differs from repository assumptions, repair the first conflicting boundary rather than masking it with a new backend or fallback truth path.

## Acceptance tests

The implementation is not complete until the following scenarios pass with durable evidence:

1. Submit the same observation 100 times -> one canonical observation identity.
2. Reprocess one observation with the same extractor version -> no duplicate claims.
3. Reprocess with a newer extractor version -> historical extraction remains auditable and improved claims are linked rather than destructive.
4. Ingest multiple articles syndicated from one origin -> one provenance root for corroboration purposes.
5. Ingest two genuinely independent sources supporting the same claim -> independent corroboration increases.
6. Ingest credible contradictory evidence -> conflict persists and neither claim silently overwrites the other.
7. Ingest a temporally newer fact that validly supersedes an older fact -> both historical states remain reconstructable.
8. Submit an invalid required observation timestamp -> ingestion rejects it rather than substituting `now()`.
9. Disable the model provider -> deterministic validation, hashing, dedupe, freshness, and exact matching continue.
10. Fail a verification task -> claim does not become verified and Project World truth does not advance.
11. Verify a claim, then let its freshness window expire -> state becomes stale while historical verification is preserved.
12. Verify a stale claim again -> freshness and verification state update without erasing earlier receipts.
13. Let a source accumulate verified successes and failures -> domain-specific calibration changes while configured trust remains preserved as a prior.
14. Feed ten copied URLs from one provenance lineage -> confidence does not rise as if ten independent confirmations existed.
15. Run an idle cycle -> it may ingest, extract, reconcile, verify eligible P0 facts, refresh scenarios, and precompute routes without gaining execution permission.
16. Attempt to promote a high-confidence/high-trust unverified external claim -> promotion is rejected.
17. Attempt to promote a verified claim with a valid verification receipt -> promotion is idempotent and produces an auditable model event.
18. Query a verified claim -> Perception can explain why it believes it, with source/evidence/verification references.
19. Query a rejected/conflicted claim -> Perception can explain why it did not accept it as truth.
20. Reconstruct one Project World from LWV-controlled state -> all promoted claim provenance remains reachable.

## Design invariants

These are hard requirements, not tuning preferences:

1. Raw evidence is never rewritten into truth.
2. Accepted learning is not verified truth.
3. A source cannot verify itself merely by repeating itself.
4. Copied/syndicated reports count by provenance root, not URL count.
5. Model agreement is not independent evidence.
6. No claim loses provenance.
7. Contradictions survive resolution for audit/history.
8. Corrections and supersessions preserve prior state.
9. Freshness is claim-specific.
10. Every promotion to verified truth has a machine-readable verification receipt.
11. Every externally derived Project World truth traces to evidence or explicit user authority.
12. Provider-owned memory/storage is never canonical.
13. Knowledge confidence cannot raise execution permissions.
14. Dormant learning cannot silently perform consequential external actions.
15. Failed or unavailable verification leaves truth unchanged.

## Final designed state

The resulting Perception stack is:

```text
                         PERCEPTION
                             |
                      PROJECT WORLD
                             |
               +------ VERIFIED TRUTH ------+
               |                            |
            BELIEFS                    WORLD SIGNALS
               |                            |
               +--------- PROMOTION --------+
                             ^
                       VERIFICATION
                             ^
                    EPISTEMIC GRAPH
               claims <-> entities <-> claims
                  ^          ^           ^
              evidence    conflicts   relations
                  ^
           NORMALIZE / EXTRACT
                  ^
             RAW OBSERVATIONS
                  ^
      SOURCE / CONNECTOR / USER / SYSTEM
```

Continuous Mind remains the always-on study and learning runtime around this graph. The epistemic upgrade makes its learning more granular, replayable, contradiction-aware, freshness-aware, and verifiable without replacing the system already built.

The practical result is that Perception can maintain an auditable model of what it believes reality to be, why it believes it, what conflicts with it, what has gone stale, and what should be verified next — while preserving the existing Route-to-Reality, permission, verification, and sovereign-storage contracts.
