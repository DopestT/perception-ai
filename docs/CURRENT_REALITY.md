> **Audit update — 2026-09-26:** The historical baseline below is retained for provenance, but several claims are superseded by current evidence. Production `main` is `fb024c80b365c3f0fd48499e8d642ef53a3c3d1d` (PR #34) and Vercel reports that exact commit `READY` in production. Supabase project `zxmdfmiueapjhktqchts` is `ACTIVE_HEALTHY`. The live `perceive-objective` function had remained stale at v9 after PR #34; it was reconciled from unchanged current `main` and is now ACTIVE at **v10**, with its deployed `index.ts` exactly matching repository source and including Capability Router plus credit-aware model routing. A post-v10 authenticated objective has not yet been observed, so production functional E2E remains **NOT YET VERIFIED**. `github-operator` remains ACTIVE at v9 and enforces exact target-scoped permission lookup, bounded branch writes, independent GitHub comparison, Execution Ledger phases, and Project World update only after verified effect. Live permission state is **1 enabled Operator principal / 0 active permission grants**.
>
> **Action-contract slice — PR #35:** Branch `perception/action-contract-resolver-v1` now adds the missing Capability Router → GitHub action-contract resolver. It resolves repository identity only from bound Project World GitHub sources, refuses ambiguous repositories, refuses to invent an unobserved base branch or exact file payload, generates a deterministic bounded working-branch/idempotency identity, constructs the exact permission target, blocks P3 downgrades, distinguishes `needs_input` from `awaiting_permission`, and records contract resolution into Execution Ledger intent details. GitHub CI run 133 passed **15 test files / 61 tests** plus the TypeScript/Vite production build; the Vercel preview for head `60a1060a6892bc6fdac4ab7df9e9c01f024718ed` is `READY`. This slice is **TESTED / PREVIEW DEPLOYED**, not merged or production-deployed.
>
> **Current execution blocker is explicit, not hidden:** on 2026-09-26 the connected GitHub state was re-observed and appended through `perception_ingest_project_observation_internal`. The active primary source now carries `default_branch: main`, current observed head `fb024c80b365c3f0fd48499e8d642ef53a3c3d1d`, and a 60-minute freshness SLA. The action-contract resolver therefore has fresh repository/base-branch evidence, but a natural-language objective still does not yield an exact file payload. The remaining resolver blocker is the bounded file-change payload; it must be generated or supplied as a P1 artifact from inspected repository context rather than invented. Once that exists, a complete contract should transition to `awaiting_permission` while the live grant count remains zero.
>
>
> **Continuous Mind provenance drift:** Supabase currently has `continuous-mind` ACTIVE at v8, but no matching `supabase/functions/continuous-mind` source path is discoverable on current `main`. The live function performs approved-source study/observation work and uses a scheduler credential, but until source provenance is reconciled it should not be treated as part of the canonical deployable production path.

> **Security reality:** the 2026-09-26 Supabase advisor is not clean. The shared project reports current warnings/info including SECURITY DEFINER exposure and RLS-enabled tables without policies; one Perception-specific informational finding is `perception_operator_principals` with RLS enabled and no policy, while its migration also revokes table access from public/anon/authenticated. Review Perception findings individually before changing privileges because this Supabase project is shared with other applications.

> **Audit update — 2026-09-23:** This original 2026-09-06/07 baseline is retained as historical evidence. Since then, main has added token-efficiency controls, a substantial FORECAST subsystem, a microsite engine/operator, Vercel Analytics, and additional production-oriented schema. The latest main commit has a successful Vercel commit status, but real-user browser/mobile E2E remains unverified from this environment. Runtime v0.2 work is now restoring architectural focus around explicit Epistemic and Execution Ledgers. A product-taxonomy drift is also present: the frontend currently exposes FORECAST as a fourth top-level mode although the intended front door is DISCOVER / PERCEIVE / SEARCH; specialized forecast behavior should be routed beneath those modes rather than silently expanding the primary taxonomy.

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
- Active Edge Function: `perceive-objective`, version 1.
- Supabase security advisor after hardening: **0 findings**.
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
| Capability Router | PARTIAL | `reason`, `generate`, and `verify` are routed with capability/permission metadata. General adapter selection is not live. |
| Portable Workers | PARTIAL | `first_action_brief_worker` is a real persisted bounded worker run. External/provider workers are not yet connected. |
| Execution Runtime | WORKING BUT INCOMPLETE | Worker start → artifact → verification → evidence-backed Project World update works. Retries, leases, idempotency, distributed execution, and failure recovery remain. |
| Permission Gate | PARTIAL | P0/P1 are bounded in the first slice; P2/P3 schema/contracts exist. Durable approval UX and consequential-action enforcement across real adapters remain. |
| Verification Engine | WORKING BUT INCOMPLETE | Deterministic first-artifact verification is persisted and gates truth updates. External/source/UI verification adapters remain. |
| Adaptation | MISSING | No automatic route-change proposal/replan after failure or changing reality. |
| Realization | PARTIAL | Objective remains correctly `running` after first verified progress. General success-criteria realization is not implemented. |
| Learning | MISSING | No verified-result learning loop yet. |
| Continuous Perception | PLACEHOLDER | World-signal schema/scoring exists, but watcher/ingestion runtime is not active. |
| Database / RLS | WORKING BUT INCOMPLETE | Canonical schema is applied, owner reads are RLS-protected, direct client truth mutation is revoked, security advisor is clean. More production load/retention testing remains. |
| Authentication | WORKING BUT INCOMPLETE | Supabase session restoration and email magic-link UI are implemented. A real production user session has not yet been browser-verified. |
| APIs | WORKING BUT INCOMPLETE | `perceive-objective` Edge Function is ACTIVE; Project World read RPC is RLS-scoped. General runtime APIs remain. |
| External integrations | MISSING | No real external capability provider is yet routed through the production runtime. |
| Observability | PARTIAL | DB audit events, GitHub CI, Supabase advisors, and worker/verification persistence exist. Runtime traces/alerts/metrics are incomplete. |
| Analytics | MISSING | No product funnel or runtime analytics pipeline yet. |
| Production deployment | WORKING BUT INCOMPLETE | GitHub/Vercel integration exists. Direct connector visibility is restricted; production browser + mobile verification is the immediate gate. |

## Immediate ranked production queue

1. **Real-user browser E2E** — authenticate, submit an objective, observe all seven stages, reload/return, and prove Project World restoration from canonical Supabase.
2. **Provider-backed Meaning Resolver** — convert natural-language intent into structured objective semantics with provenance, confidence, explicit unknowns, and contradiction detection.
3. **One real capability adapter end-to-end** — route a useful external P0/P1 action through portable worker → evidence → independent verification → Project World.
4. **General Reality Mapper + dynamic Route Planner** — replace the fixed proof route with dependency-aware, versioned routes generated from trusted Project World state.
5. **Durable permission grants + approval UX** — enforce P2/P3 scope by project, capability, target, duration, and explicit authorization.
6. **Runtime reliability** — idempotency, retries, worker leases/timeouts, resumability, duplicate suppression, and failure/adaptation paths.
7. **Browser/mobile automated E2E** — auth, objective intake, route creation, execution, verification, persistence restoration, and permission denial.
8. **Runtime observability + analytics** — stage latency, worker outcomes, verification pass/fail, blockers, retries, route revisions, and conversion to realization.
9. **Adaptation → Continuous Perception → Learning** — build only on verified durable truth and versioned routes.

## Current production gate

The backend target is no longer blocked: the canonical Supabase vertical slice is live and verified.

The immediate gate is now **real-user production browser verification**. Definition of done for this gate is:

1. A real authenticated user enters an objective.
2. The production UI calls `perceive-objective`.
3. Supabase persists the objective, Project World, route, worker run, artifact, verification, and audit events.
4. The UI shows all seven stages as complete only after verification.
5. The user reloads or returns later.
6. The same verified Project World is restored from Supabase rather than localStorage.
