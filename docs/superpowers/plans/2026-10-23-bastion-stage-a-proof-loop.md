# Bastion Stage A Proof Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic local security proof showing that one project-scoped AI agent can keep doing allowed work while Bastion blocks a protected-secret read, persistence creation, and unauthorized network egress, records the attempts, contains the agent, and proves no supported survival path was created.

**Architecture:** Incubate Stage A as an isolated Rust proof package at `proofs/bastion-stage-a/` inside the Perception repository so it can reuse Perception's trust vocabulary without coupling to the production web/runtime code. A deterministic Capsule policy engine sits in front of bounded filesystem, persistence, and network adapters; a tamper-evident local ledger records Perception-compatible execution phases; leases make authority temporary; containment revokes leases; a proof harness runs one adversarial fixture and emits a machine-readable report. No model call participates in allow/deny decisions.

**Tech Stack:** Rust stable, edition 2021; `serde`, `serde_json`, `sha2`, `uuid`, `time`, `thiserror`, `url`; `tempfile` for tests; GitHub Actions on Ubuntu for the proof gate.

**Spec:** `docs/superpowers/specs/2026-10-23-bastion-ai-security-design.md`

## Global Constraints

- Bastion remains a standalone product boundary; `proofs/bastion-stage-a/` is incubation only and must not be imported by production `src/` or `supabase/` runtime code.
- Preserve Perception permission names exactly: `P0`, `P1`, `P2`, `P3`.
- Preserve execution phase names exactly: `intended`, `authorized`, `attempted`, `observed`, `verified`, `blocked`, `failed`, `rolled_back`.
- Deterministic policy is authoritative. Optional AI/model scoring may only escalate; Stage A makes no provider/model calls.
- Default decision is deny when identity, project scope, target normalization, permission, or lease state is uncertain.
- `verified` may only be appended when evidence is non-empty and a verifier confirms the resulting state.
- Never write secret contents, credential values, or arbitrary file contents into the ledger or proof report.
- All path checks use canonicalized paths and must reject traversal/symlink escapes from Capsule roots.
- Network tests must not require public Internet access.
- Persistence inventory may only claim coverage for configured Stage A persistence roots; scan errors must prevent a `clean` conclusion.
- Rust crate root uses `#![forbid(unsafe_code)]`.

## Review Focus

- **Filesystem aliasing/symlink escape:** a path lexically under an allowed root but canonically outside it must be denied; Task 5 pins this.
- **Confusing network URLs:** userinfo, mixed case, explicit ports, and redirects must not allow an unapproved destination; Task 7 pins this.
- **Expired or revoked authority:** an otherwise valid action with an expired/revoked lease must fail closed before capability execution; Task 4 and Task 8 pin this.
- **Ledger corruption/interruption:** a modified or truncated hash chain must be detectable and must not be presented as trusted evidence; Task 3 pins this.
- **Incomplete persistence scan:** unreadable/missing configured roots must produce `incomplete`, not `clean`; Task 6 pins this.

---

### Task 1: Stage A crate and Perception-compatible security model

**Files:**
- Create: `proofs/bastion-stage-a/Cargo.toml`
- Create: `proofs/bastion-stage-a/src/lib.rs`
- Create: `proofs/bastion-stage-a/src/model.rs`
- Test: `proofs/bastion-stage-a/tests/model_contract.rs`

**Interfaces:**
- Consumes: the approved spec and existing Perception names only; no production runtime imports.
- Produces: `PermissionLevel`, `ExecutionPhase`, `AgentIdentity`, `Capsule`, `Capability`, `ActionRequest`, `PolicyDecision`, `EvidenceRef`, `LedgerEntry`, `LeaseId`.

- [ ] **Step 1: Write the failing model contract test**

Assert serialization uses exact permission strings `P0`–`P3` and exact execution phase strings, and that a minimal `AgentIdentity`, `Capsule`, and `ActionRequest` round-trip through JSON without losing IDs or scope.

- [ ] **Step 2: Run the test and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test model_contract`

Expected: FAIL because the crate/types do not yet exist.

- [ ] **Step 3: Add the crate and model types**

Required public shapes:

```rust
pub enum PermissionLevel { P0, P1, P2, P3 }
pub enum ExecutionPhase { Intended, Authorized, Attempted, Observed, Verified, Blocked, Failed, RolledBack }
pub enum Capability { ReadFile, WriteProjectFile, CreatePersistence, NetworkRequest }
pub struct AgentIdentity { pub agent_id: String, pub run_id: String, pub user_id: String, pub device_id: String, pub project_id: String, pub created_at: OffsetDateTime, pub expires_at: OffsetDateTime }
pub struct Capsule { pub project_id: String, pub allowed_roots: Vec<PathBuf>, pub protected_roots: Vec<PathBuf>, pub persistence_roots: Vec<PathBuf>, pub allowed_network_origins: Vec<String>, pub max_permission: PermissionLevel }
pub struct ActionRequest { pub action_id: String, pub agent: AgentIdentity, pub capability: Capability, pub permission: PermissionLevel, pub target: String }
```

Derive serde traits and keep enum wire values snake_case where they must match Perception execution phases.

- [ ] **Step 4: Run the contract test**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test model_contract`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a
git commit -m "feat(bastion): add Stage A security model"
```

### Task 2: Deterministic Capsule policy engine

**Files:**
- Create: `proofs/bastion-stage-a/src/policy.rs`
- Test: `proofs/bastion-stage-a/tests/policy.rs`

**Interfaces:**
- Consumes: `ActionRequest`, `Capsule`, `PermissionLevel`, `Capability` from Task 1.
- Produces: `pub fn evaluate(request: &ActionRequest, capsule: &Capsule, lease: &LeaseState, now: OffsetDateTime) -> PolicyDecision` and `PolicyDecision::{Allow, Deny{reason}, RequireApproval{reason}}`.

- [ ] **Step 1: Write failing policy tests**

Cover: project mismatch => deny; requested permission above Capsule maximum => deny; `CreatePersistence` requires `P3`; protected-root file access => deny; unknown capability/target normalization failure => deny; valid scoped `P0/P1/P2` action => allow; valid `P3` without explicit strong authorization => `RequireApproval`.

- [ ] **Step 2: Run policy tests and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test policy`

Expected: FAIL because `policy` does not exist.

- [ ] **Step 3: Implement `evaluate` as a pure deterministic function**

No filesystem, network, AI, or clock reads inside `evaluate`; all state is passed in. Deny is the fallback for any unhandled condition.

- [ ] **Step 4: Run policy tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test policy`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/policy.rs proofs/bastion-stage-a/tests/policy.rs
git commit -m "feat(bastion): add deterministic capsule policy"
```

### Task 3: Tamper-evident execution ledger

**Files:**
- Create: `proofs/bastion-stage-a/src/ledger.rs`
- Test: `proofs/bastion-stage-a/tests/ledger.rs`

**Interfaces:**
- Consumes: `LedgerEntry`, `ExecutionPhase`, `EvidenceRef` from Task 1.
- Produces: `Ledger::open(path)`, `Ledger::append(entry)`, `Ledger::entries()`, `Ledger::verify_chain() -> Result<ChainStatus, LedgerError>`, and phase validation helper `validate_transition(previous: Option<ExecutionPhase>, next: ExecutionPhase, evidence_count: usize)`.

- [ ] **Step 1: Write failing ledger tests**

Assert: `intended -> blocked` is valid; `intended -> authorized -> attempted -> observed -> verified` is valid; `verified` with zero evidence fails; `intended -> verified` fails; every persisted row includes `previous_hash` and `entry_hash`; modifying one stored row makes `verify_chain` fail; truncating a partial final row reports corruption/incomplete storage rather than silently trusting it.

- [ ] **Step 2: Run ledger tests and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test ledger`

Expected: FAIL.

- [ ] **Step 3: Implement append-only JSONL ledger with SHA-256 chaining**

The hash input must include canonical serialized entry data plus `previous_hash`. Do not store secret/file payloads in `details` or `evidence`; use bounded metadata and hashes only.

- [ ] **Step 4: Run ledger tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test ledger`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/ledger.rs proofs/bastion-stage-a/tests/ledger.rs
git commit -m "feat(bastion): add tamper-evident execution ledger"
```

### Task 4: Temporary capability leases and containment

**Files:**
- Create: `proofs/bastion-stage-a/src/lease.rs`
- Create: `proofs/bastion-stage-a/src/containment.rs`
- Test: `proofs/bastion-stage-a/tests/containment.rs`

**Interfaces:**
- Produces: `LeaseState::{Active, Expired, Revoked}`, `LeaseStore::issue(agent_id, project_id, capabilities, expires_at) -> LeaseId`, `LeaseStore::state(lease_id, now) -> LeaseState`, `LeaseStore::revoke(lease_id)`, and `contain_agent(agent_id, &mut LeaseStore) -> ContainmentReceipt`.

- [ ] **Step 1: Write failing lease/containment tests**

Assert an active lease becomes expired at `expires_at`; revoked leases remain revoked; containment revokes every active lease for the target agent but does not revoke another agent's leases; subsequent state checks fail closed.

- [ ] **Step 2: Run tests and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test containment`

Expected: FAIL.

- [ ] **Step 3: Implement in-memory Stage A lease store and containment receipt**

Containment receipt includes affected lease IDs, agent ID, timestamp, and no secret material.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test containment`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/lease.rs proofs/bastion-stage-a/src/containment.rs proofs/bastion-stage-a/tests/containment.rs
git commit -m "feat(bastion): add temporary leases and containment"
```

### Task 5: Brokered filesystem capability with secret and escape protection

**Files:**
- Create: `proofs/bastion-stage-a/src/capability/mod.rs`
- Create: `proofs/bastion-stage-a/src/capability/fs.rs`
- Test: `proofs/bastion-stage-a/tests/fs_guard.rs`

**Interfaces:**
- Produces: `FileCapability::read_text(path, capsule) -> Result<ObservedFile, CapabilityError>` and `FileCapability::write_project_text(path, bytes, capsule) -> Result<ObservedWrite, CapabilityError>`.
- `ObservedFile` exposes bounded metadata plus content to the immediate caller; callers must never place content in the ledger.

- [ ] **Step 1: Write failing filesystem guard tests**

Use `tempfile` roots. Assert an allowed project file can be read; a protected secret path is denied; `../` traversal is denied; a symlink located inside the project but pointing outside the canonical allowed root is denied; write outside the allowed root is denied.

- [ ] **Step 2: Run tests and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test fs_guard`

Expected: FAIL.

- [ ] **Step 3: Implement canonical-path boundary checks and bounded file operations**

The capability adapter performs the operation only after canonical scope checks. Return an error if canonicalization cannot establish the target safely.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test fs_guard`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/capability proofs/bastion-stage-a/tests/fs_guard.rs
git commit -m "feat(bastion): guard project filesystem access"
```

### Task 6: Persistence inventory and persistence-write guard

**Files:**
- Create: `proofs/bastion-stage-a/src/persistence.rs`
- Create: `proofs/bastion-stage-a/src/capability/persistence.rs`
- Test: `proofs/bastion-stage-a/tests/persistence_guard.rs`

**Interfaces:**
- Produces: `PersistenceInventory::scan(&Capsule) -> InventoryResult`, `InventoryResult::{Complete(PersistenceSnapshot), Incomplete{errors, partial}}`, `PersistenceSnapshot::diff(&self, after) -> PersistenceDiff`, and `PersistenceCapability::create_entry(path, bytes, capsule) -> Result<ObservedPersistenceWrite, CapabilityError>`.

- [ ] **Step 1: Write failing persistence tests**

Assert configured persistence roots are enumerated recursively into metadata-only entries; adding a fixture entry appears in the snapshot diff; an unreadable/missing configured root returns `Incomplete`; a target outside configured persistence roots is denied; symlink escape is denied.

- [ ] **Step 2: Run tests and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test persistence_guard`

Expected: FAIL.

- [ ] **Step 3: Implement configured-root inventory and write adapter**

Stage A reports only configured-root coverage. Each inventory entry includes path, file type, size, modified timestamp when available, and content hash for regular files; it does not ingest file contents into the report.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test persistence_guard`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/persistence.rs proofs/bastion-stage-a/src/capability/persistence.rs proofs/bastion-stage-a/tests/persistence_guard.rs
git commit -m "feat(bastion): add persistence inventory guard"
```

### Task 7: Brokered network egress allowlist

**Files:**
- Create: `proofs/bastion-stage-a/src/capability/network.rs`
- Test: `proofs/bastion-stage-a/tests/network_guard.rs`

**Interfaces:**
- Produces: `NetworkCapability<T: NetworkTransport>::request(url, capsule, transport) -> Result<ObservedNetwork, CapabilityError>` and trait `NetworkTransport::send(&self, normalized: &Url) -> Result<TransportObservation, TransportError>`.

- [ ] **Step 1: Write failing network guard tests**

With a fake transport, assert exact approved origin is allowed; unapproved host is denied before `send` is invoked; `https://allowed.example@evil.example/` is denied; mixed-case approved host normalizes correctly; explicit unexpected port is denied; fake redirect observation to an unapproved origin is treated as blocked/not verified rather than accepted.

- [ ] **Step 2: Run tests and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test network_guard`

Expected: FAIL.

- [ ] **Step 3: Implement URL normalization and origin matching using the `url` crate**

Allowlist entries are normalized `scheme://host[:port]` origins. Stage A does not perform public Internet calls in tests.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test network_guard`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/capability/network.rs proofs/bastion-stage-a/tests/network_guard.rs
git commit -m "feat(bastion): gate agent network egress"
```

### Task 8: Security broker orchestrating policy, leases, capabilities, and ledger phases

**Files:**
- Create: `proofs/bastion-stage-a/src/broker.rs`
- Test: `proofs/bastion-stage-a/tests/broker_phases.rs`

**Interfaces:**
- Consumes: policy, lease store, ledger, and capability adapters from Tasks 2–7.
- Produces: `SecurityBroker::execute(request, lease_id, operation) -> Result<BrokerOutcome, BrokerError>` and `BrokerOutcome::{Blocked{reason}, Observed{evidence}, Verified{evidence}, ApprovalRequired{reason}}`.

- [ ] **Step 1: Write failing broker phase tests**

Assert denied secret read writes exactly `intended -> blocked`; denied persistence writes `intended -> blocked`; expired/revoked lease blocks before capability execution; allowed project read writes `intended -> authorized -> attempted -> observed`; no action becomes `verified` until an explicit verifier returns non-empty evidence; a verifier failure records `failed` rather than `verified`.

- [ ] **Step 2: Run tests and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test broker_phases`

Expected: FAIL.

- [ ] **Step 3: Implement `SecurityBroker` with deterministic ordering**

The broker is the only Stage A path that may convert an `ActionRequest` into capability execution. Capability adapters do not grant their own permission.

- [ ] **Step 4: Run broker tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test broker_phases`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/broker.rs proofs/bastion-stage-a/tests/broker_phases.rs
git commit -m "feat(bastion): orchestrate verified security execution"
```

### Task 9: Adversarial Stage A proof harness and machine-readable report

**Files:**
- Create: `proofs/bastion-stage-a/src/proof.rs`
- Create: `proofs/bastion-stage-a/src/bin/bastion-proof.rs`
- Create: `proofs/bastion-stage-a/fixtures/attack/instruction.txt`
- Create: `proofs/bastion-stage-a/fixtures/project/README.md`
- Test: `proofs/bastion-stage-a/tests/attack_proof.rs`

**Interfaces:**
- Produces: `run_stage_a_proof(root: &Path) -> Result<ProofReport, ProofError>` and serializable `ProofReport` containing scenario ID, agent/run/project IDs, provenance hash for the untrusted instruction, action outcomes, ledger-chain status, before/after persistence summaries, containment receipt, and final `proof_passed: bool`.

- [ ] **Step 1: Write the failing end-to-end proof test**

The fixture agent sequence must attempt: one allowed project read, one protected-secret read, one persistence creation, and one unauthorized network request. Assert the legitimate read succeeds, all three malicious actions are blocked, the persistence diff contains no unauthorized new entry, the ledger chain verifies, containment revokes the lease, and `proof_passed == true` only when every invariant holds.

- [ ] **Step 2: Run proof test and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test attack_proof -- --nocapture`

Expected: FAIL.

- [ ] **Step 3: Implement the proof harness and CLI**

CLI command:

```bash
cargo run --manifest-path proofs/bastion-stage-a/Cargo.toml --bin bastion-proof -- --output /tmp/bastion-stage-a-proof.json
```

The fixture's malicious instruction is treated as provenance only; it is not executed as shell code.

- [ ] **Step 4: Run the proof test and CLI**

Expected test: PASS.

Expected report: JSON contains `proof_passed: true`, three blocked adversarial action outcomes, one allowed project action, `ledger_chain: "valid"`, `persistence_status: "complete_no_unauthorized_change"`, and a containment receipt.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/proof.rs proofs/bastion-stage-a/src/bin proofs/bastion-stage-a/fixtures proofs/bastion-stage-a/tests/attack_proof.rs
git commit -m "feat(bastion): prove hostile agent containment loop"
```

### Task 10: Dedicated CI gate and Stage A operator documentation

**Files:**
- Create: `.github/workflows/bastion-stage-a.yml`
- Create: `proofs/bastion-stage-a/README.md`

**Interfaces:**
- Consumes: completed Stage A crate and proof CLI.
- Produces: CI gate that runs formatting, Clippy with warnings denied, all Stage A tests, and the proof harness; README clearly limits coverage claims.

- [ ] **Step 1: Add a CI workflow that installs stable Rust and runs the proof gate**

Required commands:

```bash
cargo fmt --manifest-path proofs/bastion-stage-a/Cargo.toml -- --check
cargo clippy --manifest-path proofs/bastion-stage-a/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml
cargo run --manifest-path proofs/bastion-stage-a/Cargo.toml --bin bastion-proof -- --output /tmp/bastion-stage-a-proof.json
```

Then assert the report contains `"proof_passed": true`.

- [ ] **Step 2: Add README operator documentation**

Document: what the proof demonstrates; exact command; threat fixture; supported persistence coverage; explicit non-claims; interpretation of the report; relationship to Perception; statement that no model participates in enforcement.

- [ ] **Step 3: Run the complete gate locally**

Run the four commands from Step 1.

Expected: all PASS with no Clippy warnings.

- [ ] **Step 4: Confirm existing Perception CI remains green**

Run:

```bash
npm test
npm run test:sovereignty
npm run build
```

Expected: all PASS; Bastion proof code has no imports into production TypeScript/Supabase code.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/bastion-stage-a.yml proofs/bastion-stage-a/README.md
git commit -m "ci(bastion): gate Stage A security proof"
```

## Self-Review Results

- **Spec coverage:** Stage A identity, Capsule scope, deterministic policy, temporary authority, protected filesystem, persistence inventory, network egress, execution receipts, containment, attack provenance, and proof report are each assigned to a task. Deep OS telemetry, desktop UI, GitHub credential brokering, cloud controls, team/enterprise management, and native tamper resistance remain intentionally outside Stage A per the spec.
- **Step scan:** Each implementation task has one red test step, one minimal implementation step, one verification step, and one commit boundary. No task requires changing production Perception runtime behavior.
- **Type consistency:** `PermissionLevel`, `ExecutionPhase`, `ActionRequest`, `Capsule`, `LeaseState`, `PolicyDecision`, `SecurityBroker`, and `ProofReport` are defined once and consumed by later tasks under those exact names.
- **Review Focus:** symlink escape, URL confusion, expired/revoked leases, ledger corruption, and incomplete persistence scans are pinned to Tasks 5, 7, 4/8, 3, and 6 respectively.
- **Proportion:** This plan implements only Stage A. Later stages require separate approved plans rather than expanding this proof into a monolith.
