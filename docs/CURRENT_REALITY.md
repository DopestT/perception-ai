> **Audit update — 2026-09-28:** Runtime v0.5 Reliable Continuation is merged and live. PR #50 passed Perception CI, the isolated Postgres truth/security gate (including duplicate-claim suppression and bounded retry assertions), and Vercel preview, then merged to `main` at `8cc47cb21551fb43193804bc61b1f0997ef63d1c`. Production Vercel is READY on that commit at `www.perceptionai.io` / `perceptionai.io`; migration `runtime_v05_reliable_continuation` is applied in canonical Supabase and `perceive-objective` is ACTIVE at version **17**. Existing objectives can now be explicitly resumed without creating a duplicate objective, the current route is reused first, eligible P0/P1 local generation nodes are atomically claimed with logical idempotency and expiring leases, concurrent duplicate claims become safe no-ops, failed/expired attempts enter an explicit bounded retry policy, and verified local effects require the active lease before Project World can advance. The production UI exposes **CONTINUE ROUTE** as an explicit user action rather than silently executing work on login. The next runtime proof gap is authenticated real-user resume/retry E2E across a return-later session; broader event-driven continuation, external-worker leases, and richer recovery policies remain.

# Perception — Current Reality

## Sovereign storage status

The governing storage rule is now explicit: Legacy Works Ventures owns Perception's canonical state. The production runtime restores Project World from the Perception database, not provider memory or browser-local workspace state. Model calls are bounded processor calls and OpenAI requests opt out of provider application-state storage with `store: false`.

A machine-readable storage-authority record, sovereign export ledger, manifest/checksum functions, provider-boundary helper, and CI sovereignty gate are part of the current build. Provider conversations, assistants, threads, vector stores, and previous-response chains are prohibited as canonical dependencies.


Evidence-backed production state after the canonical Supabase cutover on 2026-09-06/07.

## Canonical backend authority

Perception’s active production-development data plane is:

`https://zxmdfmiueapjhktqchts.supabase.co`

Do not create or substitute another Supabase project without explicit authorization.

The older Perception backend references are superseded. The current repository and runtime are being built against this project.

## Verified production baseline

- Repository: `DopestT/perception-ai`, default branch `main`.
- Canonical Supabase project: **ACTIVE_HEALTHY**.
- Applied backend migrations:
  - `perception_memory`
  - `perception_runtime`
  - `perception_verified_vertical_slice`
  - `perception_runtime_api_hardening`
  - `perception_worker_artifact_index`
  - `runtime_v05_reliable_continuation`
- Active execution Edge Functions: `perceive-objective` version **17** and `github-operator` version **11**.
- Historical 2026-09-07 security-advisor state was **0 findings**. Current 2026-09-28 advisor output is **not clean** because of older unrelated tables/functions; none of the three new Runtime v0.5 internal RPCs are flagged as publicly/authenticated executable.
- Performance advisor: no actionable warning; only an expected unused-index informational item on the new empty production dataset.
- Backend vertical self-test: **PASS**.
- Temporary test user and all cascaded test data were removed after verification.
- PR #3 (`Connect Perception to canonical Supabase runtime`): tests **PASS**, production build **PASS**, merged to `main`.
- GitHub reports a Vercel integration for `perception-ai`; direct Vercel connector enumeration remains unavailable, so live browser verification must be established through deployment status / public endpoint evidence.

## Invariant now enforced

> Workers produce evidence. Perception owns truth. Actions do not update truth; verified effects update truth.

Authenticated browser clients can read their own Project World through RLS. They cannot directly insert, update, or delete authoritative Perception state.

The first mutation path is behind the authenticated `perceive-objective` Edge Function. The function validates the user session, invokes the internal runtime with a server-side secret, starts a bounded P1 worker, verifies its artifact, and only after verification advances Project World.

## Backend vertical slice — verified

The canonical Supabase backend has executed and persisted the full target chain:

`I have an idea…`

→ **UNDERSTOOD**
→ **PROJECT WORLD CREATED**
→ **REALITY ROUTE CREATED**
→ **CAPABILITY ROUTED**
→ **ACTION STARTED**
→ **RESULT VERIFIED**
→ **PROJECT WORLD UPDATED**

The self-test produced:

- 1 objective
- 1 Reality Route
- 3 route nodes
- 1 portable worker run
- 1 worker artifact
- 1 verification run
- 8 append-style model/audit events
- verification = `passed`
- worker status = `succeeded`
- Project World current reality = `Verified first-action brief created; broader objective remains active.`

The test deliberately did **not** mark the broader objective realized.

## Component classification

| Component | Status | Current evidence / boundary |
| --- | --- | --- |
| Repository / mainline | WORKING BUT INCOMPLETE | Runtime contracts, durable schema, Edge Function source, frontend integration, tests, and docs are on `main`. |
| CI / production build | WORKING BUT INCOMPLETE | PR #3 passed tests and TypeScript/Vite production build. Browser E2E is not yet automated. |
| Frontend | WORKING BUT INCOMPLETE | React UI is Supabase-backed, session-aware, submits through the Edge Function, reloads durable Project World, and exposes explicit `CONTINUE ROUTE` for an existing objective. Authenticated real-user resume E2E remains. |
| Mobile experience | PARTIAL | Responsive UI exists; no real-device production E2E evidence yet. |
| Objective Intake | WORKING BUT INCOMPLETE | Authenticated text objective path is implemented. Voice/image/file/link intake remains unimplemented. |
| Meaning Resolver | PARTIAL | Direct user intent is preserved as observed evidence. General provider-backed semantic resolution, contradiction handling, and structured uncertainty remain incomplete. |
| Project World | WORKING BUT INCOMPLETE | Durable authenticated projects, beliefs, objectives, events, routes, workers, artifacts, and verification are live in canonical Supabase. Runtime v0.5 can resume the latest owned objective/project without creating a replacement objective; real-user return-later browser proof is still required. |
| Reality Mapper | WORKING BUT INCOMPLETE | Runtime v0.3 maps unresolved unknowns, requested deliverables, verified evidence, and existing blockers after the first verified Project World state. Richer semantic dependency inference, contradiction-driven remapping, and cross-source freshness scoring remain. |
| Route Planner | WORKING BUT INCOMPLETE | Runtime v0.3 derives and persists dependency-aware continuation routes; v0.4 performs one bounded re-map/re-plan after local execution; v0.5 resumes by reusing the current active route first instead of superseding it preemptively. Event-driven replanning for external changes remains. |
| Capability Router | WORKING BUT INCOMPLETE | `reason`, `generate`, and `verify` route locally; bounded P2 `code` routes select `github-operator`, while P3 production deployment remains blocked. Code routes now emit a concrete action-contract shell rather than stopping at adapter selection. |
| Portable Workers | WORKING BUT INCOMPLETE | `first_action_brief_worker`, `local_generate_worker_v1`, and `github_code_plan_materializer_v1` are real persisted bounded workers. Runtime v0.5 gives local generation logical idempotency, lease ownership, and bounded attempts; GitHub planning remains P1/read-only and does not yet use the lease contract. More provider workers remain. |
| Execution Runtime | WORKING BUT INCOMPLETE | Ready bounded P0/P1 generate nodes execute through persisted workers, artifacts, verification, the verified-ledger gate, and Project World updates. Runtime v0.5 adds database-authoritative claims, expiring leases, logical duplicate suppression, explicit retry timing, bounded attempts, and cross-request resume. External-worker leasing, richer recovery classes, and scheduled/event-driven continuation remain. |
| Permission Gate | WORKING BUT INCOMPLETE | GitHub P2 execution requires an active scoped grant matching user, project, `code`, and exact repository/base target. Durable approval UX now restores pending reviews from the Execution Ledger, distinguishes NOT NOW from DENY, records denials append-only, and keeps temporary grants explicit. General P2 adapters and P3 execution remain. |
| Verification Engine | WORKING BUT INCOMPLETE | First-action and dynamic local-artifact verification are persisted and gate truth updates. The local truth bridge requires both a passing verification and a matching verified Execution Ledger phase. External/source/UI verification adapters remain. |
| Adaptation | WORKING BUT INCOMPLETE | After local execution success or failure, Runtime v0.4 refreshes Project World evidence and performs one bounded re-map/re-plan pass, preserving route history. Runtime v0.5 adds explicit cross-request resume of the existing Project World/route. Automatic event-driven continuation for contradiction, staleness, or changed external reality remains. |
| Realization | PARTIAL | Objective remains correctly `running` after first verified progress. General success-criteria realization is not implemented. |
| Learning | MISSING | No verified-result learning loop yet. |
| Continuous Perception | PLACEHOLDER | World-signal schema/scoring exists, but watcher/ingestion runtime is not active. |
| Database / RLS | WORKING BUT INCOMPLETE | Canonical schema is applied, owner reads are RLS-protected, direct client truth mutation is revoked, security advisor is clean. More production load/retention testing remains. |
| Authentication | WORKING BUT INCOMPLETE | Supabase session restoration and email magic-link UI are implemented. A real production user session has not yet been browser-verified. |
| APIs | WORKING BUT INCOMPLETE | `perceive-objective` v16 and `github-operator` v11 are ACTIVE. Objective responses include reality mapping, route plans, local execution/adaptation evidence, and action contracts; both local and GitHub paths apply only verified effects to Project World. |
| External integrations | WORKING BUT INCOMPLETE | GitHub is now connected across read-only P1 planning and scoped P2 execution: Project World resolves the bound repository, the P1 materializer produces verified file contents/tests, the action contract carries that exact scope, and the operator can execute and independently verify bounded branch changes. Real-user end-to-end proof and broader providers remain. |
| Observability | PARTIAL | DB audit events, GitHub CI, Supabase advisors, and worker/verification persistence exist. Runtime traces/alerts/metrics are incomplete. |
| Analytics | MISSING | No product funnel or runtime analytics pipeline yet. |
| Production deployment | WORKING BUT INCOMPLETE | GitHub/Vercel integration exists. Direct connector visibility is restricted; production browser + mobile verification is the immediate gate. |

## Immediate ranked production queue

1. **Real-user contract-path Operator proof** — from the production UI, submit the bounded proof objective and prove P1 repository inspection → verified code-plan artifact → exact action contract → temporary scoped grant → dry run → GitHub execution → independent observation → verification → Project World update → grant revocation.
2. **Durable approval UX** — present exact repository target, base/working branch, planned files, proposed changes, tests, rollback, permission level, and duration before P2/P3 authorization; preserve explicit denial, expiry, and revocation.
3. **General Reality Mapper + dynamic Route Planner** — replace fixed proof-oriented continuation behavior with dependency-aware, versioned routes generated from trusted Project World state.
4. **Runtime continuation + reliability** — resume an existing Project World, add worker leases/timeouts/idempotency, duplicate suppression, explicit retry policy, dead-letter/failure recovery, and safe continuation across requests.
5. **Browser/mobile automated E2E** — auth, objective intake, code-plan materialization, permission denial/approval, execution, verification, persistence restoration, and return-later behavior.
6. **Security hardening pass** — resolve current Supabase advisor findings, especially externally executable SECURITY DEFINER functions and leaked-password protection.
7. **More capability adapters** — extend the same contract/permission/verification pattern to research, retrieve, edit, communicate, and schedule providers without letting workers own shared truth.
8. **Runtime observability + analytics** — stage latency, materializer confidence/scope, contract state, approvals, worker outcomes, verification pass/fail, blockers, retries, route revisions, and realization.
9. **Continuous Perception → Learning** — trigger future remaps from verified world signals, contradictions, and staleness; learn only from verified durable outcomes and explicit corrections.

## Current production gate

The bounded GitHub path now includes both **P1 planning** and **P2 execution**: repository inspection, code-plan materialization, action-contract creation, scoped permission enforcement, branch-only mutation, independent observation, verification, and Project World effect application are implemented.

The immediate engineering gate is the **real-user production proof of the full contract path**, followed by durable approval UX. Definition of done for the user-visible proof is:

1. A real authenticated user enters an objective.
2. The production UI calls `perceive-objective`.
3. Supabase persists the objective, Project World, route, worker run, artifact, verification, and audit events.
4. The UI shows all seven stages as complete only after verification.
5. The user reloads or returns later.
6. The same verified Project World is restored from Supabase rather than localStorage.

## Runtime v0.8 — Anticipatory Retrieval

Perception now prepares owner-scoped context while an authenticated user types. The Intent Shadow path is debounced and cancellable, persists no provisional keystrokes, searches only the user's Project World and fresh Scenario Forge memory, and hands only short-lived scenario identifiers to the objective runtime. Final submitted text remains authoritative, and every reused scenario is revalidated for ownership, freshness, expiry, confidence, and `must_revalidate` before it can influence routing.

Production database migration 034 and `perceive-objective` Edge Function v19 are live. GitHub CI and the authenticated-role database gate passed for PR #57.

