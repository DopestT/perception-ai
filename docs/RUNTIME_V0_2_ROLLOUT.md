# Runtime v0.2 rollout and verification

This branch is intentionally safe to review without changing production. Do not deploy the Edge Function before the database migrations it can use are available.

## Required order

1. Apply migration `021_runtime_v02_ledgers.sql`.
2. Apply migration `022_runtime_v02_operational_wiring.sql`.
3. Apply migration `023_runtime_v02_continuation_route.sql`.
4. Verify the new tables, triggers, RPC grants, and indexes.
5. Optionally configure the provider-backed Meaning Resolver.
6. Deploy `perceive-objective`.
7. Run authenticated browser E2E.
8. Run mobile E2E.
9. Only then merge/deploy the frontend as the canonical production experience.

The Edge Function contains backwards-compatible RPC fallbacks, so a preview built from this branch can continue to use the existing runtime while migrations are absent. That fallback is for rollout safety, not the final production state.

## Meaning Resolver configuration

The resolver is provider-optional.

When both server-side secrets are present:

- `OPENAI_API_KEY`
- `PERCEPTION_MEANING_MODEL`

the Edge Function requests schema-constrained structured objective semantics.

If either value is missing, the resolver uses the deterministic fallback. The fallback:

- preserves the direct objective statement
- does not invent implementation state
- keeps missing facts in `known_unknowns`
- does not create inferred claims
- still produces valid objective semantics

Never expose either resolver secret through a `VITE_*` browser variable.

## Database checks

After migration 021:

- `perception_epistemic_ledger` exists
- `perception_execution_ledger` exists
- authenticated users have SELECT-only access to their own ledger rows
- internal append RPCs are service-role only
- `perception_get_project_ledgers` is authenticated and owner-scoped

After migration 022:

- P2/P3 worker insertion fails without a matching active permission grant
- P0/P1 worker insertion is permitted by runtime policy
- worker insertion records intended / authorized / attempted execution phases
- artifact creation records observed execution evidence
- verification writes verified or failed execution evidence
- objective meaning is stored separately from verified Project World current reality

After migration 023:

- route v1 remains historical evidence of the first verified action
- route v1 becomes inactive only when a continuation route is actually required
- route v2 points to v1 through `supersedes_route_id`
- unsupported capabilities remain blocked
- explicit P2/P3 route nodes remain permission-gated
- dependencies between continuation nodes are persisted

## Browser E2E definition of done

Use a real authenticated account.

1. Enter a normal objective in PERCEIVE.
2. Confirm the seven existing first-action stages complete only after verification.
3. Confirm the objective contains structured meaning.
4. Confirm the Epistemic Ledger contains the direct user statement as observed.
5. Confirm resolver-created claims are inferred, not observed.
6. Confirm the Execution Ledger contains intended → authorized → attempted → observed → verified for the first worker.
7. Confirm Project World current reality still reflects verified effects, not resolver inference.
8. Confirm route v1 is retained.
9. Confirm route v2 is active when unresolved continuation work exists.
10. Reload the browser and verify the same Project World and ledgers return from Supabase.
11. Sign out and verify another account cannot read the project or ledgers.

## Permission E2E

Create a controlled test route requiring P2 or P3.

Without a grant:

- worker insertion must fail
- no external action may start

With a narrow active grant:

- the worker may start only when project, capability, level, and expiration rules match

After revocation or expiration:

- a new worker must be rejected

## Front-door product check

The primary mode switch must contain exactly:

- DISCOVER
- PERCEIVE
- SEARCH

FORECAST remains available as a specialized capability/workspace rather than a fourth primary mode.

## Production gate

Do not mark Runtime v0.2 production-complete until all of the following are independently verified:

- migration success
- security/RLS checks
- Edge Function deployment
- real provider resolver or deterministic fallback behavior
- ledger chronology
- permission denial
- verified-effect truth update
- continuation-route persistence
- browser reload restoration
- mobile behavior
- runtime observability sufficient to diagnose a failed objective
