# Hagerstown Well Help Automation Design

## Purpose

Build a durable, explainable lead-routing system for Hagerstown Well Help that can accept homeowner requests, qualify them, rank eligible local providers, route requests through a timed offer sequence, record every routing decision, notify the homeowner, and track the final service and revenue outcome.

The system must support a zero-send practice mode first, using synthetic `HWH-TEST-*` leads, before any contractor or homeowner messages are sent automatically.

## Current reality

Perception already has a public microsite intake pattern and a Hagerstown lead Edge Function. The current `microsite-lead` endpoint validates submissions, restricts browser origins, uses a honeypot and hashed-network rate limit, and writes accepted requests to `perception_microsite_leads` with server-side credentials. The existing schema includes `qualified` and `contractor_destination_id`, but it does not contain a durable provider registry, offer lifecycle, routing history, timeout/escalation state, duplicate protection, or provider performance model.

The current Hagerstown public microsite in this repository is `Hagerstown Basement Waterproofing`. Hagerstown Well Help is a broader well/pump/private-water referral operation. This design therefore adds provider-neutral routing capability to Perception without silently renaming, replacing, or repurposing the existing public microsite. A later explicit product/domain decision can bind Hagerstown Well Help to a particular microsite or domain.

## Design principles

1. **Perception remains authoritative.** Canonical lead, routing, provider, and outcome state lives in infrastructure controlled by Legacy Works Ventures.
2. **Every consequential transition is recorded.** Offers, expirations, passes, acceptances, reroutes, failures, customer notices, and outcomes are append-oriented evidence rather than silently overwritten state.
3. **Routing is deterministic first.** Provider selection starts from explicit geography, service fit, eligibility, availability, and observed performance. AI may enrich classification later but is not required for safe routing.
4. **Practice mode is physically incapable of live outreach.** Test leads can exercise the full routing state machine without delivering external messages.
5. **No fake match.** A homeowner is told a provider accepted only after a real acceptance event exists.
6. **Idempotency is required.** Repeated requests, retries, duplicate webhook deliveries, and repeated provider responses must not create duplicate paid leads or conflicting accepted providers.
7. **Fail closed on provider eligibility.** A provider that is disabled, outside the service area, unavailable, or otherwise ineligible is not routed a live request.

## Scope

### In scope

- Provider registry for service areas, capabilities, active/paused status, routing preference, and performance inputs.
- Lead normalization and duplicate detection.
- Qualification state.
- Deterministic provider ranking.
- Timed offer, expiration, pass, acceptance, and escalation flow.
- Separate emergency and routine routing windows.
- Homeowner notification state.
- Outcome tracking from acceptance through completed/lost.
- Revenue event linkage to a lead and provider.
- Practice mode with synthetic leads and blocked external sends.
- Auditability of every routing decision.

### Out of scope for this first implementation

- Automated contractor billing or payment collection.
- AI-generated contractor eligibility decisions.
- Public contractor reviews or rankings.
- Dynamic surge pricing.
- Multi-market rollout outside the Washington County pilot.
- Rebranding the existing Hagerstown Basement Waterproofing microsite.
- Automatic onboarding of unverified providers.

## Lead state machine

A lead has one canonical current state plus an immutable transition history.

Primary states:

`NEW -> QUALIFIED -> ROUTING -> ACCEPTED -> CONTACTED -> APPOINTMENT -> COMPLETED`

Terminal or exception states:

- `DUPLICATE`
- `UNQUALIFIED`
- `UNROUTABLE`
- `LOST`
- `CANCELLED`
- `MANUAL_REVIEW`

Rules:

- `NEW` may become `DUPLICATE`, `UNQUALIFIED`, `MANUAL_REVIEW`, or `QUALIFIED`.
- `QUALIFIED` becomes `ROUTING` only when at least one eligible provider exists.
- `ROUTING` becomes `ACCEPTED` only from an atomic provider acceptance.
- Only one provider may own the accepted assignment for a lead.
- `ROUTING` becomes `UNROUTABLE` when the eligible queue is exhausted.
- A repeated transition request with the same idempotency key is a no-op that returns the already-recorded result.

## Data model

### `perception_microsite_providers`

Purpose: canonical provider registry.

Required fields:

- `id uuid primary key`
- `user_id uuid`
- `display_name text`
- `status text` with `ACTIVE`, `PAUSED`, `DISABLED`
- `service_keys jsonb`
- `service_areas jsonb`
- `emergency_capable boolean`
- `accepting_new_work boolean`
- `routing_channel text`
- `routing_destination text`
- `priority_bias numeric`
- `created_at timestamptz`
- `updated_at timestamptz`

The initial Washington County provider set is entered only from verified business information. Provider rows do not imply endorsement, license verification, availability, or partnership beyond what is explicitly verified and stored.

### `perception_microsite_lead_routes`

Purpose: one routing episode per lead.

Required fields:

- `id uuid primary key`
- `lead_id uuid`
- `route_status text` with `PENDING`, `ACTIVE`, `ACCEPTED`, `EXHAUSTED`, `CANCELLED`
- `urgency text` with `EMERGENCY`, `ROUTINE`
- `service_key text`
- `service_area_key text`
- `accepted_provider_id uuid null`
- `started_at timestamptz`
- `resolved_at timestamptz null`
- `created_at timestamptz`

There is at most one unresolved route per lead.

### `perception_microsite_lead_offers`

Purpose: append-oriented offer history.

Required fields:

- `id uuid primary key`
- `route_id uuid`
- `lead_id uuid`
- `provider_id uuid`
- `rank integer`
- `score numeric`
- `score_reasons jsonb`
- `status text` with `PENDING`, `SENT`, `ACCEPTED`, `PASSED`, `EXPIRED`, `DELIVERY_FAILED`, `CANCELLED`
- `idempotency_key text unique`
- `offered_at timestamptz`
- `expires_at timestamptz`
- `responded_at timestamptz null`
- `delivery_metadata jsonb`
- `created_at timestamptz`

A provider cannot have two simultaneously active offers for the same lead.

### `perception_microsite_lead_events`

Purpose: immutable state and notification ledger.

Each row records:

- lead ID
- event type
- previous state
- next state
- actor/source
- provider ID when relevant
- idempotency key
- metadata
- occurred time

Examples: `lead.qualified`, `route.started`, `offer.sent`, `offer.expired`, `offer.passed`, `offer.accepted`, `homeowner.notified`, `appointment.confirmed`, `job.completed`, `job.lost`.

### Existing `perception_microsite_leads`

Keep the table as the lead identity and intake record. Add only the minimal fields needed for canonical current state and duplicate/idempotency support rather than moving routing history into this table.

Required additions:

- `state text`
- `service_key text`
- `urgency text`
- `normalized_phone_hash text null`
- `normalized_email_hash text null`
- `submission_fingerprint text null`
- `accepted_provider_id uuid null`
- `updated_at timestamptz`

The raw homeowner contact details already stored in metadata remain protected by existing ownership/RLS boundaries. Fingerprints are for duplicate detection, not identity expansion.

## Duplicate detection

The router computes a bounded submission fingerprint from normalized site, contact identity, ZIP, service key, and a time bucket. Exact duplicate retries inside the configured duplicate window resolve to the existing lead.

A likely duplicate never becomes a second paid lead automatically. When confidence is insufficient for an exact duplicate decision, the lead enters `MANUAL_REVIEW` rather than being silently discarded.

## Qualification

Qualification is deterministic for V1.

A qualified Hagerstown Well Help lead requires:

- valid contact path;
- service location within the configured Washington County pilot area;
- a supported service key;
- enough issue detail to route safely;
- no active duplicate match;
- no explicit spam/bot flag from intake controls.

Initial supported service keys:

- `NO_WATER`
- `WELL_PUMP`
- `LOW_PRESSURE`
- `PRESSURE_TANK`
- `WATER_TREATMENT`
- `WELL_DIAGNOSTIC`

Requests outside these keys enter `MANUAL_REVIEW` rather than being guessed into a service class.

## Urgency

V1 uses two urgency classes.

### Emergency

Examples: no water, pump failure where the household has no usable water, or an explicitly verified same-day emergency category.

Default offer window: **5 minutes** per provider.

### Routine

Examples: low pressure, water treatment, planned pump replacement, pressure tank, diagnostic work without loss of household water.

Default offer window: **30 minutes** per provider.

The timeout values are configuration, not hard-coded assumptions inside ranking logic.

## Provider ranking

V1 ranking is deterministic and explainable.

Score inputs, in order of importance:

1. service-area eligibility;
2. service-key capability;
3. active/accepting-work state;
4. emergency capability when required;
5. provider priority bias;
6. recent acceptance rate;
7. recent response time;
8. recent completion/lost outcomes.

A score response always includes machine-readable reasons so a route can be audited later.

Seed/demo activity is never mixed into provider performance statistics.

## Offer lifecycle

1. Start a route for a qualified lead.
2. Rank all eligible providers.
3. Create the first offer with a unique idempotency key and expiration time.
4. In practice mode, record `offer.simulated` instead of delivering externally.
5. In live mode, deliver through the provider's configured routing channel.
6. On `ACCEPT`, atomically accept the offer, cancel all other pending offers for the route, bind the provider to the lead, and move the lead to `ACCEPTED`.
7. On `PASS`, immediately create/send the next eligible offer.
8. On timeout, mark the current offer `EXPIRED` and advance.
9. On delivery failure, mark the offer `DELIVERY_FAILED` and advance.
10. If no eligible provider remains, mark the route `EXHAUSTED` and the lead `UNROUTABLE`.

Provider acceptance must use compare-and-set or equivalent transactional protection so two near-simultaneous acceptances cannot both win.

## Homeowner communication

Homeowner communication is event-driven.

V1 messages:

- request received;
- provider accepted;
- no provider secured yet;
- request cancelled;
- optional outcome follow-up.

A provider's identity is disclosed only after that provider has accepted the lead.

Practice mode records the rendered message payload and intended destination but does not call an external email/SMS provider.

## Practice mode

Practice mode is a first-class environment behavior, not a naming convention alone.

Requirements:

- `HWH-TEST-*` synthetic lead IDs are supported.
- provider offers are simulated;
- homeowner messages are simulated;
- no external delivery connector is invoked;
- all state transitions, timeouts, ranking decisions, and rendered payloads are recorded;
- simulated events are flagged so they cannot affect production provider performance or revenue.

The following scenarios must pass before live routing is enabled:

1. one emergency lead accepted by first provider;
2. first provider times out, second passes, third accepts;
3. two simultaneous leads routed independently;
4. duplicate homeowner submission resolves to one canonical lead;
5. repeated provider `ACCEPT` callback is idempotent;
6. two providers attempt near-simultaneous acceptance and only one wins;
7. delivery failure advances the queue;
8. all providers unavailable produces `UNROUTABLE` and an honest homeowner status;
9. a disabled/out-of-area provider is never offered the lead;
10. practice mode produces zero external deliveries.

## Security and authorization

- Public intake remains a bounded unauthenticated surface with strict origin, validation, abuse controls, and server-side writes.
- Provider-response endpoints use signed single-offer tokens or another bounded authenticated mechanism; they never expose service-role credentials.
- A provider response token is scoped to one offer and expires with that offer.
- RLS remains enabled on all routing tables.
- End users may read only their own Perception-owned control-plane data under existing ownership rules.
- Public or provider-facing endpoints perform narrowly scoped server-side mutations rather than granting table write access.
- Raw homeowner contact details are not included in broad logs or provider ranking telemetry.

## Observability

For every lead, Perception must be able to answer:

- why the lead was or was not qualified;
- which providers were eligible;
- the ranked order and score reasons;
- every offer and its result;
- which provider accepted;
- how long routing took;
- what homeowner notice was generated;
- whether the job reached appointment/completed/lost;
- whether revenue was recorded;
- whether the events were practice or live.

Core metrics:

- qualification rate;
- duplicate rate;
- time to first offer;
- time to acceptance;
- provider acceptance rate;
- provider median response time;
- route exhaustion rate;
- appointment rate;
- completion rate;
- lead-to-revenue rate.

## Failure handling

- Database write failure: do not claim a route or acceptance occurred; return retriable server error and record failure if possible.
- Delivery failure: mark the offer failed and advance to the next provider.
- Timeout worker retry: use idempotency keys so an expired offer advances once.
- Duplicate provider callback: return the previously recorded result.
- Late acceptance after expiration: reject as expired unless the route still shows that exact offer as active.
- Late acceptance after another provider won: reject as already assigned.
- No eligible provider: mark `UNROUTABLE` and generate the honest no-provider-secured message.
- Unknown service request: `MANUAL_REVIEW`.
- Provider status changes during route: re-check eligibility before creating each new offer.

## Deployment gates

Live automation is not enabled merely because code is merged.

Required gates:

1. schema migration applied successfully;
2. RLS/security advisor review has no unresolved routing-table exposure;
3. practice-mode scenario suite passes;
4. live provider rows are verified and explicitly enabled;
5. outbound provider delivery sender/channel is verified;
6. homeowner notification sender/channel is verified;
7. commercial outreach footer and business identity are valid where applicable;
8. live routing feature flag is explicitly enabled;
9. first live requests are observed with manual monitoring until acceptance, notification, and outcome evidence are confirmed.

## Initial Washington County pilot

The first live provider registry may be seeded from the existing verified Priority-A research, but no provider is marked `ACTIVE` or treated as a participating partner solely because it appears in the prospect workbook. Outreach/onboarding establishes actual participation, supported services, service area, capacity, response channel, and consent to receive routed requests.

The routing system should support the currently researched providers without hard-coding their names into application logic.

## Acceptance criteria

This design is implemented when:

- practice mode can execute all ten required scenarios with zero outbound deliveries;
- one canonical lead cannot create duplicate paid routing outcomes;
- only one provider can win an accepted route;
- every route decision is reconstructable from durable events/offers;
- emergency and routine timeout policies are separately configurable;
- providers outside eligibility constraints are never offered a lead;
- exhausted routing produces an honest homeowner status;
- live routing remains disabled until the deployment gates are explicitly satisfied;
- the implementation does not require renaming or replacing the existing Hagerstown Basement Waterproofing microsite.
