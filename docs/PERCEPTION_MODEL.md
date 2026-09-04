# Perception User/Goal Model v0.1

## Architectural invariant

The User/Goal Model stays **upfront**. It is not hidden metadata behind the assistant.

Before Perception routes a serious request, the system must maintain and, when useful, expose the difference between:

- **Observed** — directly supplied by the user or verified from evidence.
- **Inferred** — Perception's interpretation, with confidence and evidence.
- **Confirmed** — an inference explicitly validated by the user.
- **Unknown** — Perception knows it does not yet have enough information.
- **Rejected** — an earlier interpretation corrected by the user.
- **Stale** — information that may no longer be current.

## Required belief fields

Every belief carries:

- `scope`: user / project / task
- `statement`
- `state`
- `confidence`
- `evidence`
- `lastUpdated`
- `contradictions`
- `routeImpact`
- `needsConfirmation`

## Routing rule

The Reality Route must consume this model rather than raw conversation history alone.

Perception must never silently upgrade an inference into a fact. Confirmation changes state; generation alone does not.

## UI rule

Immediately after the primary input experience, show **WHAT PERCEPTION SEES** before downstream route execution detail. Users can inspect and correct inferred beliefs directly.

The panel should answer four questions at a glance:

1. What do you know?
2. What do you think I mean?
3. What have I confirmed?
4. What are you still unsure about?

## Deer test

For the input `deer`, the correct starting behavior is deliberately non-committal:

- observed: the user introduced “deer”
- inferred: the user may want to explore information or possibilities around deer
- unknown: why deer matters to the user

The system should explore without pretending the desired outcome is already known.

## Next engineering gates

1. Persist beliefs by user, project, and goal.
2. Add model-provider inference behind a strict structured schema.
3. Add contradiction detection and stale-belief review.
4. Feed confirmed/observed beliefs into the Reality Map and router.
5. Use user corrections as local project-model updates without silently generalizing them to unrelated projects.
6. Add provenance/evidence links for externally verified beliefs.
