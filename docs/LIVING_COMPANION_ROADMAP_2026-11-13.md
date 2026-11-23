# PERCEPTION — Living Companion: safe evolution plan

**Date:** 2026-11-13 UTC  
**Scope:** `DopestT/perception-ai` only. Keep PERCEPTION isolated from LMTYAI, Blue Tsunami, VCF, AEGENT, AIrwave and unrelated microsites.

## User direction
- The plasma should move as a continuous living current, with realistic momentum rather than jumpy decorative animation.
- A small, occasional fish can pass through the fluid and adopt its local palette. It is discoverable, not constantly displayed.
- A user should be able to create a task, continue other work, and return to real progress and a verified result.
- With informed consent and demonstrated evaluation, PERCEPTION should adapt to users' working styles and reduce repeated instructions over time.
- The product motto remains: “We don't replace human imagination. We give it the power to become reality.”

## Already implemented in draft PR #105
1. Coherent plasma eddies, frame-rate-independent damping and motion-reduction support.
2. Canvas-drawn soft fish with oscillating fins, irregular 20–36-second spacing after each passage, dynamic color palette and no pointer interaction. Decorative only: no tracking or logging.
3. A signed-in saved-work rail from the existing Project World, showing current objective status, an explicit read-only Check Status action, and a link to the evidence view. It never infers success from another objective's verifications.
4. Tests for bounded fish travel, direction, random-like deterministic spacing, damping and evidence honesty.

## What this does not yet prove
The presence of a `perception_worker_runs` record, a successful build, or a saved task is not proof that an unattended objective finished. No new scheduler, worker service, spending permission, agent memory store, or autonomous research loop has been enabled by PR #105. Full in-browser iPad and desktop visual verification is pending.

## Implementation path for set-task-then-return
Reuse canonical Supabase project `zxmdfmiueapjhktqchts`, existing `perception_projects`, `perception_objectives`, `perception_route_nodes`, `perception_worker_runs`, execution/epistemic ledgers, artifacts, and verification APIs. Do not create a parallel database, shadow source of truth, or duplicate task queue.

**Phase A — task ownership and status:** Provide user-visible saved tasks, exact ownership, status and last checked timestamps. Read-only refresh must not dispatch work. Only show completion if current objective's evidence is independently verified and linked to that objective.

**Phase B — one isolated unattended fixture:** In a disposable environment, submit a bounded P0/P1 task, leave the session, run the existing continuation path, and return to inspect a verifiable artifact. Measure status changes, latency, work lease, retries, failure states and token costs. Include a synthetic failure where worker self-report is rejected, with no durable success claim.

**Phase C — controlled background continuation:** Only after B, add a bounded dispatcher for eligible user-owned tasks using existing leases, idempotency and cost policies. Cap concurrency and attempts, require explicit user opt-in to unattended continuation, respect cancellation, block P2/P3 actions pending fresh review, and prevent cross-project task leaks. Release behind a flag and require approval for new production scheduling/database writes/billable providers.

**Phase D — user learning:** Start with explicit, editable preference rules (e.g. preferred output format, working cadence and feedback), not inferred sensitive traits. Use approved, relevant evidence from that user's completed sessions and corrections; show a "why I suggested this" explanation and let users revise or clear preferences. Never silently collect passwords, financial, health or political profiles. Benchmark held-out tasks against non-personalized baseline and correct negative transfer. Make no claim of continuous learning from count growth alone.

## Acceptance criteria
- Real sign-in, sign-out and return-later persistence tested in browser on iPad Safari and desktop.
- User can submit a bounded fixture, leave and return to its durable identifier, status, evidence and verified output.
- Successful and rejected tasks are independently distinguishable; background work never mints elevated permissions.
- Resource/cost ceilings and lease/duplicate protection are enforced and observable.
- Personalization can be disabled and audited by the user; improvement is measured, not asserted.
- Motion is smooth at 30/60 fps, non-blocking, and absent when reduced motion is requested.
- Preserve last-known-good production and require explicit approval before merge, deploy or scheduler activation.

**Related evidence:** [PR #105](https://github.com/DopestT/perception-ai/pull/105), [workforce phase-0 audit](https://github.com/DopestT/perception-ai/blob/main/docs/PERCEPTION_WORKFORCE_PHASE0_AUDIT_2026-11-05.md), [PR #106 sign-in usability](https://github.com/DopestT/perception-ai/pull/106).
