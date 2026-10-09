# Hagerstown Well Help Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a practice-first, durable, explainable lead-routing engine for Hagerstown Well Help that deduplicates intake, qualifies requests, ranks eligible providers, manages timed offers, guarantees one accepted provider, records every transition, tracks outcomes/revenue, and produces zero external deliveries until live routing is explicitly enabled.

**Architecture:** Extend the existing Perception microsite schema with routing configuration, provider, route, offer, event, and lead-state primitives. Put deterministic classification/ranking/token logic in shared TypeScript imported by both Vitest and Supabase Edge Functions; keep consequential multi-row transitions in SQL RPCs so acceptance and idempotency are transactional. The first shipped mode is PRACTICE only: outbound adapters render and ledger messages but refuse network delivery, while live routing stays gated behind explicit configuration and verified sender/channel work.

**Tech Stack:** TypeScript, Vitest, Supabase Edge Functions/Deno, PostgreSQL 17, Supabase RLS/RPC, GitHub Actions, existing Perception microsite tables.

**Spec:** `docs/superpowers/specs/2026-10-05-hagerstown-well-help-automation-design.md`

## Global Constraints

- Perception/Legacy Works Ventures-controlled storage remains authoritative; provider systems may receive bounded copies but never own canonical routing state.
- Do not rename, repurpose, or silently bind the existing `Hagerstown Basement Waterproofing` microsite to Hagerstown Well Help.
- No provider names are hard-coded into routing logic.
- Practice mode must be physically incapable of external contractor or homeowner delivery.
- Live routing is disabled by default and remains blocked unless both database configuration and runtime environment explicitly enable it.
- Emergency timeout default: **300 seconds (5 minutes)** per provider.
- Routine timeout default: **1800 seconds (30 minutes)** per provider.
- Duplicate review window default: **30 minutes**.
- Supported Hagerstown Well Help service keys: `NO_WATER`, `WELL_PUMP`, `LOW_PRESSURE`, `PRESSURE_TANK`, `WATER_TREATMENT`, `WELL_DIAGNOSTIC`.
- Unknown or ambiguous service classification becomes `MANUAL_REVIEW`; never guess.
- A route can have only one accepted provider. Late or competing accepts must fail closed.
- Provider eligibility is re-checked before every offer.
- Raw homeowner contact details must not appear in broad logs, ranking telemetry, or provider performance metrics.
- CI must keep the existing `npm test`, sovereignty gate, production build, and Hagerstown microsite tests/build green.
- Execution preflight: the spec branch was created from Oct. 5 main while current main has moved forward; before Task 1 implementation, rebase/refresh onto current `main`, then run the full baseline verification commands listed below.

## Review Focus

1. **Boundary-time duplicate submissions:** two otherwise identical submissions on either side of a clock boundary must still collapse to one canonical lead within the 30-minute window; Task 3 pins this with transactional fingerprint lookup rather than time-bucket uniqueness.
2. **Competing accepts:** two valid offers racing for the same route must produce exactly one winner and a deterministic `already_assigned` result for the loser; Task 1/5 pin this in SQL and endpoint tests.
3. **Provider becomes ineligible mid-route:** a provider paused after ranking but before offer creation must be skipped, not contacted; Task 4 tests re-check-before-offer behavior.
4. **Practice/live confusion:** a PRACTICE route or `HWH-TEST-*` lead must never invoke a live delivery adapter even if environment variables are present; Task 4/7 assert zero network sends.
5. **Late provider response:** an offer response after expiration or after another provider wins must not mutate the route; Task 5 covers both cases.

## Execution Preflight

Before product code is changed:

- Refresh `spec/hagerstown-well-help-automation-20261005` onto the latest `main` without dropping the approved spec/plan.
- Run: `npm install`
- Run: `npm test`
- Run: `npm run test:sovereignty`
- Run: `npm run build`
- Run: `npm --prefix microsites/hagerstown test`
- Run: `npm --prefix microsites/hagerstown run build`
- If any baseline command fails, stop and report the pre-existing failure before implementing this plan.

---

### Task 1: Add durable routing schema, RLS, and atomic mutation RPCs

**Files:**
- Create: `supabase/migrations/20261009173500_hagerstown_well_help_routing.sql`
- Create: `supabase/tests/hagerstown_well_help_routing_gate.sql`
- Modify: `.github/workflows/runtime-v02-db-gate.yml`

**Interfaces:**
- Consumes: existing `perception_microsites`, `perception_microsite_leads`, and `perception_microsite_revenue` tables.
- Produces tables: `perception_microsite_routing_configs`, `perception_microsite_providers`, `perception_microsite_lead_routes`, `perception_microsite_lead_offers`, `perception_microsite_lead_events`.
- Produces lead columns: `state`, `service_key`, `urgency`, `normalized_phone_hash`, `normalized_email_hash`, `submission_fingerprint`, `accepted_provider_id`, `updated_at`.
- Produces revenue column: `provider_id` referencing `perception_microsite_providers(id)`.
- Produces RPCs:
  - `perception_ingest_microsite_lead(p_user_id uuid, p_microsite_id uuid, p_channel text, p_source_path text, p_metadata jsonb, p_phone_hash text, p_email_hash text, p_submission_fingerprint text, p_duplicate_window_minutes integer default 30) returns jsonb`
  - `perception_start_microsite_route(p_lead_id uuid, p_service_key text, p_service_area_key text, p_urgency text, p_practice boolean, p_idempotency_key text) returns uuid`
  - `perception_create_microsite_offer(p_route_id uuid, p_provider_id uuid, p_rank integer, p_score numeric, p_score_reasons jsonb, p_expires_at timestamptz, p_idempotency_key text) returns uuid`
  - `perception_resolve_microsite_offer(p_offer_id uuid, p_outcome text, p_idempotency_key text) returns jsonb`
  - `perception_accept_microsite_offer(p_offer_id uuid, p_idempotency_key text) returns jsonb`
  - `perception_transition_microsite_lead(p_lead_id uuid, p_next_state text, p_event_type text, p_provider_id uuid, p_metadata jsonb, p_idempotency_key text) returns jsonb`
  - `perception_exhaust_microsite_route(p_route_id uuid, p_idempotency_key text) returns jsonb`

- [ ] **Step 1: Write the database gate before the migration**

In `supabase/tests/hagerstown_well_help_routing_gate.sql`, add assertions that fail until the schema exists: RLS enabled on all five new tables; `authenticated` cannot directly insert/update/delete routing rows; one unresolved route per lead; one active offer per provider+lead; event idempotency keys are unique per lead; provider/service/status check constraints exist; routing config defaults are 300/1800/30; live mode defaults disabled.

- [ ] **Step 2: Add transactional behavior assertions**

The SQL gate must create fixture user/microsite/providers/leads inside a transaction and assert: exact duplicate ingest returns the original `lead_id`; a same-contact changed submission inside 30 minutes is created as `MANUAL_REVIEW`; starting the same route twice with the same idempotency key returns the first route; accepting offer A marks the route/lead accepted and cancels other pending offers; accepting offer B afterward returns `already_assigned`; expired/pass/delivery-failed resolution is idempotent; exhaustion moves the route to `EXHAUSTED` and lead to `UNROUTABLE`.

- [ ] **Step 3: Run the gate and verify it fails**

Run the DB workflow commands locally against PostgreSQL 17 or reproduce the workflow container steps; expected failure is missing routing tables/functions.

- [ ] **Step 4: Implement the migration**

Use RLS + owner-select policies consistent with the existing microsite tables, revoke client writes from `anon`/`authenticated`, and keep mutation RPCs `security definer` with fixed `search_path = public, pg_temp`. `perception_ingest_microsite_lead` must use `pg_advisory_xact_lock(hashtextextended(microsite_id::text || ':' || p_submission_fingerprint, 0))` before duplicate lookup so two concurrent identical submissions cannot create two canonical leads.

Routing config fields must include: `microsite_id`, `user_id`, `program_key`, `mode` (`PRACTICE`,`LIVE_DISABLED`,`LIVE`), `service_area_rules jsonb`, `emergency_timeout_seconds default 300`, `routine_timeout_seconds default 1800`, `duplicate_window_minutes default 30`, `outbound_enabled default false`, timestamps. No production config row is seeded for the existing Hagerstown waterproofing microsite.

- [ ] **Step 5: Implement atomic accept semantics**

`perception_accept_microsite_offer` must lock the route row `FOR UPDATE`, reject expired/non-active offers, return the prior result for repeated idempotency keys, allow exactly one winner, update `route.accepted_provider_id`, `lead.accepted_provider_id`, lead state `ACCEPTED`, mark winner `ACCEPTED`, cancel remaining pending/sent offers, and append `offer.accepted` plus lead-state evidence in the same transaction.

- [ ] **Step 6: Run database gate**

Expected: `supabase/tests/hagerstown_well_help_routing_gate.sql` exits 0 with all assertions passing.

- [ ] **Step 7: Wire migration/test into DB CI**

Update `.github/workflows/runtime-v02-db-gate.yml` so the replay includes `013_microsite_portfolio.sql`, `017_microsite_lead_ingest.sql`, `018_microsite_rate_limit_client_deny.sql`, `019_microsite_foreign_key_indexes.sql`, the new routing migration, and the new routing gate.

- [ ] **Step 8: Commit**

Commit message: `feat: add durable microsite routing ledger`

---

### Task 2: Add deterministic Hagerstown Well Help classification and ranking logic

**Files:**
- Create: `supabase/functions/_shared/microsite-routing.ts`
- Create: `src/lib/microsite-routing.test.ts`

**Interfaces:**
- Produces types: `RoutingServiceKey`, `RoutingUrgency`, `RoutingProvider`, `RoutingPerformance`, `RoutingPolicy`, `RankedProvider`, `ServiceClassification`, `ServiceAreaRule`.
- Produces functions:
  - `normalizePhone(value: string): string`
  - `normalizeEmail(value: string): string`
  - `submissionFingerprintInput(input: { micrositeId: string; phoneHash?: string | null; emailHash?: string | null; zip: string; issue: string }): string`
  - `classifyHagerstownWellHelp(input: { explicitServiceKey?: string | null; issue: string }): ServiceClassification`
  - `deriveUrgency(input: { serviceKey: RoutingServiceKey; issue: string }): RoutingUrgency`
  - `resolveServiceAreaKey(zip: string, rules: ServiceAreaRule[]): string | null`
  - `rankEligibleProviders(input: { providers: RoutingProvider[]; performance: Record<string, RoutingPerformance>; serviceKey: RoutingServiceKey; serviceAreaKey: string; urgency: RoutingUrgency; timeoutSeconds: number }): RankedProvider[]`
  - `offerTimeoutSeconds(urgency: RoutingUrgency, policy: RoutingPolicy): number`

- [ ] **Step 1: Write failing classification/normalization tests**

Assert: explicit valid service key wins; `no water` => `NO_WATER` + emergency; `pump failed and no usable water` => `WELL_PUMP` + emergency; `low pressure`, `pressure tank`, `water treatment/filter/softener`, and well diagnostic phrases map to their respective routine keys; ambiguous multiple supported categories return `MANUAL_REVIEW`; unsupported text returns `MANUAL_REVIEW`; email normalization lowercases/trims; phone normalization keeps digits only.

- [ ] **Step 2: Write failing service-area tests**

Use fixture `ServiceAreaRule[]` with explicit Washington County ZIPs; assert matching ZIP returns `washington-county-md`, out-of-area ZIP returns null, malformed ZIP returns null. Keep ZIP lists in routing configuration fixtures, not hard-coded in the classifier.

- [ ] **Step 3: Write failing ranking tests**

Eligibility gates: provider must be `ACTIVE`, `acceptingNewWork=true`, contain the service key and service-area key, and if urgency is `EMERGENCY`, `emergencyCapable=true`.

Scoring for eligible providers must be deterministic and explainable:
- base score: `50`
- `priorityBias`: clamp provider value to `[-20, 20]` and add directly
- acceptance-rate contribution: `0..15` (`acceptanceRate * 15`)
- response-speed contribution: `0..10` (`max(0, 1 - medianResponseSeconds / timeoutSeconds) * 10`)
- completion-rate contribution: `0..5` (`completionRate * 5`)
- stable ties: `displayName`, then `id`

Assert returned `scoreReasons` contains each component and ineligible reasons are available for audit.

- [ ] **Step 4: Run targeted tests and verify failure**

Run: `npm test -- src/lib/microsite-routing.test.ts`
Expected: FAIL because module/functions do not exist.

- [ ] **Step 5: Implement the minimal shared module**

No model calls, network calls, provider names, or mutable global state. Classification must prefer explicit structured form values and treat free-text fallback as a deterministic convenience only.

- [ ] **Step 6: Run targeted tests**

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add deterministic microsite routing logic`

---

### Task 3: Make public microsite lead ingestion idempotent without enabling routing

**Files:**
- Modify: `supabase/functions/microsite-lead/index.ts`
- Create: `src/lib/microsite-lead-intake.test.ts`

**Interfaces:**
- Consumes: Task 1 `perception_ingest_microsite_lead` RPC and Task 2 normalization/fingerprint helpers.
- Produces unchanged public success contract `{ ok: true }` plus optional non-sensitive `lead_id`, `duplicate`, and `manual_review` fields; current Hagerstown waterproofing submissions remain intake-only because no routing config is seeded.

- [ ] **Step 1: Write intake helper tests**

Extract/test a pure helper from `_shared/microsite-routing.ts` or a focused `_shared/microsite-intake.ts` only if separation is needed. Assert identical normalized input yields identical fingerprint input; changed ZIP or issue changes it; raw phone/email are never included in fingerprint material after hashing.

- [ ] **Step 2: Update `microsite-lead` to hash contact identity and call the ingest RPC**

Keep existing exact-origin CORS, honeypot, validation, and hashed-network rate limit. Use a server-side salt derived from a dedicated `MICROSITE_LEAD_FINGERPRINT_SECRET`; do not reuse the service-role key as a hash salt. If the secret is missing, fail closed with `503 unavailable` rather than storing unhashed duplicate identifiers.

- [ ] **Step 3: Preserve current product boundary**

Do not call the router automatically from this endpoint in this task. A lead becomes routable only after an explicit routing config exists for its microsite/program. Existing `hagerstownbasementwaterproofing.com` behavior remains lead capture only.

- [ ] **Step 4: Run tests/build**

Run: `npm test -- src/lib/microsite-lead-intake.test.ts src/lib/microsite-routing.test.ts`
Run: `npm run build`
Expected: both commands exit 0.

- [ ] **Step 5: Commit**

Commit message: `feat: make microsite intake idempotent`

---

### Task 4: Add practice-first route orchestration and fail-closed delivery boundary

**Files:**
- Create: `supabase/functions/_shared/microsite-delivery.ts`
- Create: `supabase/functions/microsite-router/index.ts`
- Create: `src/lib/microsite-delivery.test.ts`
- Create: `src/lib/microsite-router.test.ts`

**Interfaces:**
- Consumes: Task 1 RPCs/tables and Task 2 ranking logic.
- Produces delivery API:
  - `dispatchProviderOffer(input: ProviderOfferDeliveryInput, mode: 'PRACTICE' | 'LIVE_DISABLED' | 'LIVE'): Promise<DeliveryResult>`
  - `dispatchHomeownerNotice(input: HomeownerNoticeInput, mode: 'PRACTICE' | 'LIVE_DISABLED' | 'LIVE'): Promise<DeliveryResult>`
- Produces router actions on `microsite-router`:
  - `POST { action: 'start', lead_id }`
  - `POST { action: 'tick', route_id?, now? }` where custom `now` is accepted only for PRACTICE/test callers
  - `POST { action: 'record_contacted'|'record_appointment'|'record_completed'|'record_lost', lead_id, ... }`

- [ ] **Step 1: Write delivery boundary tests**

Assert PRACTICE returns `SIMULATED`, records rendered payload metadata, and performs zero `fetch`/network calls. Assert `LIVE_DISABLED` always returns `BLOCKED`. Assert `LIVE` also returns `BLOCKED` in this implementation until a verified live adapter is installed; no placeholder email/SMS call is allowed.

- [ ] **Step 2: Write route-start tests against injected repositories**

Structure router orchestration so DB access is behind a small repository interface. Assert start: refuses possible duplicates/manual-review leads; resolves configured service area; classifies service/urgency; fetches current eligible providers; ranks; creates route; re-checks first provider eligibility immediately before offer creation; uses 300s emergency or 1800s routine timeout from config; exhausts honestly when no provider is eligible.

- [ ] **Step 3: Write tick tests**

Assert an expired offer becomes `EXPIRED` once and advances to the next currently eligible provider; a `PASSED` or `DELIVERY_FAILED` current offer advances immediately; exhausted provider queue calls `perception_exhaust_microsite_route`; already accepted/cancelled/exhausted routes are no-ops.

- [ ] **Step 4: Implement delivery adapter and router Edge Function**

`microsite-router` uses normal Supabase JWT verification. For user JWT calls, verify the caller owns the microsite/lead before using a service-role client for bounded mutation. Do not expose service-role credentials or raw contact metadata in responses.

- [ ] **Step 5: Re-check provider state before each offer**

Provider ranking may use a snapshot, but `createNextOffer()` must reload the chosen provider row immediately before `perception_create_microsite_offer`; if paused/disabled/not accepting/out-of-area/no longer capable, skip and continue without sending.

- [ ] **Step 6: Run targeted tests**

Run: `npm test -- src/lib/microsite-delivery.test.ts src/lib/microsite-router.test.ts src/lib/microsite-routing.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add practice microsite router`

---

### Task 5: Add signed single-offer provider responses and one-winner acceptance

**Files:**
- Create: `supabase/functions/_shared/microsite-offer-token.ts`
- Create: `supabase/functions/microsite-provider-response/index.ts`
- Modify: `supabase/config.toml`
- Create: `src/lib/microsite-offer-token.test.ts`
- Create: `src/lib/microsite-provider-response.test.ts`

**Interfaces:**
- Produces token helpers:
  - `signOfferToken(payload: { offerId: string; routeId: string; expiresAt: string }, secret: string): Promise<string>`
  - `verifyOfferToken(token: string, secret: string, now?: Date): Promise<{ ok: true; payload: ... } | { ok: false; reason: 'invalid'|'expired' }>`
  - `hashOfferToken(token: string): Promise<string>`
- Provider endpoint accepts only `{ token, response: 'ACCEPT'|'PASS' }`.

- [ ] **Step 1: Write token tests**

Assert deterministic HMAC-SHA256 verification with a fixed test secret, payload tampering fails, signature tampering fails, expired token fails, and token verification does not accept a token for another offer/route.

- [ ] **Step 2: Write provider-response tests**

Assert missing/invalid token returns 401/403 without DB mutation; PASS calls `perception_resolve_microsite_offer(...,'PASSED',...)`; ACCEPT calls `perception_accept_microsite_offer`; repeat ACCEPT returns the prior accepted result; late expired accept returns `expired`; accept after another provider won returns `already_assigned`.

- [ ] **Step 3: Implement custom-auth endpoint**

Set `[functions.microsite-provider-response] verify_jwt = false` because the endpoint is scoped by the signed one-off token. Require `MICROSITE_OFFER_TOKEN_SECRET`; use constant-time signature comparison; do not log raw tokens.

- [ ] **Step 4: Store only a token hash if persistence is needed**

If the offer row needs response-token correlation, add `response_token_hash` via a small follow-up migration in this task (timestamped after Task 1 migration). Never persist the raw token.

- [ ] **Step 5: Run tests/build**

Run: `npm test -- src/lib/microsite-offer-token.test.ts src/lib/microsite-provider-response.test.ts`
Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: add signed provider offer responses`

---

### Task 6: Add homeowner notices, outcome/revenue transitions, and routing metrics

**Files:**
- Modify: `supabase/functions/_shared/microsite-routing.ts`
- Modify: `supabase/functions/microsite-router/index.ts`
- Create: `src/lib/microsite-routing-outcomes.test.ts`
- Modify: `supabase/migrations/20261009173500_hagerstown_well_help_routing.sql` only if still unmerged; otherwise add a new timestamped additive migration.
- Modify: `supabase/tests/hagerstown_well_help_routing_gate.sql`

**Interfaces:**
- Produces notice renderer:
  - `renderHomeownerNotice(type: 'REQUEST_RECEIVED'|'PROVIDER_ACCEPTED'|'NO_PROVIDER_SECURED'|'REQUEST_CANCELLED'|'OUTCOME_FOLLOWUP', input: NoticeInput): RenderedNotice`
- Produces metric read RPC:
  - `perception_get_microsite_routing_metrics(p_microsite_id uuid, p_since timestamptz) returns jsonb`
- Router outcome actions call `perception_transition_microsite_lead`; completed revenue additionally inserts into existing `perception_microsite_revenue` with `lead_id`, `provider_id`, model, amount, and practice/live metadata.

- [ ] **Step 1: Write notice tests**

Assert provider identity appears only in `PROVIDER_ACCEPTED` after an accepted provider exists; `NO_PROVIDER_SECURED` contains no provider claim; practice notices carry `simulated=true`; raw internal scores/ranking reasons are not exposed to homeowners.

- [ ] **Step 2: Write state/outcome tests**

Allowed path: `ACCEPTED -> CONTACTED -> APPOINTMENT -> COMPLETED`; `ACCEPTED|CONTACTED|APPOINTMENT -> LOST`; cancellation follows the spec. Invalid backwards transitions are rejected. Practice completions may record simulated revenue evidence but must not contribute to production revenue/metrics.

- [ ] **Step 3: Add metrics RPC and SQL assertions**

Metrics JSON must expose: `qualification_rate`, `duplicate_rate`, `median_time_to_first_offer_seconds`, `median_time_to_acceptance_seconds`, `provider_acceptance_rate`, `route_exhaustion_rate`, `appointment_rate`, `completion_rate`, `lead_to_revenue_rate`. Filter practice events out of live metrics by default; include an explicit `practice` subsection if useful for diagnostics.

- [ ] **Step 4: Wire event-driven notices through the delivery boundary**

Start records/renders `REQUEST_RECEIVED`; accepted route renders `PROVIDER_ACCEPTED`; exhausted route renders `NO_PROVIDER_SECURED`; cancellation renders `REQUEST_CANCELLED`; all remain simulated while routing config is PRACTICE/LIVE_DISABLED.

- [ ] **Step 5: Run targeted tests + DB gate**

Run: `npm test -- src/lib/microsite-routing-outcomes.test.ts src/lib/microsite-router.test.ts`
Run routing SQL gate.
Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `feat: track routing outcomes and notices`

---

### Task 7: Add the ten-scenario zero-send practice runner

**Files:**
- Create: `scripts/hagerstown-well-help-practice.mjs`
- Create: `src/lib/hagerstown-well-help-practice.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces script command: `npm run practice:hwh`
- Produces machine-readable report with one record per required scenario: `{ id, passed, leadIds, routeIds, acceptedProviderId, externalDeliveries, events, notes }`.

- [ ] **Step 1: Write the ten failing scenario tests**

Exactly cover:
1. emergency accepted by first provider;
2. first times out, second passes, third accepts;
3. two simultaneous leads route independently;
4. duplicate homeowner submission resolves to one canonical lead;
5. repeated provider ACCEPT is idempotent;
6. competing accepts yield one winner;
7. delivery failure advances the queue;
8. all providers unavailable => `UNROUTABLE` + honest notice;
9. disabled/out-of-area provider is never offered;
10. practice mode produces **0 external deliveries**.

- [ ] **Step 2: Implement a deterministic in-memory practice harness using production domain functions**

Do not duplicate ranking/classification logic in the script. Inject a fake clock and fake repository/delivery adapter around the same shared functions used by the Edge router.

- [ ] **Step 3: Add script command**

Add `"practice:hwh": "node scripts/hagerstown-well-help-practice.mjs"` to `package.json`.

- [ ] **Step 4: Run practice suite**

Run: `npm test -- src/lib/hagerstown-well-help-practice.test.ts`
Run: `npm run practice:hwh`
Expected: all 10 scenarios `passed: true`; aggregate `externalDeliveries: 0`.

- [ ] **Step 5: Commit**

Commit message: `test: add Hagerstown Well Help practice suite`

---

### Task 8: Gate CI, document deployment, and verify the full branch

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/runtime-v02-db-gate.yml`
- Modify: `.env.example`
- Create: `docs/HAGERSTOWN_WELL_HELP_ROUTING.md`

**Interfaces:**
- CI guarantees unit/practice/build gates.
- Deployment document defines the explicit path from PRACTICE to live without activating it.

- [ ] **Step 1: Add CI gates**

In `.github/workflows/ci.yml`, after `npm test`, run `npm run practice:hwh`. Add a custom-auth source gate for `microsite-provider-response`: config says `verify_jwt = false`, implementation imports/uses `verifyOfferToken`, and raw token logging patterns are absent.

- [ ] **Step 2: Update `.env.example` with names only**

Document without values: `MICROSITE_LEAD_FINGERPRINT_SECRET`, `MICROSITE_OFFER_TOKEN_SECRET`, and a future live-delivery gate variable such as `MICROSITE_ROUTING_LIVE_ENABLED=false`. Do not add Brevo/Resend/SMTP credentials until a sender/channel is explicitly selected and verified.

- [ ] **Step 3: Write deployment/runbook doc**

`docs/HAGERSTOWN_WELL_HELP_ROUTING.md` must state:
- existing Hagerstown waterproofing site is not automatically rebound;
- how to create a routing config for a future Hagerstown Well Help microsite;
- providers begin `PAUSED`/not accepting until real onboarding verifies service area, services, capacity, response channel, and consent;
- practice command and expected zero-send output;
- migration order;
- sender/channel verification gate;
- Supabase security/performance advisor review requirement;
- live mode requires both DB `mode='LIVE'`/`outbound_enabled=true` and runtime `MICROSITE_ROUTING_LIVE_ENABLED=true`;
- first live leads require manual observation through acceptance, homeowner notice, and outcome evidence;
- scheduler/tick invocation is enabled only as part of the live cutover after the outbound adapter is implemented.

- [ ] **Step 4: Run fresh full verification**

Run, in this order:
- `npm test`
- `npm run practice:hwh`
- `npm run test:sovereignty`
- `npm run build`
- `npm --prefix microsites/hagerstown test`
- `npm --prefix microsites/hagerstown run build`
- PostgreSQL 17 DB gate workflow commands including `hagerstown_well_help_routing_gate.sql`

Expected: every command exits 0; practice report says 10/10 passed and 0 external deliveries.

- [ ] **Step 5: Review requirement coverage against the approved spec**

Confirm each acceptance criterion has concrete evidence: no duplicate paid outcome; one provider winner; reconstructable routing ledger; separate 300/1800-second policy; ineligible providers excluded; honest exhaustion notice; live remains disabled; current waterproofing site remains unchanged.

- [ ] **Step 6: Commit**

Commit message: `docs: gate Hagerstown Well Help routing rollout`

---

## Implementation Notes

- Use additive migrations after any migration has reached another shared branch; do not rewrite deployed migration history.
- The plan intentionally does **not** implement a live Brevo/Resend/SMS adapter. The approved design requires practice-first behavior and verified outbound identity before live delivery. Installing the live adapter is a subsequent bounded change after the sender/channel is chosen and verified.
- The plan intentionally does **not** seed the researched Priority-A companies as active partners. Prospect research is not partnership consent. Real providers are inserted only after onboarding evidence exists.
- The plan intentionally keeps the current public Hagerstown waterproofing site operational and separate. A later explicit Hagerstown Well Help domain/site decision can bind a new microsite to this routing engine without changing the routing primitives.
