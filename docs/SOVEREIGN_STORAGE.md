# Perception Sovereign Storage

## Governing rule

> **PERCEPTION SOVEREIGN STORAGE RULE — The authoritative state of Perception must exist on infrastructure controlled by Legacy Works Ventures. AI providers may process bounded copies of information but may not own Perception’s canonical state. Provider memory, conversation history, vector stores, assistants, threads, or proprietary model storage cannot serve as Perception’s system of record.**

This rule is architectural, not aspirational. Any feature that violates it is invalid even if it is convenient.

## Authority model

Perception owns and persists canonical state in the Perception datastore administered by Legacy Works Ventures.

Canonical state includes, at minimum:

- Project World;
- objectives and desired/current reality;
- Epistemic Ledger;
- Execution Ledger;
- routes, nodes, dependencies, and blockers;
- permission grants and operator principals;
- artifacts and content references;
- verification runs and evidence;
- source bindings and observations;
- world signals;
- worker runs, leases, retries, and failure state;
- Scenario Forge state and learned utility;
- forecast state and calibration;
- model-routing decisions and cost telemetry;
- durable external-system bindings;
- audit/model events.

AI providers are **processors**, never state owners.

## Provider boundary

Every provider request is a bounded working copy.

Every provider receives a **non-authoritative working copy** of only the context required for the bounded operation.

For OpenAI requests, Perception explicitly sends `store: false`. Perception does not use provider conversations, previous-response chains, assistants, threads, hosted vector stores, or provider file-search stores as durable Project World state.

OpenAI-compatible and local endpoints receive only the bounded task context required for the current operation. Perception does not assume that a compatible endpoint supports OpenAI-specific storage flags.

Provider responses remain proposals or observations until Perception validates them and writes an explicit canonical record.

Provider request IDs may be retained as diagnostic provenance, but they can never be a required foreign key for restoring Project World.

### Canonical provider-call provenance

Every attempted model call that reaches the Perception runtime is recorded in the LWV-controlled `perception_provider_calls` ledger after a Project World exists. The ledger records provider, model, protocol, routing lane, task/stage, success/failure, bounded token usage, and the storage directive Perception sent.

The ledger deliberately records:

- `bounded_copy = true`;
- `provider_state_authoritative = false`;
- `canonical_dependency = false`;
- OpenAI calls with `provider_storage_directive = store_false`.

The database rejects an OpenAI provenance row that does not record `store_false`. Failed provider attempts are recorded even when the provider returns no token-usage object.

This provenance is included in sovereign export manifests so an LWV-controlled restore can explain which external processors participated without requiring any of their server-side state.

## Conversation boundary

Conversation text can be evidence. It is not truth by itself.

A chat transcript, browser session, model conversation, or external agent thread may disappear without damaging Perception's ability to restore authoritative state.

The production UI must hydrate Project World from the canonical backend after authentication. Browser-local data is limited to short-lived UX continuity such as a pending objective and must never be treated as a verified Project World.

## Portability test

Perception passes the sovereignty test only when this statement is true:

> If every AI-provider account and provider-side memory object disappeared, Legacy Works Ventures could attach a replacement model provider and resume Perception from its own canonical state without reconstructing truth from chat history.

## Storage authority record

The database contains a machine-readable storage-authority record. It declares:

- Legacy Works Ventures as canonical owner;
- provider state as non-authoritative;
- conversation history as non-authoritative;
- provider vector stores as non-authoritative;
- assistants/threads/conversations as non-authoritative.

The record is readable by authenticated users but cannot be rewritten by browser clients.

## Sovereign export ledger

Perception records export manifests in `perception_sovereign_exports`.

An export manifest is not the backup itself. It is an auditable record of:

- which Project World was prepared for export;
- row counts for core canonical state;
- canonical checkpoints;
- manifest checksum;
- destination class;
- archive checksum and size after a backup is written;
- verification status.

The actual backup/archive must be written to infrastructure controlled by Legacy Works Ventures. Provider storage is not an acceptable archive destination.

## Backup strategy

Use PostgreSQL-native backups for whole-system recovery and project-scoped logical exports where portability or selective restore is required.

A production backup process should:

1. read from the canonical Perception database;
2. write encrypted backup material to LWV-controlled storage;
3. compute a SHA-256 checksum;
4. register the export manifest and archive checksum;
5. perform periodic restore drills into an isolated environment;
6. record the restore verification result.

No backup is considered proven until a restore test succeeds.

## Enforcement

CI includes a sovereignty gate that rejects runtime code introducing provider-persistent state dependencies such as:

- provider conversations;
- `previous_response_id` chains;
- Assistants/Threads APIs;
- hosted vector-store IDs as canonical state;
- browser `perception:workspace` state as a production source of truth.

Provider model calls must pass through the shared provider boundary.

## Change-control rule

Any future proposal involving provider memory or hosted retrieval must answer two questions before merge:

1. Can the provider-side state be deleted without losing canonical Perception state?
2. Can Perception recreate the required working context from LWV-controlled state?

If either answer is no, the design violates this rule.
