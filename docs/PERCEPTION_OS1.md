# PERCEPTION OS1 — newsletter factory

**Product name:** PERCEPTION OS1  
**Operating rule:** One task → one worker → independent verification → append-only evidence → repeat.  
**Status of this change:** Draft-only onboarding standard. No workers launched, accounts modified, invoices created, charges enabled, or public pages deployed.

## Default for every newly created newsletter

Every new newsletter enters the **Brevo + Stripe-ready** lane from day one.

- **Brevo owns email delivery and subscriber consent.** Give every brand a dedicated, verified Brevo list. Never re-use another project's contacts or senders just because they are available.
- **Stripe owns payments**, under an approved account. Prepare a **brand-specific Stripe product and price mapping** even for a free-first publication, but leave real prices, live checkout, subscriptions, and customer charging inactive until separately approved.
- **PERCEPTION OS1 owns orchestration and truth.** Reuse the canonical Project World, permission system, artifacts, verification and execution ledger. Stripe is authoritative for payment/subscription state; Brevo is authoritative for delivery/list state. OS1 stores evidenced references, not card numbers, API keys, webhooks secrets, or copies of authoritative payment balances.
- **Each newsletter is isolated** by `projectId`, `newsletterId`, domain, sender, Brevo list, consent status, Stripe product/price refs, and post-payment entitlement. No cross-brand contact import, subscriber sharing, or product fallback.
- **No automatic live billing.** Bots may research, prepare drafts, validate manifests, and perform zero-cost sandbox checks under P0/P1. Creating or modifying Stripe live-mode products, prices, payment links, subscriptions, webhooks, customer records, or email sends requires a separately approved exact action contract.

## Five-step OS1 loop

1. **ASSIGN:** Select a project/new newsletter; name one owner agent and one different reviewer; declare its purpose, audience, brand, allowed files, budget and completion tests.
2. **PREPARE:** Produce the newsletter manifest from `docs/templates/perception-os1-newsletter.json`; set Stripe to `planned`; determine if the offer is free, recurring, one-time, or both. **Never invent prices.**
3. **BUILD IN DRAFT:** Prepare the Brevo list/sender/domain mapping, double-opt-in and unsubscribe flow, welcome sequence draft, Stripe product/price/hosted Checkout design, subscription lifecycle webhook plan, and customer self-service portal plan. No live sends or charges.
4. **VERIFY INDEPENDENTLY:** A reviewer who was not the builder checks list/sender isolation, signup, consent, welcome email, cancellation, webhook signature and idempotency, payment-failure behavior, and per-brand entitlement boundaries. Real provider outcomes must be independently read back.
5. **RECORD & REPEAT:** Keep exact source evidence, tester identities, time, outcomes, blockers, approval gates, and drift checks in existing OS1/Perception records. Move to the next newsletter only after a passing review.

## Standard task result

`newsletter_id | owner | reviewer | mode | deliverables | evidence_refs | passed_tests | failed_tests | costs | approval_needed | status`

Only label a result **VERIFIED** after independent review. `PLANNED`, `DRAFTED`, `ATTEMPTED`, `OBSERVED`, `VERIFIED`, and `LIVE` are distinct states.

## Stripe integration blueprint

Use **Stripe-hosted Checkout** for optional paid newsletter subscriptions or one-time digital offers, **Stripe Billing Customer Portal** for customers to manage subscriptions, and signed, idempotent webhooks to reconcile events. Relevant lifecycle events include `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, and `customer.subscription.deleted`; separately consider refunds and disputes if one-time sales are offered.

Webhook events do not automatically prove delivery or entitlement. Verify billing state via Stripe and the intended user/brand entitlement, and verify email state via Brevo. Subscription cancellations and payment failure must not grant fresh paid access. Do not mistake a return to a checkout success page for independently verified payment.

For a free-only newsletter, Stripe is **prepared and associated** but not used to charge subscribers. It should be trivial to add an approved paid product later without rebuilding the newsletter or mixing audiences.

## Migration/production gates

- This standard is for **new** newsletters. Existing LMTYAI / AI Ledger signup, paid Build Review offer, and other verified live properties remain unchanged.
- Existing Stripe account is associated with **Legacy Works Ventures** in the connected session and is in **live mode**. Don't use that context as a sandbox or write to it in this work.
- Brevo account list enumeration was unavailable during the OS1 preparation. All new Brevo list IDs and sender verification are `UNKNOWN` until checked with live provider evidence.
- A real invoice, paid checkout or newsletter send requires its own explicit approval, confirmed pricing and customer-facing terms, credentials kept out of source, rollback, and live acceptance.
- Before 20-worker expansion, prove one isolated newsletter dry run through independent review, the failure/rejection path, and cost+permission controls.

**Reference:** `docs/templates/perception-os1-newsletter.json` is the agent's starter manifest. Do not mistake a generated manifest for a created Brevo list, Stripe product, or operating newsletter.
