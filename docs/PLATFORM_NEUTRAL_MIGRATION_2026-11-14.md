# PERCEPTION — Platform-neutral AI migration (review plan)

**Date:** 2026-11-14 UTC  
**Source pin:** `main` at `4121fbbcf51c64b468579943589eb99384682706`  
**Status:** Proposed migration contract in a draft pull request. No provider cutover, database export, permission, billing, deployment, or production change.

## Goal and scope

Allow PERCEPTION to change the AI *processor* without losing its independent product identity, original interface, user-owned canonical memory, source provenance, agents, security boundaries, or verification rules. The default scope is a **model/provider replacement** retaining LWV-controlled canonical Postgres/Supabase, existing authentication, and UI. A full hosting/data relocation is a separately approved second project.

Source reading: [Sovereign storage](./SOVEREIGN_STORAGE.md), [Runtime v0.2](./RUNTIME_ARCHITECTURE_V0_2.md), [User/Goal model](./PERCEPTION_MODEL.md), [Persistence/routing](./PERSISTENCE_AND_ROUTING.md), [Credit-aware model routing](./CREDIT_AWARE_MODEL_ROUTING.md), and the source types `src/lib/perception-runtime.ts`, `src/lib/perception-ledgers.ts`, `src/lib/perception-swarm.ts`, `src/lib/perception-swarm-memory.ts`.

## Boundaries that MUST survive the swap

1. **Canonical owner:** Legacy Works Ventures-controlled Project World and ledgers. Providers are stateless processors and receive least-necessary bounded working copies. Preserve the original provider-boundary storage controls when supported; do not make conversations, hosted assistants or provider-side vector stores required for restore.
2. **Understanding before action:** Goal beliefs are versioned as observed, inferred, confirmed, unknown, rejected, stale or contradicted. Route trusted observed/confirmed evidence; never silently promote inferred user intent.
3. **Truth by independent receipt:** Epistemic Ledger and Execution Ledger remain separate. The execution phases intended → authorized → attempted → observed → verified require independent evidence before Project World advances. Preserve failed, blocked and rollback history.
4. **Single supervisor:** Project-scoped objective/route/version identity owns scheduling. Workers get bounded tasks, minimal context, lease, deadline, file/tool allowlists and finite budgets. Self-reported success is never verification.
5. **Permissions:** P0 observe; P1 draft; P2 reversible execute; P3 consequential execute. The target model cannot mint grants. Check project/capability/target/principal/expiry server-side before every tool effect. No publishing, billing, permission changes or production writes without approved narrow grants.
6. **Resource limits:** Hard spend ceilings, bounded token/context output, retries and concurrency, backoff, idempotency keys and kill switch. Route to local/deterministic fallback when an approved paid provider is unavailable or budget exhausted.
7. **Isolation:** Do not co-mingle private datasets between PERCEPTION, NETIZENS, LMTYAI, VCF, Blue Tsunami, AEGENT and AIrwave. An approved project-scoped bridge is an explicit separate contract.

## Portability surfaces

| Surface | Current source of contract | Target adapter seam |
| --- | --- | --- |
| Model inference | `supabase/functions/_shared/meaning-resolver.ts`, `token-efficiency.ts`, `provider-boundary.ts` | Stateless JSON-schema-constrained model request/response, provider usage and attempt receipt; no canonical writes |
| Memory | `perception_projects`, ledgers, objectives, routes, sources, workers, artifacts, verified outcomes | Read LWV-controlled state; portable shape/backup separate from model-side memory |
| Worker planning | `src/lib/perception-swarm.ts`, `workforce-task-contract.ts` | Only planning in source; actual adapters must be independently granted |
| Ephemeral worker context | `src/lib/perception-swarm-memory.ts` | Rehydrate active task lease and bounded verified source refs; checkpoints unverified |
| External capabilities | `src/lib/perception-operator.ts`, operator Edge functions | Exact target, permission, idempotency, external receipt and independent verifier |
| Backups | `scripts/perception-sovereign-backup.sh`, restore-check | Owner-controlled encrypted dump, SHA-256, manifest, isolated restore drill |
| Product appearance | `index.html`, `src/styles.css`, `public/perception-mark.svg` | Preserve original near-black, cyan/orange, orbital P; no destination branding replacement |

## Engineered sequence (do not execute against production in this PR)

1. Pin and recheck live source SHA, project schemas, migrations, installed tools and true current production baseline.
2. Select destination provider and its model/structured-response semantics. This remains **unknown** at preparation time.
3. Build a target-specific stateless provider adapter in a follow-on review branch, keeping storage/auth/UI untouched.
4. Stage on synthetic data with no P2/P3 grants and no external production effects.
5. Run independent tests: malformed JSON; hallucinated source refs; observed/inferred separation; cross-project RLS; expired leases; duplicate action keys; false worker success; provider outage; 429/backoff; hard budget; storage restore from LWV; keyboard/iPad Safari first-use; user outcome.
6. Compare side-by-side with baseline. Escalate only measured deficits and review model usage cost and privacy terms before introducing real records.
7. Only with explicit separate permission: connect credentials securely, perform staging deployment, move/restore any live data, activate schedulers/webhooks, change DNS or production provider, and carry out a measured rollback-tested cutover.

## Existing work that must not be presented as released

- PR #107 governed swarm planning and PR #120 traffic-production draft workflow were merged. That does not certify running autonomous workers or real traffic growth.
- PR #116 (guest provider path), PR #118 (local zero-token starter), PR #119 (pre-response understanding evaluation) are **open drafts**. #116 and #118 overlap `src/App.tsx` and must be reconciled before any merge.
- The Nov 14 ingestion snapshot in Notion showed 106 registered sources and 160 observations, but null `processed_at` does not alone prove failed processing; source errors and incomplete provenance remain. Full downstream ingestion unknown.

## Review acceptance

A migration is **not complete** until the same user-owned Project World can be restored independently of any provider memory, the target model returns validated output, permission denials and cost ceilings work, all verified effects have independent receipts, project isolation passes, and a first-time user can accomplish an actual objective in the new environment. Browser and real-device acceptance must be observed rather than inferred from CI alone.

### No-go and rollback

Reject or roll back on cross-project leakage, unauthorized tool effects, failed identity/RLS or memory recovery, misleading completion claims, uncontrolled spending, or inability to reconstruct history without the old provider.

**Out of scope:** Any live provider credential, actual backup, real user-data transfer, production build/merge/deploy, DNS, email, payment or public publishing.

**Durable working notes:** [Notion transport manifest](https://app.notion.com/p/418c96f063c3812bbf3bd1822c64cadd). Keep precise code changes and their tests in reviewable GitHub follow-on PRs.
