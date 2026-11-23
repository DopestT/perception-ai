# PERCEPTION — MAX governed agent-swarm operating script
**Version:** 0.1 · 2026-11-13 UTC  
**Project:** `DopestT/perception-ai` · [Workforce scope #92](https://github.com/DopestT/perception-ai/issues/92)  
**Current state:** **Draft simulation contract**, not a running multi-agent service. No agents have been created in production and no autonomous work is enabled by this file. The executable planning and review rules are in `src/lib/perception-swarm.ts` with tests.

> “We don't replace human imagination. We give it the power to become reality.”

## The team and the exact handoffs

**PERCEPTION supervisor — sole coordinator and truth gate.** Not a parallel owner of records. It receives a user-owned objective with `projectId`, `objectiveId`, current evidence, approved permissions and budget. It converts it into bounded task contracts. It schedules only dependency-ready work, assigns a single owner and a distinct reviewer to each task, tracks IDs, waits on approval, combines independently verified outcomes, and records what remains unresolved. It **must not** create its own authority, spend without permission, claim task success based on its own output, or overwrite the existing Project World.

**Research Worker (`research-worker`, P0 only)**  
Input: precise research questions, allowed trusted sources and task evidence references.  
Does: discover relevant primary sources; capture titles, dates, URLs, caveats; identify missing evidence.  
Output: source inventory + dated claims/provenance, **not** a claim of final truth.  
Stop when: sources are unavailable or access is prohibited; report unknown, do not fabricate.

**Analysis Worker (`analysis-worker`, P0 only)**  
Input: source inventory, user decision and explicit assumptions.  
Does: evaluate quantitative or causal claims, compare alternatives, distinguish measured data from hypotheses.  
Output: transparent calculation/decision memo with uncertainties and testable next questions.  
Stop when: insufficient evidence; no unsupported estimates presented as fact.

**Architecture Worker (`architecture-worker`, P0 only)**  
Input: verified requirements, current repository and canonical runtime contracts.  
Does: compare existing systems with build-vs-integrate options, define minimal dependency graph, scopes, risk and rollback.  
Output: component boundary map and scoped work orders; **not** new infrastructure by default.  
Stop when: an integration needs production credentials, paid services, migrations or broader authority.

**Interface Worker (`interface-worker`, P0/P1 draft only)**  
Input: approved UX requirements, existing design language, named files to own, accessible states.  
Does: implement small isolated branch changes in assigned files, preserving original identity.  
Output: branch commit, screenshot when available, keyboard/iPad tests, broken states and rollback.  
Stop when: files outside its allowed list are required; request a new contract.

**Backend Worker (`backend-worker`, P0/P1 draft only)**  
Input: existing canonical API/RLS/runtime schema and approved task scope.  
Does: add nonproduction code or disposable fixtures for bounded worker runtime, idempotency, evidence and cost guards.  
Output: branch commit with tests and trace, never direct production writes.  
Stop when: a schema/permission/secret/paid-provider change is required.

**QA Reviewer (`qa-reviewer`, independent P0)**  
Input: exact artifact, acceptance tests and reproducer, **not** the builder's success claim alone.  
Does: attempt to break behavior; test keyboard/mobile/reduced-motion, failure paths, retries, regression and observability.  
Output: pass/fail with independent logs or reproduction steps.  
Stop when: objective evidence missing; reject or abstain.

**Security Reviewer (`security-reviewer`, independent P0)**  
Input: proposed diff, allowed paths, sensitive boundaries and permission graph.  
Does: check cross-project isolation, file/secret exposure, injection, RLS assumptions, least privilege and budgets.  
Output: explicit threat findings, risk gate and independent evidence.  
Stop when: elevated rights, production mutation or unknown credentials are needed.

**Truth Verifier (`truth-verifier`, independent P0)**  
Input: user success criterion, artifact, external/direct observation, source refs and status history.  
Does: check what changed in the world, whether that change belongs to **this** objective, and whether all tests passed.  
Output: verified/failed/unknown plus exact evidence and checked time. Only the existing, approved canonical ledger writer may promote truth.  
Stop when: observation cannot independently establish the stated effect.

**PERSEVERANCE — named team collaborator, role not yet mapped.** The project owner explicitly said “Perserversnce is on our team” on 2026-11-13. No prior operative identity, code endpoint, or approved permissions were found in the inspected PERCEPTION sources and Notion notes. Preserve this collaborator in the roster **without pretending it is a functioning agent, equating it with Persistent Brain, assigning background tasks, or creating a duplicate**. Its responsibilities/connection may be mapped to a typed role in a later reviewed change, once available evidence identifies them.

### One example request: “Help me build a useful product”

1. Supervisor captures the task, user goal, ownership, constraints, and objective ID; sets a zero-cost P0/P1 **dry-run** policy and records what would require approval.
2. Research Worker inventories the customer problem and sources.
3. Analysis Worker reviews the evidence while Architecture Worker examines the current stack. Both depend on #2; neither overwrites the other.
4. Interface Worker drafts a working UI in a scoped branch; Backend Worker drafts any contract changes in separate files/branches, only if needed.
5. QA Reviewer runs test cases and documents breakage; Security Reviewer audits cross-project/permission boundaries.
6. Truth Verifier independently checks linked artifacts and real effects. A statement like “the code builds” is **not** evidence that a user can buy, sign in, or finish a task.
7. Supervisor reports **Verified**, **Rejected**, **Blocked** or **Unverified**, with links. Nothing P2/P3 proceeds absent explicit delegated consent. The user may return later to the same canonical objective; a stale UI status is refreshed using the existing backend.

### Common worker instruction (copy into every future agent task)

> You are a bounded PERCEPTION specialist, not the system of record. Work only on the provided `projectId`, `objectiveId`, `taskId`, allowed paths, evidence sources and permission class. Do not infer credentials or user approval. No self-spawning, parallel duplicates or unlimited retries. Respect the task's deadline, attempt, token and cost ceilings. Return exactly: `taskId`, `agentId`, `artifactRef`, `evidenceRefs`, `testsAttempted`, `testsPassed`, `blockers`, `nextSafeAction`, `riskFlags`. If evidence is unavailable, say UNKNOWN; do not mark completed. Never modify canonical project truth directly. If a change requires P2/P3, stop and request authorization.

### Supervisor's dispatch contract

**Inputs:** `SwarmTask[]`, `SwarmPolicy`, current time.  
**Validity:** existing `validateWorkforceTaskContract` must pass, plus exact ownership, known agent role, same project/objective, no ambiguous file scope, no missing dependency, no cycle, no duplicate task ID, distinct independent reviewer and documented rollback.  
**Budget:** aggregate policy ceilings; dry-run uses zero tokens and zero dollars.  
**Concurrency:** maximum **4** implementation tasks and **2** reviewer tasks scheduled per planning wave; simulation does not actually run them.  
**State:** proposed waves are **not** proof of execution. Existing Project World remains the authority; planned lifecycle is queued → leased → running → review_pending → verified OR blocked/failed/paused. Do **not** silently change database enums.  
**Publish gate:** code branch + reviewed PR, no automatic merge or deployment.

### Guardrails, failure tests, and stop conditions

- If another project's ID appears in a task, reject the entire plan.
- If a builder owns a path another builder intends to edit, reject rather than race.
- If the task references missing dependencies or cycles, reject without issuing work.
- If reviewer = owner, reviewer lacks QA/security/truth role, or evidence is missing, do not certify.
- If a worker says “DONE” but no independent observation exists, status stays unverified.
- If total budget is unknown, nonfinite or exceeds policy, reject.
- P2/P3 requests, deletion, credentials, DNS, publishing, live payments, account permissions or production service writes require fresh explicit approval.
- Dry-run has no network/model/agent executor. No background task, recurring bot or user profiling is secretly activated.

## What makes this advanced rather than standard wiring

| Layer | Standard | PERCEPTION target |
|---|---|---|
| Agent assignment | Prompt another bot | Typed owner, approved scope, distinct reviewer |
| Parallelism | Start many bots | Bounded dependency waves with file ownership |
| Recovery | Retry the whole response | Existing canonical lease/idempotent worker ledger (integration not yet proven) |
| Truth | Agent reports success | Independently observed, objective-linked evidence |
| Experience | Session-only | Restore canonical Project World after return |
| Learning | Add prompts | Accepted evidence and opt-in preferences; test held-out improvements |
| Control | Shared key | Explicit P0/P1 drafts; P2/P3 approval; token/dollar hard stops |
| Observability | Chat transcript | Task IDs, attempts, evidence links, cost, drift and reviewer results |

## Build vs. integrate decision

**Reuse now:** PERCEPTION's `perception_route_nodes`, `perception_worker_runs`, `perception_verification_runs`, `perception_execution_ledger`, `perception_epistemic_ledger`, `workforce-task-contract.ts`, and per-project permissions. No duplicate queue/database.

**Evaluate later:** [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) for agent handoffs and traces, [LangGraph](https://docs.langchain.com/oss/javascript/langgraph/overview) for checkpointed graph execution, [Temporal](https://docs.temporal.io/) for durable workflows, and [Google ADK](https://google.github.io/adk-docs/) for reusable agent patterns. These are candidates, not installed dependencies or claimed integrations. Evaluate maintenance, API/data retention, portability, billing and fit with the existing sovereign boundary before adding any dependency.

**Smallest proof:** an isolated, deterministic **P0/P1 zero-provider-cost** task submitted to `planSwarm`, yielding dependency waves and independent review decisions; then separately verify one real worker lease/artifact/independent review/ledger path in a disposable fixture. The second gate has not passed and must not be represented as completed.

## Data KPI contract (definitions, not observed metrics)

| KPI | Formula | Source needed | Guardrail |
|---|---|---|---|
| Verified objective completion | Objectives with objective-linked independent outcome evidence / eligible started objectives | Canonical objective + verification and event IDs | Worker self-reports excluded |
| Time to independently verified outcome | Median elapsed time from accepted task to independently observed completion | Canonical timestamps, same objective ID | Report missing/censored runs |
| Cost per verified result | Total actual provider/workflow cost for cohort / independently verified results | Token usage + provider billing + verified outcomes | Zero outcomes => undefined, not $0 |
| Approval boundary violations | Count of attempts to execute outside granted task scope | Permission and execution ledgers | Target zero, blocked attempts separately reported |

Do not invent baselines, percentages, or “AI growth” from counts of agent definitions. Use the Auditor dashboard to report evidence-backed improvement after test fixtures and real users exist.

## Current release stage

- **Phase 0 implementation:** static planner and reviewer with test fixtures on review branch only.
- **Next:** pass CI tests/build, inspect the diff, prove a disposable full task with canonical runtime, and measure one benchmark.
- **Not enabled:** real multi-agent execution, autonomous research, scheduled dispatch, new providers, self-upgrading agent logic, preference learning or consequential actions.
- **Production approval:** separate and explicit before any merge, deployment or activation. Work across separate products remains isolated.

**Status definitions:** Designed ≠ coded ≠ tested ≠ deployed ≠ user-complete.
