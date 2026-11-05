# Perception AI Workforce v1 — Phase 0 gap audit
**Date:** 2026-11-05 UTC  
**Scope:** read-only repository and canonical Supabase inventory; P1 documentation only  
**Related:** [#92](https://github.com/DopestT/perception-ai/issues/92), [#80](https://github.com/DopestT/perception-ai/issues/80), [#85](https://github.com/DopestT/perception-ai/issues/85)  
**Repository baseline:** `DopestT/perception-ai`, `main` at `1a5ba1e2a03423b14c437a9d26640e3d67ea8087`  
**Canonical project:** `zxmdfmiueapjhktqchts` (`perception-ai`); do not create a substitute backend.

## Decision
**Do not stand up parallel worker/ledger databases or start multiple coding agents yet.** A substantial existing runtime already records work, claims local nodes, preserves artifacts, verifies results, and gates truth. Extend it incrementally after proving one isolated test task can complete end to end without external effects. Keep #80 open until a genuine authenticated production user proof occurs.

## Evidence inventory (observed in this audit)
| Layer | Existing evidence | Classification | Still unproven / missing |
| --- | --- | --- | --- |
| Repo / UI | Main branch exists; `src/App.tsx` shows DISCOVER / PERCEIVE / SEARCH and Supabase-backed objective flows; `src/PlasmaPortal.tsx` exists | Implemented in source | Guest search quality and mobile/browser E2E not certified here |
| Canonical storage | Supabase connection `Perception AI` resolves project `zxmdfmiueapjhktqchts` as `ACTIVE_HEALTHY`; 89 migrations reported applied | Live backend accessible | Migration parity with 62 repository migration files needs a name-by-name reconciliation; counts alone do not prove drift |
| Local work execution | `perception_route_nodes`, `perception_worker_runs`, `perception_artifacts`, `perception_verification_runs` exist; migration `031_runtime_v05_reliable_continuation.sql` implements bounded P0/P1 local claims, leases, idempotency, retries | Implemented in source and schema | Full workforce task contract, heartbeat, multi-worker isolation, resource caps, review state, independent sandbox task proof |
| Durable execution truth | `perception_execution_ledger` and `perception_epistemic_ledger` exist; operator and verification code restrict truth updates to observed/verified effects | Implemented in source and schema | Worker task lifecycle review gate distinct from self-report; production end-to-end proof #80 |
| Permissions | `perception_permission_grants`, operator principals, and durable approval support exist; `src/lib/perception-operator.ts` models P0–P3 | Implemented | No permanent default permission. All **6 grants were inactive** in the 2026-11-05 read-only query |
| Usage / costs | `perception_token_policies`, `perception_token_decisions`, `perception_token_usage`, provider model routing code | Partial | Token-usage table has **0 rows**; no validated worker-level dollar ceiling, hard stop or provider allowlist for workforce v1 |
| Learning | `perception_learning_ledger` and study-run tables exist; verified learning data present | Partial/live records exist | Avoid treating documentation that says “Learning missing” as current; objective-level realized learning still needs independent proof |
| Search | `anticipate-objective` source uses opt-in external Tavily pre-search, bounded to a few results | Partial | Not a complete multi-provider, user-facing, citation-grounded search engine; no tested failover/relevance benchmark |
| Deployment | Active `perceive-objective` v24, `perception-runtime` v6, `github-operator` v11, `continuous-mind` v9, `anticipate-objective` v1 were listed | Live functions observed | Exact deployed source ↔ current Git revision parity, live frontend session and restore proof remain unverified by this read-only audit |

Read-only aggregate check at audit: 38 worker runs marked `succeeded`, 38 verification runs marked `passed`, and 243 execution-ledger entries (34 phase=`verified`). **These are table totals, not proof of 38 independent completed customer outcomes or a successful workforce lifecycle.**

## Reuse plan — no duplicate authority
| Workforce-v1 concept | Canonical starting point | Gap before enabling |
| --- | --- | --- |
| `work_items` | Existing `perception_route_nodes` + dependencies / objective | Strict task spec: single owner, owned/forbidden files, dependency gate, deadline and budget |
| `work_attempts` | Existing `perception_worker_runs` | Explicit lease/heartbeat and reviewer lifecycle; extend carefully, preserve v0.5 compatibility |
| `artifacts` | `perception_artifacts` | Provenance checksums and sandbox/worktree evidence |
| `validation_runs` | `perception_verification_runs` + append-only `perception_execution_ledger` | Reviewer must be distinct from worker self-report; fail closed |
| `approval_requests` | Existing approval flow + `perception_permission_grants` + `perception_execution_ledger` | Specific per-task pending review and expiry; never mint grants automatically |
| `usage_records` | `perception_token_usage` / token policies / decisions | Enforce max dollar spend before provider call; reconcile actual provider usage |

**State compatibility:** `queued → leased → running → review_pending → verified` is a desired *workforce* lifecycle, not a replacement for current route-node or worker-run enums. Introduce a typed application-level adapter first; add a migration only after the existing state transitions and RLS have tests.

## Security drift gate
Supabase security advisor (2026-11-05) flagged 8 anonymous-callable SECURITY DEFINER functions (the `pseo_*` family) and 15 authenticated-callable SECURITY DEFINER functions spanning product modules. These are **warnings, not confirmed exploits**. Require a separate scoped authorization/privilege review, especially because the canonical database hosts other Legacy Works Ventures projects. Do **not** revoke permissions globally or deploy speculative security fixes in this audit. See [Supabase remediation guide: anon SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Recommended smallest next code PR
**Title:** `test: prove one sandbox-only workforce task through existing runtime`

1. Add a pure, typed workforce task-contract validator on a feature branch (P0/P1 only): `task_id`, project/objective/route-node ownership, goal, input evidence, approved allowed paths, forbidden paths, expected artifact, tests, dependencies, bounded deadline, retry cap (≤2), nonnegative dollar/token budget, and permission class. Fail closed when scope/cost/authority is unresolved.
2. Add failing-first Vitest cases for unowned task, unauthorized target, budget exhaustion, stale lease, duplicate delivery, worker self-approval, unverified artifact, and missing independent verification. Preserve old contracts.
3. Use existing local claim → draft artifact → independent verification → ledger/PW boundary **in a disposable test harness** (not live user data). Show queued/claimed/running/review/verified *as an audit view*, without asserting new DB enums exist.
4. Run `npm test`, `npm run build`, and `npm run test:sovereignty` on the branch; inspect evidence separately from the implementing worker.
5. Demonstrate a failure-path run in which a worker reports success but verifier rejects it and Project World remains unchanged. Log measured budget/attempts.
6. Stop and request explicit authorization before any production migration, credential change, deployment, DNS, publication, billable external model call, or broad agent concurrency.

### Exit gate (no premature DONE)
- One synthetic sandbox-only task has an owned contract, bounded execution, artifact, independent review, append-only observations, and a *verified* completion state.
- One rejected synthetic task leaves canonical truth unchanged.
- Duplicate/retry and budget controls are tested.
- No externally consequential action occurred.
- The proof, tests, observed limitations, and next approval gate are linked in a PR.
- #80 **remains open** until a separate authenticated production proof verifies the true user journey, return-later persistence, and permission lifecycle.

## Drift check for this audit
- **Intent:** Perception is an intent-to-verified-action system, not an uncontrolled agent swarm — **PASS**.
- **Architecture:** existing Project World, ledgers, sovereign storage and verification retained — **PASS**.
- **Product identity:** DISCOVER / PERCEIVE / SEARCH, plasma front door, progressive depth — **UNCHANGED**.
- **Permission boundary:** no automatic P2/P3 grants, no live mutations or merges — **PASS**.
- **Production proof:** not attempted in this audit — **UNVERIFIED**, do not mark #80 done.
- **Cost exposure:** no new workers or model calls — **PASS**.

*Evidence is a 2026-11-05 read-only inventory, not a substitute for a reviewed production acceptance test.*
