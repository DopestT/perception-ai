# GitHub Operator Execution Lifecycle

The GitHub Operator now records its external-effect lifecycle in the append-only Execution Ledger.

For an authenticated user with an exact project scope:

1. `authorized` — the scoped request reached the operator.
2. `attempted` — recorded only when execution is requested; dry runs stop before this phase.
3. `observed` — GitHub independently reports the bounded branch/commit/file effect.
4. `verified` — recorded only when the observed changed-file set stays inside the planned scope.
5. `blocked` or `failed` — recorded when the executor rejects the request or independent observation detects scope drift.

Project ownership is checked before any execution-ledger write. The edge function uses the existing service-only `perception_record_execution_entry_internal` RPC; browser clients cannot append authoritative execution history directly.

A worker response alone is never sufficient to create an `observed` or `verified` entry.
