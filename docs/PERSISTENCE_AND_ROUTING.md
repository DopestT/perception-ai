# Perception Persistence and Routing v0.2

## Why this exists

Perception must maintain continuity without confusing remembered context with verified reality. The User/Goal Model therefore persists as structured state and remains upstream of routing.

## Current implementation

The browser stores a versioned workspace containing one or more project models. The active model is restored on return and reviewed for stale inferences before the Reality Route is shown.

This is an initial continuity layer, not the final account backend. Cross-device/email-account persistence should use a dedicated Perception database with authentication and row-level security. A ready migration lives at `supabase/migrations/001_perception_memory.sql`.

## Routing gate

The route-readiness engine only treats `observed` and `confirmed` beliefs as trusted routing signals.

- Inferred beliefs may inform exploration, but they do not silently become facts.
- Unknown beliefs keep uncertainty visible.
- Stale inferences must be re-checked.
- Rejected beliefs remain as correction history and should not guide the route.

The first route gates are:

1. IDEA — no trusted signal yet.
2. UNDERSTOOD — the subject exists, but desired reality is not confirmed.
3. MAPPED — desired reality is confirmed, but route-relevant uncertainty remains.
4. ROUTED — enough trusted evidence exists to select a route without depending on unresolved guesses.

Later build/execution/verification gates remain separate from these understanding gates.

## Upfront invariant

`WHAT PERCEPTION SEES` remains before downstream route detail. Persistence must never turn the user model into hidden metadata. The user should be able to inspect and correct Perception's current interpretation before consequential routing depends on it.

## Next implementation gates

1. Dedicated Perception auth + database deployment.
2. Sync the local workspace with authenticated project records.
3. Add structured provider-backed inference.
4. Record explicit confirmation/correction events server-side.
5. Add contradiction detection between new evidence and trusted beliefs.
6. Feed the trusted model into the Reality Map dependency graph.
7. Connect Project World signals to affected beliefs/route nodes with provenance.
