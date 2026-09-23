# Perception Runtime Architecture v0.2

## Operating principle

**You set direction; Perception figures out the route.**

Perception is a durable orchestrator, not a conversation transcript and not an uncontrolled swarm. One orchestrator owns project truth. Bounded workers perform specific operations and return evidence.

## Runtime pipeline

Objective Intake → Meaning Resolver → Project World → Reality Mapper → Route Planner → Capability Router → Execution Runtime → Permission Gate → Verification Engine → Adaptation Engine → Realization → Learning

## Two-ledger trust model

### Epistemic Ledger

The Epistemic Ledger records what Perception believes about reality and why. Every material claim should retain:

- claim identity
- statement
- epistemic state
- provenance
- confidence
- temporal validity/freshness
- contradiction references
- route impact
- supersession history

States are explicit: observed, inferred, confirmed, unknown, rejected, stale, contradicted.

Conversation history is evidence. It is never silently promoted into authoritative project truth.

### Execution Ledger

The Execution Ledger records intended and actual effects. An action progresses through append-only observations such as:

intended → authorized → attempted → observed → verified

Failure paths include blocked, failed, and rolled_back.

An attempted action is not completion. An observed external response is not completion. Only a **verified effect with evidence** may advance authoritative Project World state.

## Project World

Project World is the durable materialized view of the user's current project reality. It is derived from verified, permission-valid ledger history and contains objectives, beliefs, routes, dependencies, artifacts, risks, blockers, decisions, world signals, and verification results.

Material state changes must remain auditable. Historical ledger entries are append-oriented; later entries may supersede or contradict earlier ones without erasing them.

## Permission classes

- **P0 Observe** — read, reason, research, inspect, calculate.
- **P1 Draft** — create proposed artifacts without an external effect.
- **P2 Reversible Execute** — bounded reversible actions within an explicitly delegated scope.
- **P3 Consequential Execute** — publishing, spending, deleting, changing access/security, or other material effects; requires explicit authorization unless a narrow standing permission clearly applies.

Permission is scoped by project, capability, target, and duration.

## Worker contract

Workers do not own shared truth. A worker receives a bounded node, minimal context, and permission scope. It returns:

1. attempted operation
2. observed result
3. evidence
4. errors/blockers
5. verification inputs

The orchestrator decides whether the result is verified and whether Project World may change.

## Verification invariant

> Workers produce evidence. Perception owns truth. Actions do not update truth; verified effects update truth.

Verification may use deterministic checks, builds/tests, source inspection, schema validation, UI inspection, external-system confirmation, or explicit user acceptance.

## Adaptation

A failed verification, blocker, contradiction, stale assumption, or material world signal can produce a new versioned route. Replanning must preserve the previous route and record why the route changed.

## Immediate implementation sequence

1. Make Epistemic and Execution Ledgers first-class durable structures.
2. Write new objective/runtime effects to those ledgers.
3. Expose ledger-backed Project World inspection.
4. Implement provider-backed Meaning Resolver with provenance and contradiction handling.
5. Replace the fixed proof route with general dependency-aware Reality Mapping and Route Planning.
6. Add durable P2/P3 permission grants and approval UX.
7. Add retries, leases, idempotency, resumability, and failure adaptation.
8. Add one real external capability adapter with independent verification.
9. Automate browser/mobile E2E across auth → route → execution → verification → restore.
10. Add runtime observability and selective Continuous Perception.
11. Learn only from verified outcomes and explicit corrections.

## Current product guardrail

The front door should remain simple. DISCOVER, PERCEIVE, and SEARCH are the three user-facing modes. Specialized systems such as FORECAST should be routed as capabilities/workspaces beneath that front door rather than silently expanding the primary mode taxonomy.
