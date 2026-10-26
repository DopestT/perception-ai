# LMTYAI Max C Revenue Intelligence Implementation Plan

**Goal:** Wire verified LMTYAI commercial events into Perception so sales, attribution, and reconciliation can be queried as part of Project World.

**Architecture:** Stripe remains authoritative. A signed external webhook writes bounded, idempotent events to Perception’s append-only LMTYAI revenue ledger. A second append-only reconciliation ledger compares Perception totals with Stripe. An owner-scoped dashboard RPC exposes compact revenue state. Attribution is explicit and confidence-bounded.

**Stack:** Supabase Postgres + RLS, Supabase Edge Functions/Deno, Stripe webhooks/API, existing Perception Project World and ledgers.

---

## Task 1 — Security gate first

**Files:**
- Create: `supabase/tests/lmtyai_max_c_revenue_gate.sql`

1. Assert both revenue tables exist.
2. Assert RLS is enabled.
3. Assert `authenticated` has no INSERT/UPDATE/DELETE privileges and `anon` has no table privileges.
4. Assert the dashboard RPC exists, is executable by `authenticated`, and is not executable by `anon`.
5. Assert `(provider, provider_event_id)` uniqueness exists.
6. Assert the Vault accessor cannot be executed by `anon` or `authenticated`.
7. Run an equivalent live preflight query and confirm the test is RED because Max C objects are absent.

## Task 2 — Append-only revenue and reconciliation schema

**Files:**
- Create: `supabase/migrations/20261026062000_lmtyai_max_c_revenue.sql`

1. Create `lmtyai_revenue_events` with provider idempotency, minor-unit money fields, bounded attribution/verification states, source evidence, and no sensitive card fields.
2. Create `lmtyai_revenue_reconciliations` with verification windows, provider-vs-ledger totals, mismatch details, and evidence.
3. Enable RLS on both tables.
4. Grant owner-scoped SELECT only to authenticated users; deny client writes.
5. Add indexes for project/time, attribution, creative, and reconciliation lookups.
6. Create `lmtyai_get_revenue_dashboard(uuid,timestamptz,timestamptz)` as `SECURITY INVOKER`, owner-scoped and authenticated-only.
7. Create a service-role-only Vault accessor for the Stripe webhook secret with an empty search path and explicit privilege revocation.
8. Apply migration to the live Perception project.
9. Re-run gate and Supabase security/performance advisors.

## Task 3 — Stripe webhook adapter

**Files:**
- Create: `supabase/functions/lmtyai-stripe-webhook/index.ts`
- Create: `supabase/functions/lmtyai-stripe-webhook/deno.json`
- Update: `supabase/config.toml`
- Update: `.github/workflows/ci.yml`

1. Add a CI/static gate that requires `verify_jwt = false`, raw-body signature verification, `stripe-signature`, Vault secret lookup, and no secret logging.
2. Implement the external webhook with `@supabase/server` and Stripe SDK.
3. Verify Stripe signature before any privileged database write.
4. Support initial revenue-relevant event families: Checkout completion, payment success/failure, refund, dispute, subscription lifecycle/cancellation.
5. Normalize only required references, money values, timestamps, and metadata.
6. Treat provider-event uniqueness conflicts as idempotent success.
7. Deploy the Edge Function with platform JWT verification disabled.

## Task 4 — Live Stripe registration and Vault handoff

1. Retrieve the function URL from the Perception project.
2. Create a live Stripe webhook endpoint scoped to the required events.
3. Store the returned signing secret in Supabase Vault under a fixed internal name; do not echo it to chat or commit it.
4. Verify the service-role-only accessor can retrieve the configured secret while client roles cannot.
5. Send/observe a signature-negative request and confirm no database write occurs.

## Task 5 — Reconciliation baseline

1. Query current Stripe revenue/payment data for a bounded baseline window.
2. Create the first `lmtyai_revenue_reconciliations` row with evidence references and `matched`/`mismatch` state.
3. Do not fabricate historical attribution when Stripe does not contain campaign evidence.
4. Verify the dashboard reflects the reconciliation state.

## Task 6 — Customer acceptance readiness

1. Verify function deployment and logs have no signature/config errors.
2. Verify dashboard query succeeds for the LMTYAI Growth Sniffer project.
3. Verify no duplicate event can be created with the same Stripe event id.
4. Verify security/performance advisors after schema/function changes.
5. Open a PR from `feature/lmtyai-max-c-revenue` to `main`; confirm CI status.
6. Only then tell the user the pretend-customer test is ready.

## Customer acceptance trace

After readiness, the fresh customer journey should allow Perception to report: verified sale amount/product, customer-newness when supportable, source/creative attribution with confidence, funnel evidence present, and Stripe reconciliation state. Unknown attribution remains explicitly unknown.