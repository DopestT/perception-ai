# Perception Runtime Architecture v0.1

## Core operating principle

**You set direction. Perception figures out the route.**

Perception accepts an objective rather than requiring the user to micromanage steps. The runtime converts that objective into a transparent, evidence-aware route, coordinates work, verifies results, adapts when reality changes, and learns only within explicit scope.

## Architectural invariants

1. The User/Goal Model stays upstream of routing.
2. Observed and confirmed beliefs are trusted routing inputs; inferred beliefs may guide exploration but never silently become facts.
3. `WHAT PERCEPTION SEES` stays inspectable and correctable before consequential routing depends on it.
4. One durable orchestrator owns project state. Specialized workers perform bounded tasks; they do not become independent sources of truth.
5. Every consequential action passes through a permission gate.
6. Every external claim or world signal carries provenance, confidence, freshness, and affected route nodes.
7. Route changes are explicit events. The runtime never silently rewrites project history.
8. Continuous Perception is selective. It surfaces only changes that materially affect an active route.

## Runtime pipeline

### 1. Objective Intake

Input may be text, voice, image, file, link, or incomplete thought.

The intake compiler produces an `ObjectiveSpec`:

- objective statement
- desired reality
- current reality
- constraints
- success criteria
- requested deliverables
- urgency
- permissions
- known unknowns
- source references

The ObjectiveSpec is allowed to contain uncertainty. Missing information is represented as unknown rather than invented.

### 2. Meaning Resolver

Updates the User/Goal Model using structured beliefs:

- observed
- inferred
- confirmed
- unknown
- rejected
- stale

Contradictions are detected before route planning. High-impact unresolved inferences become visible confirmation gates.

### 3. Project Graph / World Model

Perception maintains a project-scoped graph containing:

- objectives
- beliefs
- desired/current reality
- dependencies
- route nodes
- decisions
- artifacts
- evidence
- external entities
- capabilities
- blockers
- risks
- opportunities
- world signals
- verification results

The graph is the runtime's source of project truth. Conversation history is evidence feeding the graph, not the graph itself.

### 4. Reality Mapper

Transforms the trusted model into the gap between current reality and desired reality.

Each gap becomes one or more route nodes with:

- required outcome
- dependencies
- confidence
- risk
- cost/effort estimate
- capability requirements
- evidence requirements
- permission level
- completion test

### 5. Route Planner

Chooses the smallest viable path from current reality to desired reality.

Routes are versioned. A new route does not erase the old route; it supersedes it with a reason.

The planner optimizes for:

1. correctness
2. user intent
3. safety and permission
4. reversibility
5. dependency order
6. time/cost efficiency
7. learning value

### 6. Capability Router

Maps route nodes to bounded capabilities such as:

- reason
- research
- retrieve connected context
- generate artifact
- edit artifact
- code
- communicate
- schedule/watch
- calculate
- verify

Workers receive only the context and permissions required for their node.

### 7. Execution Runtime

The orchestrator advances route nodes through a state machine:

`pending -> ready -> running -> awaiting_approval -> verifying -> completed`

Alternate terminal/interruption states:

`blocked | failed | skipped | superseded | paused`

Execution writes events and artifacts back to the project graph.

### 8. Permission Gate

Default action classes:

- **P0 Observe** — read, reason, research, calculate.
- **P1 Draft** — create proposed content/artifacts without external effect.
- **P2 Reversible Execute** — bounded reversible actions explicitly delegated by the user.
- **P3 Consequential Execute** — sending, publishing, purchasing, deleting, committing funds, changing access, or other material external effects; requires explicit authorization unless a previously granted narrow standing permission clearly covers the action.

Permission is scoped by project, capability, target, and duration. It is never inferred from general enthusiasm.

### 9. Verification Engine

A route node is not complete because a worker says it is complete.

Verification compares the output against the node's completion test using one or more of:

- deterministic checks
- build/tests
- source verification
- schema validation
- UI/state inspection
- user acceptance
- external system confirmation

Failed verification returns evidence to the planner.

### 10. Adaptation Engine

When a blocker, contradiction, failed verification, changed assumption, or new world signal materially affects the route, Perception creates a route-change proposal.

Low-risk internal replanning may occur automatically. Changes that alter the objective, introduce consequential actions, materially increase cost/risk, or depend on a disputed belief are surfaced to the user.

### 11. Realization

An objective becomes `realized` only when its success criteria are satisfied by verified route outcomes.

Completion is evidence-backed, not conversational.

### 12. Learning

Learning updates project-scoped reusable knowledge from:

- corrections
- confirmed preferences
- successful/failed route patterns
- verification results
- explicit user decisions

Local project learning does not silently generalize into unrelated projects or user-wide facts.

## Continuous Perception / Project World

Active projects may opt into a continuous loop that watches relevant external and internal signals.

Each signal is scored on:

`relevance x impact x novelty x confidence x urgency - noise`

A surfaced item must answer:

1. What changed?
2. Why does it matter to this route?
3. Which belief, dependency, or route node is affected?
4. How confident are we?
5. What is the recommended next action?

The system should remain quiet when no signal crosses the project's materiality threshold.

## Event model

Core event families:

- objective.created / objective.updated / objective.realized
- belief.observed / inferred / confirmed / rejected / stale / contradicted
- route.created / route.superseded
- route_node.ready / started / blocked / completed / failed
- permission.requested / granted / denied / expired
- artifact.created / updated / verified
- verification.passed / failed
- world_signal.detected / surfaced / dismissed
- learning.accepted / rejected

Events are append-oriented audit history. Materialized project state may change; history does not.

## Runtime ownership

Use a **single orchestrator + bounded workers** architecture rather than an uncontrolled swarm.

The orchestrator owns:

- current objective
- trusted beliefs
- active route version
- node state
- permissions
- retries
- verification
- adaptation

Workers own only their assigned operation and return structured evidence/results.

## Immediate implementation order

1. Persist objectives, route versions, route nodes, dependencies, permissions, artifacts, verification runs, and world signals.
2. Add TypeScript runtime contracts and deterministic route-state helpers.
3. Connect the existing User/Goal Model to an ObjectiveSpec compiler.
4. Replace browser-only project truth with authenticated Supabase synchronization while preserving local resilience.
5. Add provider-backed structured perception behind schemas.
6. Implement the Reality Map graph and route planner.
7. Add one execution capability end-to-end with verification before broadening the capability set.
8. Add Continuous Perception after the core route loop is durable.

## First end-to-end proof

A successful first runtime proof should accept a user objective, produce `WHAT PERCEPTION SEES`, compile an ObjectiveSpec, generate a small route graph, execute one P0/P1 node, verify it, update project state, and explain what changed and why.