# Perception — Current Reality

Evidence-backed production state after the 2026-09-06 production cycle.

## Production baseline

- Current implementation commit exercised: `7b9ceeb9abbed08d1415dcecae08c24df7a5a9ef` (`Build first verified Perception runtime slice`).
- GitHub Actions run #9: **PASS**.
- Runtime tests: **3 passed / 3 total**.
- TypeScript + Vite production build: **PASS**.
- Vercel commit check: **SUCCESS**.
- Dedicated Perception Supabase project: **not available in the connected account**. The only visible Supabase project is an unrelated Vice City Forums project and must not be reused.
- Server-backed Project World/authentication: **not deployed**.

## Component classification

| Component | Status | Evidence / boundary |
| --- | --- | --- |
| Repository / mainline | WORKING BUT INCOMPLETE | `main` contains the model, runtime contracts, persistence schema, first vertical flow, tests, and docs. |
| CI / production build | WORKING BUT INCOMPLETE | Run #9 passes unit/runtime tests and production build; browser E2E is not yet present. |
| Frontend | WORKING BUT INCOMPLETE | React/Vite UI captures an objective, exposes beliefs, shows canonical Route to Reality, and surfaces verified first-action progress. |
| Mobile experience | PARTIAL | Responsive CSS exists; no real-device/browser E2E evidence yet. |
| Objective Intake | WORKING BUT INCOMPLETE | Text intake works. Voice/image/file/link intake is not implemented. |
| Meaning Resolver | PARTIAL | Observed/inferred/confirmed/unknown/rejected/stale states and direct-goal handling work; provider-backed structured resolution and contradiction handling are not implemented. |
| Project Graph / World Model | PARTIAL | Core models, runtime state, events, schema, and local Project World state exist; no durable authenticated server graph is live. |
| Reality Mapper | PARTIAL | Readiness/evidence gating and a smallest-viable first-action map work; general gap decomposition is not implemented. |
| Route Planner | WORKING BUT INCOMPLETE | A versioned deterministic three-node first-action route works; dynamic optimization/replanning is not implemented. |
| Capability Router | PARTIAL | Route nodes carry bounded capabilities (`reason`, `generate`, `verify`); no provider/tool adapter router is connected. |
| Execution Runtime | WORKING BUT INCOMPLETE | P0/P1 route nodes exercise the real state machine through verification; retries, idempotency, distributed execution, and external workers are not implemented. |
| Permission System | PARTIAL | P0/P1 defaults and P2/P3 grant checks exist and are tested; grant UX and durable authenticated grants are not live. |
| Verification Engine | WORKING BUT INCOMPLETE | Deterministic artifact verification is exercised; source/UI/external/provider verification adapters are not implemented. |
| Adaptation Engine | MISSING | Staleness review exists, but route-change proposals/replanning from failed verification or world changes are not implemented. |
| Realization | PARTIAL | Objective/runtime statuses exist. The first cycle correctly remains `running`; general success-criteria realization is not implemented. |
| Learning | MISSING | No verified-result learning loop is implemented. |
| Project World | WORKING BUT INCOMPLETE | Versioned localStorage persists models and verified runtime progress on one device. Server-backed/cross-device Project World is blocked on a dedicated backend. |
| Continuous Perception | PLACEHOLDER | World-signal types, schema, and scoring helpers exist; no watcher/ingestion runtime is active. |
| Database schema | WORKING BUT INCOMPLETE | Migrations define projects, beliefs, events, objectives, routes, permissions, artifacts, verification, and world signals with RLS. They are not applied to a dedicated Perception project. |
| Authentication | MISSING | No Perception auth client/session UX is connected. |
| APIs | MISSING | No application API/runtime service is connected. |
| External integrations | MISSING | No real capability providers are routed through Perception yet. |
| Observability | PARTIAL | GitHub Actions build/test evidence is available; application/runtime tracing and error telemetry are absent. |
| Analytics | MISSING | No product/runtime analytics implementation exists. |
| Documentation | WORKING BUT INCOMPLETE | Runtime architecture, model, persistence/routing, and this current-reality record exist. |
| Production deployment | WORKING BUT INCOMPLETE | Vercel commit check is successful; direct live endpoint/browser verification is still required. |

## First vertically complete slice

The current implementation now proves, for explicit routeable text objectives:

`I have an idea…` → **UNDERSTOOD** → **ROUTED** → **ACTION STARTED** → **VERIFIED PROGRESS** → **LOCAL PROJECT WORLD UPDATE**

The proof is deliberately bounded:

1. Direct user goal evidence is represented as observed, not inferred.
2. Ambiguous input remains unresolved and cannot silently route.
3. An `ObjectiveSpec` is compiled with source evidence.
4. A versioned three-node route is created: resolve objective → start first action → verify progress.
5. Only P0/P1 work is automatically exercised.
6. The first action generates a reversible execution brief.
7. Deterministic completion checks verify the brief.
8. Runtime events and the verified Project World update are persisted locally.
9. The broader objective remains `running`; first-action success is not mislabeled as full realization.

## Verified test contract

The automated suite proves:

- an explicit goal becomes trusted route input;
- the full first-action cycle completes all three route nodes and passes verification;
- verified progress is recorded in Project World state;
- ambiguous `deer` input remains unroutable;
- P1 is allowed by default while P2 is denied without a grant.

## Ranked production queue

1. **Authenticated durable Project World** — create/connect a dedicated Perception Supabase project, apply migrations, add auth, synchronize models/objectives/routes/events/verifications with local-resilience fallback.
2. **Live deployment/browser verification** — resolve Vercel project visibility, verify the production URL and the full flow in a real browser/mobile viewport.
3. **Provider-backed Meaning Resolver** — structured perception behind schemas with provenance, confidence, contradiction detection, and deterministic fallback.
4. **General Reality Mapper + Route Planner** — transform trusted project state into dynamic gap/dependency graphs and versioned routes rather than a fixed proof route.
5. **One real capability adapter end-to-end** — route a bounded P0/P1 provider/tool action through execution and independent verification.
6. **Durable permission grants + approval UX** — scope by project/capability/target/time; preserve P3 explicit authorization.
7. **Server execution API/orchestrator** — idempotency, retries, event append, bounded workers, and verifier return path.
8. **Browser/mobile E2E suite** — objective intake, correction, route gating, execution result, persistence restoration, and permission denial.
9. **Runtime observability + analytics** — route latency, verification pass/fail, blockers, retries, conversion through Route to Reality.
10. **Adaptation → Continuous Perception → Learning** — only after durable project truth and verification are production-backed.

## Next production gate

The highest-leverage next slice is the authenticated durable Project World. It is currently blocked on owner-approved creation/connection of a **dedicated Perception Supabase project**. Do not apply the Perception migrations to the existing Vice City Forums database.
