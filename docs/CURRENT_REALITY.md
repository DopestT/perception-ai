> **Audit update — 2026-09-27:** Runtime v0.4 Execution + Adaptation is merged and live. PR #48 passed Perception CI, bounded local-worker tests, the isolated database truth/security gate, and Vercel preview, then merged to `main` at `5bd3618610bc451e9639b1e1ecca1fff6f95a8eb`. Production Vercel is READY on that commit and `perceive-objective` is ACTIVE at version **16**. Eligible ready P1 `generate` nodes are now automatically materialized by `local_generate_worker_v1` (capped at four per objective invocation), persisted as artifacts, mechanically verified, recorded through the Execution Ledger, and allowed to advance Project World only through the service-only verified-local-effect bridge in migration 030. Companion verification nodes are completed from the same verification evidence. After any local execution attempt, Perception performs one bounded Project World re-map/re-plan pass; it does not recursively execute the newly adapted route in the same request. P2/P3 actions remain behind the existing explicit permission gate. The next runtime gap is **reliable continuation/resume**: leases/idempotency for local nodes, explicit retry/failure policy, and a resume mechanism that can continue an existing Project World instead of requiring a new objective submission.

# Perception — Current Reality

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
- Active execution Edge Functions: `perceive-objective` version **16** and `github-operator` version **11**.
- Historical 2026-09-07 security-advisor state was **0 findings**. Current 2026-09-26 advisor output is **not clean**; review the current warnings before treating that historical line as present reality.
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
| Frontend | WORKING BUT INCOMPLETE | React UI is now Supabase-backed, session-aware, submits through the Edge Function, and reloads durable Project World. Live-browser verification remains. |
| Mobile experience | PARTIAL | Responsive UI exists; no real-device production E2E evidence yet. |
| Objective Intake | WORKING BUT INCOMPLETE | Authenticated text objective path is implemented. Voice/image/file/link intake remains unimplemented. |
| Meaning Resolver | PARTIAL | Direct user intent is preserved as observed evidence. General provider-backed semantic resolution, contradiction handling, and structured uncertainty remain incomplete. |
| Project World | WORKING BUT INCOMPLETE | Durable authenticated projects, beliefs, objectives, events, routes, workers, artifacts, and verification are live in canonical Supabase. Real-user return-later browser proof is still required. |
| Reality Mapper | WORKING BUT INCOMPLETE | Runtime v0.3 maps unresolved unknowns, requested deliverables, verified evidence, and existing blockers after the first verified Project World state. Richer semantic dependency inference, contradiction-driven remapping, and cross-source freshness scoring remain. |
| Route Planner | WORKING BUT INCOMPLETE | Runtime v0.3 derives and persists a dependency-aware continuation route from the mapped Project World, omits already-evidenced deliverables, preserves blocked capabilities, and supersedes the completed first route without deleting history. Automatic replanning after later node success/failure is not yet wired. |
| Capability Router | WORKING BUT INCOMPLETE | `reason`, `generate`, and `verify` route locally; bounded P2 `code` routes select `github-operator`, while P3 production deployment remains blocked. Code routes now emit a concrete action-contract shell rather than stopping at adapter selection. |
| Portable Workers | WORKING BUT INCOMPLETE | `first_action_brief_worker`, `local_generate_worker_v1`, and `github_code_plan_materializer_v1` are real persisted bounded workers. Local generation is P1-only and cannot claim external effects; GitHub planning remains P1/read-only. More provider workers remain. |
| Execution Runtime | WORKING BUT INCOMPLETE | Ready bounded P1 generate nodes now auto-execute through a persisted local worker, artifact, verification, verified-ledger gate, and Project World update. GitHub retains its read-only P1 code-plan stage plus bounded P2 execution. Local execution is capped per invocation; leases, resumability, duplicate suppression, and broader failure recovery remain. |
| Permission Gate | WORKING BUT INCOMPLETE | GitHub P2 execution requires an active scoped grant matching user, project, `code`, and exact repository/base target. Durable approval UX now restores pending reviews from the Execution Ledger, distinguishes NOT NOW from DENY, records denials append-only, and keeps temporary grants explicit. General P2 adapters and P3 execution remain. |
| Verification Engine | WORKING BUT INCOMPLETE | First-action and dynamic local-artifact verification are persisted and gate truth updates. The local truth bridge requires both a passing verification and a matching verified Execution Ledger phase. External/source/UI verification adapters remain. |
| Adaptation | WORKING BUT INCOMPLETE | After local execution success or failure, Runtime v0.4 refreshes Project World evidence and performs one bounded re-map/re-plan pass, preserving route history. Automatic resume across requests and event-driven replanning for contradiction, staleness, or changed external reality remain. |
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
