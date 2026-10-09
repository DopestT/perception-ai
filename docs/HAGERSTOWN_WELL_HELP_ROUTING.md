# Hagerstown Well Help Routing

## Status

Hagerstown Well Help routing is implemented as a **practice-first** Perception capability. The current public `Hagerstown Basement Waterproofing` microsite remains a separate intake property and is not automatically renamed, repurposed, or bound to this program.

No live contractor or homeowner delivery adapter is installed by this change. `PRACTICE` routes simulate provider offers and homeowner notices; `LIVE_DISABLED` keeps homeowner notices simulated and provider delivery blocked; `LIVE` delivery remains blocked until a later verified adapter change.

## Runtime flow

`intake -> normalize/hash -> deduplicate -> classify -> qualify -> rank -> route -> offer -> pass/expire/fail -> escalate -> accept -> homeowner notice -> contacted -> appointment -> completed/lost -> revenue evidence -> metrics`

Canonical state is stored in Perception-controlled Supabase tables. External providers receive only bounded copies when live delivery is eventually enabled.

## Routing tables

- `perception_microsite_routing_configs`: per-microsite program mode, service-area rules, timeout policy, duplicate window, outbound gate.
- `perception_microsite_providers`: provider eligibility, services, areas, emergency capability, routing destination, priority bias.
- `perception_microsite_lead_routes`: one durable routing episode with a single accepted provider.
- `perception_microsite_lead_offers`: append-oriented offer history and score reasons.
- `perception_microsite_lead_events`: immutable state/notification evidence.
- `perception_microsite_leads`: canonical intake record plus state, service, urgency, hashed duplicate identity, and accepted provider.
- `perception_microsite_revenue`: outcome value evidence linked to lead/provider; practice rows are explicitly tagged and excluded from live metrics.

## Default pilot policy

- Emergency provider window: 300 seconds.
- Routine provider window: 1800 seconds.
- Duplicate review window: 30 minutes.
- Supported services: `NO_WATER`, `WELL_PUMP`, `LOW_PRESSURE`, `PRESSURE_TANK`, `WATER_TREATMENT`, `WELL_DIAGNOSTIC`.
- Unknown or ambiguous service requests enter `MANUAL_REVIEW`.
- Provider eligibility is rechecked immediately before an offer is created.
- A route can have only one accepted provider; competing or late accepts fail closed.

## Provider response security

`microsite-provider-response` intentionally disables Supabase JWT verification because each request is authenticated with an expiring, single-offer HMAC token scoped to `{ offerId, routeId, expiresAt }`.

Required server-side secret:

- `MICROSITE_OFFER_TOKEN_SECRET`

The raw response token is never persisted or logged. Only a SHA-256 token hash is used when a stable idempotency suffix is useful. Acceptance itself is enforced transactionally by `perception_accept_microsite_offer`.

## Lead identity security

Public microsite lead intake requires:

- `MICROSITE_LEAD_FINGERPRINT_SECRET`

Normalized phone/email identity and the bounded submission fingerprint are SHA-256 hashed with that dedicated secret before duplicate comparison. If the secret is absent, intake fails closed instead of storing an unhashed duplicate identifier.

## Practice verification

Run:

```bash
npm test -- src/lib/hagerstown-well-help-practice.test.ts
npm run practice:hwh
```

`npm run practice:hwh` emits a machine-readable JSON report for exactly ten scenarios:

1. emergency lead accepted by first provider;
2. first provider times out, second passes, third accepts;
3. two simultaneous leads route independently;
4. duplicate homeowner submission resolves to one canonical lead;
5. repeated `ACCEPT` is idempotent;
6. competing accepts produce exactly one winner;
7. delivery failure advances the provider queue;
8. all providers unavailable produces `UNROUTABLE` and an honest homeowner notice;
9. disabled/out-of-area providers are never offered;
10. practice mode records zero external deliveries.

CI fails if this practice command exits non-zero.

## Migration order

For this feature, replay the existing microsite foundation first, then:

1. `supabase/migrations/20261009173500_hagerstown_well_help_routing.sql`
2. `supabase/migrations/20261009192400_hagerstown_well_help_outcomes_metrics.sql`

The repository DB gate replays these migrations against PostgreSQL 17 and runs `supabase/tests/hagerstown_well_help_routing_gate.sql`.

## Metrics

`perception_get_microsite_routing_metrics(microsite_id, since)` returns live metrics for:

- qualification rate;
- duplicate rate;
- median time to first offer;
- median time to acceptance;
- provider acceptance rate;
- route exhaustion rate;
- appointment rate;
- completion rate;
- lead-to-revenue rate.

Practice routes/revenue are excluded from those live metrics and appear only in the explicit `practice` diagnostic subsection.

## Live-cutover gates

Merging this implementation does **not** enable live routing. Do not enable live delivery until all of the following are independently verified:

1. routing migrations are applied successfully to the intended Perception project;
2. Supabase security advisor review shows no unresolved routing-table exposure;
3. the ten-scenario practice suite passes in the deployment candidate;
4. participating provider rows are based on explicit onboarding/consent and are individually enabled;
5. service areas, supported services, availability, response destination, and emergency capability are verified for each enabled provider;
6. a provider outbound sender/channel is configured and verified;
7. a homeowner notification sender/channel is configured and verified;
8. required commercial business identity/footer information is approved for the chosen channel;
9. a real live-delivery adapter is implemented and reviewed;
10. the future `MICROSITE_ROUTING_LIVE_ENABLED` runtime gate is explicitly enabled in addition to database live mode/outbound state;
11. the first live leads are manually observed through acceptance, homeowner notice, appointment/outcome, and revenue evidence before unattended operation.

Until those gates are satisfied, keep `MICROSITE_ROUTING_LIVE_ENABLED=false` and routing config in `PRACTICE` or `LIVE_DISABLED`.

## Provider onboarding rule

Research/prospect lists are not participation consent. Do not mark a researched company `ACTIVE` or route homeowner data to it merely because it appears in a prospect workbook. A provider becomes eligible only after onboarding establishes consent, service coverage, routing destination, and current availability.

## Rollback

If a deployment introduces unexpected routing behavior:

1. set the affected routing config to `LIVE_DISABLED` or `PRACTICE` and `outbound_enabled=false`;
2. leave canonical lead/route/offer/event rows intact for diagnosis;
3. do not delete or rewrite evidence to make state appear clean;
4. revert the Edge Function/runtime change while preserving the additive schema;
5. rerun the practice suite and database gate before re-enabling any routing path.
