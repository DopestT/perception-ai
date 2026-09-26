> **Audit update — 2026-09-26:** The canonical runtime now includes an evidence-backed GitHub execution bridge. `perceive-objective` is live at version **11** and resolves bounded `code` route nodes into persisted `github.change.v1` action contracts using Project World source bindings. `github-operator` is live at version **10** and enforces exact project/capability/target grants, bounded branches, changed-file scope, independent GitHub observation, drift-safe branch reuse, and idempotent no-op retries. PRs #36, #37, and #38 passed repository tests/builds and Vercel checks and are merged to `main`; current main commit `96916eb` has successful Vercel status. There are **0 active permission grants** at this audit point. The remaining execution gap is no longer routing or bounded GitHub mutation: it is the missing generic **P1 code-plan materializer** that inspects a bound repository and turns `desired_changes` into concrete file content before P2 approval. The real-user contract-path Operator proof remains to be re-run from the production UI after this bridge. Current Supabase security-advisor findings also supersede the older “0 findings” note below; they include pre-existing SECURITY DEFINER exposure warnings, RLS-without-policy informational findings, and leaked-password protection being disabled.

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
- Active execution Edge Functions: `perceive-objective` version **11** and `github-operator` version **10**.
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
| Reality Mapper | PARTIAL | First bounded reality gap is represented. General dependency/gap decomposition is not yet implemented. |
| Route Planner | WORKING BUT INCOMPLETE | Versioned deterministic three-node first route is live. Dynamic route generation, optimization, and replanning are not. |
| Capability Router | WORKING BUT INCOMPLETE | `reason`, `generate`, and `verify` route locally; bounded P2 `code` routes select `github-operator`, while P3 production deployment remains blocked. Code routes now emit a concrete action-contract shell rather than stopping at adapter selection. |
| Portable Workers | PARTIAL | `first_action_brief_worker` is a real persisted bounded worker run. External/provider workers are not yet connected. |
| Execution Runtime | WORKING BUT INCOMPLETE | Worker start → artifact → verification → evidence-backed Project World update works. GitHub execution now uses bounded branches, exact planned-file scope, drift detection, safe branch reuse, and idempotent unchanged-file skips. Generic code-plan materialization, leases, distributed execution, and broader failure recovery remain. |
| Permission Gate | WORKING BUT INCOMPLETE | GitHub P2 execution now requires an active scoped grant matching user, project, `code`, and exact repository/base target; no grant is inferred or auto-created by routing. The proof-only grant remains principal-gated, temporary, and explicitly user-triggered. Generic approval UX and P3 adapters remain. |
| Verification Engine | WORKING BUT INCOMPLETE | Deterministic first-artifact verification is persisted and gates truth updates. External/source/UI verification adapters remain. |
| Adaptation | MISSING | No automatic route-change proposal/replan after failure or changing reality. |
| Realization | PARTIAL | Objective remains correctly `running` after first verified progress. General success-criteria realization is not implemented. |
| Learning | MISSING | No verified-result learning loop yet. |
| Continuous Perception | PLACEHOLDER | World-signal schema/scoring exists, but watcher/ingestion runtime is not active. |
| Database / RLS | WORKING BUT INCOMPLETE | Canonical schema is applied, owner reads are RLS-protected, direct client truth mutation is revoked, security advisor is clean. More production load/retention testing remains. |
| Authentication | WORKING BUT INCOMPLETE | Supabase session restoration and email magic-link UI are implemented. A real production user session has not yet been browser-verified. |
| APIs | WORKING BUT INCOMPLETE | `perceive-objective` v11 and `github-operator` v10 are ACTIVE. The objective response now includes `action_contracts`; GitHub operator execution records authorization/attempt/observation/verification in the Execution Ledger and applies only verified effects to Project World. |
| External integrations | PARTIAL | GitHub is the first real external execution adapter: Project World resolves the bound repository, the router produces an action contract, and the operator can execute and verify bounded branch changes. The generic P1 materializer that produces file content from arbitrary desired changes is still missing. |
| Observability | PARTIAL | DB audit events, GitHub CI, Supabase advisors, and worker/verification persistence exist. Runtime traces/alerts/metrics are incomplete. |
| Analytics | MISSING | No product funnel or runtime analytics pipeline yet. |
| Production deployment | WORKING BUT INCOMPLETE | GitHub/Vercel integration exists. Direct connector visibility is restricted; production browser + mobile verification is the immediate gate. |

## Immediate ranked production queue

1. **Generic P1 code-plan materializer** — inspect the Project World-bound GitHub repository read-only, identify the smallest relevant file set, and produce concrete proposed file contents/patch evidence without external mutation.
2. **Real-user contract-path Operator proof** — from the production UI, submit the bounded GitHub objective and prove the same action key advances through contract → temporary scoped grant → dry run → execute → GitHub observation → verification → Project World update → grant revocation.
3. **Durable approval UX** — present the exact target, branch, planned files, tests, rollback, and duration before P2/P3 authorization; preserve explicit denial and expiry.
4. **General Reality Mapper + dynamic Route Planner** — replace fixed proof routes with dependency-aware, versioned routes generated from trusted Project World state.
5. **Runtime reliability beyond GitHub** — leases/timeouts, resumability, duplicate suppression, dead-letter/failure recovery, and adaptation across workers.
6. **Browser/mobile automated E2E** — auth, objective intake, contract creation, permission denial/approval, execution, verification, persistence restoration, and return-later behavior.
7. **Security hardening pass** — resolve current Supabase advisor findings, especially externally executable SECURITY DEFINER functions and leaked-password protection.
8. **Runtime observability + analytics** — stage latency, contract state, approvals, worker outcomes, verification pass/fail, blockers, retries, route revisions, and realization.
9. **Adaptation → Continuous Perception → Learning** — build only on verified durable truth and versioned routes.

## Current production gate

The bounded GitHub execution substrate is no longer blocked: routing, contract creation, scoped permission enforcement, branch-only mutation, independent observation, verification, and Project World effect application are implemented.

The immediate engineering gate is the **generic P1 code-plan materializer**, followed by a real-user production proof of the full contract path. Definition of done for the user-visible proof remains:

1. A real authenticated user enters an objective.
2. The production UI calls `perceive-objective`.
3. Supabase persists the objective, Project World, route, worker run, artifact, verification, and audit events.
4. The UI shows all seven stages as complete only after verification.
5. The user reloads or returns later.
6. The same verified Project World is restored from Supabase rather than localStorage.
