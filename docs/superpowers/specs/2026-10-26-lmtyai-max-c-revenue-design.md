# LMTYAI Max C Revenue Intelligence — Design

## Intent

Make Perception the verified commercial intelligence layer for Let Me Teach You AI (LMTYAI), so the operator can ask natural questions such as “How are sales today?”, “What sold?”, “Did TikTok drive any revenue?”, and “Which content is converting?” without manually reconciling Stripe, website analytics, and campaign data.

Stripe remains authoritative for money. Perception stores an append-only interpretation of commercial events, attribution evidence, reconciliation results, and resulting world signals.

## Desired reality

The existing `LMTYAI Growth Sniffer` Project World can observe a customer journey from acquisition through purchase, distinguish verified revenue from uncertain attribution, reconcile its event ledger against Stripe, and surface contradictions instead of silently rewriting history.

## Goals

- Append-only revenue events with provider idempotency.
- No card details or unnecessary payment data stored in Perception.
- Attribution states: `verified`, `probable`, `possible`, `unknown`.
- Verification states: `observed`, `verified`, `contradicted`.
- Stripe totals periodically reconciled against Perception totals.
- Authenticated owner can read a compact revenue dashboard; anonymous callers cannot.
- External Stripe webhook verifies Stripe’s signature before privileged writes.
- Webhook secret remains outside source control.
- Existing Perception epistemic/execution/world-signal doctrine remains authoritative.

## Non-goals

- Rebuilding LMTYAI checkout.
- Automatically changing product prices.
- Automatically issuing refunds.
- Storing PAN, CVC, payment method details, or full Stripe payloads by default.
- Claiming TikTok attribution when evidence is incomplete.

## Approaches considered

### A. Query Stripe on demand

Fastest, but weak attribution and no durable Perception learning history.

### B. Webhook-only revenue ledger

Good event history, but vulnerable to delivery gaps and incomplete reconciliation.

### C. Hybrid verified ledger — selected

Signed Stripe events enter an append-only Perception revenue ledger, and periodic reconciliation compares Perception with Stripe. Any mismatch becomes an explicit contradiction. This best matches Perception’s verification-first doctrine.

## Data model

### `lmtyai_revenue_events`

One row per provider event. Important fields:

- project/user ownership
- provider and provider event id
- event type and provider object id
- customer/product/price references only
- gross/refund/net minor-unit amounts and currency
- event time
- source platform/channel, campaign id, creative id
- first-touch/last-touch evidence
- attribution state/confidence
- verification state
- evidence and bounded raw facts
- reconciliation timestamp

Uniqueness on `(provider, provider_event_id)` makes webhook retries idempotent.

### `lmtyai_revenue_reconciliations`

Stores each verification window and compares ledger totals with provider totals. Mismatches remain visible; they do not overwrite historical revenue events.

## Read model

`lmtyai_get_revenue_dashboard(project_id, from, to)` returns a compact JSON snapshot including:

- gross revenue
- refunds
- net revenue
- verified/observed order counts
- TikTok-attributed revenue split by attribution confidence
- attribution-unknown revenue
- top creative/campaign when evidence exists
- last reconciliation status/time

The function is security-invoker and owner-scoped.

## Stripe intake

A public Supabase Edge Function accepts Stripe webhooks with platform JWT verification disabled because Stripe does not send Supabase credentials. The handler must:

1. Read the raw request body.
2. Verify `stripe-signature` against the Stripe webhook signing secret.
3. Reject invalid signatures before any database write.
4. Map only approved commercial event fields into the revenue ledger.
5. Use the Supabase backend secret/service role for privileged writes.
6. Return success on duplicate provider event ids without creating a second row.

The Stripe webhook signing secret is stored in Supabase Vault, not Git or client code. A service-role-only accessor retrieves it for the function.

## Attribution

Acquisition metadata should propagate through checkout using LMTYAI campaign/creative identifiers when the website layer supports it. Revenue can still be verified even when attribution is unknown.

Attribution meanings:

- `verified`: deterministic campaign/creative evidence.
- `probable`: strong but incomplete evidence.
- `possible`: plausible temporal/path evidence.
- `unknown`: no defensible source assignment.

## Permissions

Perception may autonomously observe, ingest, reconcile, calculate, diagnose, forecast, and recommend. New ad spend, pricing changes, refunds, major paid campaigns, and sensitive external disclosures remain approval-gated.

## Failure behavior

- Invalid Stripe signature: reject, no write.
- Duplicate Stripe event: acknowledge idempotently, no duplicate row.
- Missing attribution: record verified sale with `unknown` attribution.
- Stripe/ledger mismatch: record a reconciliation mismatch and surface contradiction.
- TikTok metrics unavailable: revenue still reports accurately; attribution confidence stays bounded.

## Acceptance test

A fresh user journey should produce a trace that can answer:

- Was a sale verified?
- What product/price was involved?
- What was gross/refund/net revenue?
- Was the acquisition source known?
- Was TikTok attribution verified/probable/possible/unknown?
- Did Perception’s ledger reconcile with Stripe?

The user’s planned pretend-customer purchase is the production acceptance trace after the wiring is complete.