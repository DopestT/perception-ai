# Bastion Intrusion Defense Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Bastion Stage A proof package with a bounded adversary simulator that continuously exercises approved intrusion behaviors, detects and correlates the attempts, automatically contains the simulated attacker, verifies recovery, and proves that the simulator cannot escape its authorized Test Range.

**Architecture:** Build on the isolated Rust package at `proofs/bastion-stage-a/`. The attacker side is split into an `AdversaryPlanner` and a deterministic `AdversaryHarness`: a planner may select only registered technique IDs, while the harness validates every action against an immutable Test Range before invoking existing Bastion capabilities. Normalized security events feed deterministic detectors and a correlator; response policy can tighten state and revoke leases; a recovery verifier is the only path back to `TRUSTED`.

**Tech Stack:** Rust stable, edition 2021; reuse the Stage A crate dependencies (`serde`, `serde_json`, `sha2`, `uuid`, `time`, `thiserror`, `url`, `tempfile`). Optional model-backed planning is behind a trait and feature boundary; CI uses the deterministic planner and never requires public Internet access.

**Spec:** `docs/superpowers/specs/2026-10-23-bastion-intrusion-defense-design.md`

**Prerequisite plan:** `docs/superpowers/plans/2026-10-23-bastion-stage-a-proof-loop.md` Tasks 1–8 (model, policy, ledger, leases/containment, filesystem guard, persistence inventory, network guard, broker/orchestration interfaces).

## Global Constraints

- Adversary execution requires a valid, unexpired `TestRange`; no range means no execution.
- The adversary planner may select registered technique IDs only; it never receives arbitrary shell, raw socket, exploit, or filesystem execution primitives.
- Stage A runs only against local disposable fixtures and fake transports; no public Internet access and no third-party targets.
- All canary secrets/credentials are synthetic and nonfunctional.
- Deterministic Bastion policy remains authoritative even when an AI planner is enabled.
- A planner may change technique order/selection but may not expand the technique catalog, modify Test Range scope, disable protections, or grant itself authority.
- Containment may automatically tighten/revoke authority; it does not perform destructive remediation.
- `TRUSTED` can only be restored by deterministic recovery verification with evidence.
- Preserve Perception/Bastion execution phases and P0–P3 permission names from the parent plan.
- Never persist secret values, arbitrary file contents, prompts containing real credentials, or model hidden reasoning into reports/ledgers.
- Rust crate root remains `#![forbid(unsafe_code)]`.

## Review Focus

- **Range escape by path/origin aliasing:** simulator targets must be normalized before scope checks; Task 1 pins this.
- **Planner injection/self-expansion:** unregistered technique IDs or malformed model output must be rejected; Task 2 pins this.
- **Detection bypass through event order:** correlation must tolerate legitimate interleaving without merging unrelated runs; Task 4 pins this.
- **Containment race:** an action attempted after containment/revocation must fail before capability execution; Task 5 pins this.
- **False recovery:** missing inventory coverage, corrupt ledger, active leases, or unresolved unauthorized deltas must prevent `TRUSTED`; Task 6 pins this.

---

### Task 1: Immutable Test Range and registered technique catalog

**Files:**
- Create: `proofs/bastion-stage-a/src/adversary/mod.rs`
- Create: `proofs/bastion-stage-a/src/adversary/range.rs`
- Create: `proofs/bastion-stage-a/src/adversary/catalog.rs`
- Test: `proofs/bastion-stage-a/tests/adversary_range.rs`

**Interfaces:**
- Consumes: `Capsule`, `PermissionLevel`, normalized path/origin helpers from the base Stage A plan.
- Produces: `TestRange`, `TechniqueId`, `TechniqueDefinition`, `TechniqueCatalog`, `RangeDecision`, `TestRange::validate_target(...)`.

- [ ] **Step 1: Write the failing Test Range contract tests**

Assert a range carries `range_id`, `project_id`, allowed fixture roots, persistence roots, fake origins, allowed technique IDs, `max_permission`, `approved_at`, and `expires_at`. Test that project mismatch, expired ranges, canonical path escape, origin mismatch, and unknown technique IDs all deny.

- [ ] **Step 2: Run and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test adversary_range`

Expected: FAIL because the adversary range/catalog modules do not exist.

- [ ] **Step 3: Implement the immutable range and catalog types**

Register exactly these Stage A technique IDs:

`TA-SECRET-READ`, `TA-PERSISTENCE-CREATE`, `TA-EGRESS-UNAPPROVED`, `TA-CROSS-PROJECT-READ`, `TA-EXPIRED-LEASE`, `TA-REVOKED-LEASE`, `TA-PROMPT-HIJACK`, `TA-CANARY-TOUCH`.

Each definition carries a required capability, maximum permission, and fixture-target kind; it does not carry arbitrary commands.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test adversary_range`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/adversary proofs/bastion-stage-a/tests/adversary_range.rs
git commit -m "feat(bastion): add bounded adversary test ranges"
```

### Task 2: Adversary planner boundary and deterministic harness

**Files:**
- Create: `proofs/bastion-stage-a/src/adversary/planner.rs`
- Create: `proofs/bastion-stage-a/src/adversary/harness.rs`
- Test: `proofs/bastion-stage-a/tests/adversary_planner.rs`

**Interfaces:**
- Consumes: `TestRange`, `TechniqueCatalog`, `TechniqueId` from Task 1.
- Produces: trait `AdversaryPlanner::plan(&self, context: &PlannerContext) -> Result<ScenarioPlan, PlannerError>`, `DeterministicPlanner`, `BoundedPlannerOutput`, and `AdversaryHarness::validate_plan(&ScenarioPlan, &TestRange, &TechniqueCatalog) -> Result<ValidatedPlan, HarnessError>`.

- [ ] **Step 1: Write failing planner/harness tests**

Assert the deterministic planner can produce a multi-technique scenario; unknown technique ID is rejected; a plan referencing another project/range is rejected; duplicate/reordered known techniques remain valid; oversized plan length is rejected; malformed optional model output is rejected rather than coerced.

- [ ] **Step 2: Run and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test adversary_planner`

Expected: FAIL.

- [ ] **Step 3: Implement planner trait and harness validation**

Set `MAX_STAGE_A_TECHNIQUES_PER_RUN = 16`. The harness accepts only catalog IDs and immutable range identity. No planner receives an executor or direct capability object.

Define a future-facing `BoundedModelPlanner` adapter boundary that accepts already-normalized JSON technique selections; Stage A CI does not call a model provider.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test adversary_planner`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/adversary/planner.rs proofs/bastion-stage-a/src/adversary/harness.rs proofs/bastion-stage-a/tests/adversary_planner.rs
git commit -m "feat(bastion): bound adversary planning and execution"
```

### Task 3: Normalized security-event stream and deterministic detectors

**Files:**
- Create: `proofs/bastion-stage-a/src/intrusion/mod.rs`
- Create: `proofs/bastion-stage-a/src/intrusion/event.rs`
- Create: `proofs/bastion-stage-a/src/intrusion/detect.rs`
- Test: `proofs/bastion-stage-a/tests/intrusion_detection.rs`

**Interfaces:**
- Produces: `SecurityEvent`, `SecurityEventKind`, `Finding`, `FindingKind`, and `detect(event: &SecurityEvent) -> Vec<Finding>`.
- Event/finding records contain IDs/hashes/metadata only; never secret or arbitrary file contents.

- [ ] **Step 1: Write failing detector tests**

Cover normalized events for protected-secret attempt, unauthorized persistence attempt, unauthorized egress, cross-project access, revoked/expired lease use, canary touch, permitted project operation, and incomplete persistence scan.

Assert each sensitive event emits the expected finding and an allowed project operation emits no intrusion finding.

- [ ] **Step 2: Run and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test intrusion_detection`

Expected: FAIL.

- [ ] **Step 3: Implement event and finding types plus pure detectors**

Required finding names:

`forbidden_secret_attempt`, `unauthorized_persistence_attempt`, `unauthorized_egress_attempt`, `cross_project_attempt`, `credential_after_expiry`, `credential_after_revocation`, `canary_access`, `incomplete_recovery_scan`.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test intrusion_detection`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/intrusion proofs/bastion-stage-a/tests/intrusion_detection.rs
git commit -m "feat(bastion): normalize and detect intrusion events"
```

### Task 4: Attack-chain correlation and security-state machine

**Files:**
- Create: `proofs/bastion-stage-a/src/intrusion/correlate.rs`
- Create: `proofs/bastion-stage-a/src/intrusion/state.rs`
- Test: `proofs/bastion-stage-a/tests/intrusion_correlation.rs`

**Interfaces:**
- Consumes: `SecurityEvent`, `Finding` from Task 3.
- Produces: `IntrusionChain`, `SecurityState::{Trusted, Changed, Suspicious, Contained, RecoveryRequired}`, `Correlator::ingest(...)`, and `transition_security_state(...)`.

- [ ] **Step 1: Write failing correlation/state tests**

Assert three distinct denied sensitive capability classes for one `run_id` correlate into `multi_stage_intrusion_chain`; findings from different agents/runs do not merge; canary touch escalates directly to `Contained`; one low-severity anomaly becomes `Suspicious`; `Contained -> Trusted` is invalid without a recovery receipt.

- [ ] **Step 2: Run and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test intrusion_correlation`

Expected: FAIL.

- [ ] **Step 3: Implement bounded correlation and explicit state transitions**

Use agent ID + run ID + project ID as the primary correlation key. Use a fixed Stage A correlation window supplied by the caller so tests control time; do not read the wall clock inside correlation logic.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test intrusion_correlation`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/intrusion/correlate.rs proofs/bastion-stage-a/src/intrusion/state.rs proofs/bastion-stage-a/tests/intrusion_correlation.rs
git commit -m "feat(bastion): correlate attack chains and security state"
```

### Task 5: Canary resources and automatic containment policy

**Files:**
- Create: `proofs/bastion-stage-a/src/intrusion/canary.rs`
- Create: `proofs/bastion-stage-a/src/intrusion/respond.rs`
- Test: `proofs/bastion-stage-a/tests/intrusion_response.rs`

**Interfaces:**
- Consumes: `Finding`, `IntrusionChain`, `LeaseStore`, containment interfaces from the base plan.
- Produces: `CanaryRegistry`, `ResponseDecision::{Observe, EscalateSuspicious, Contain}`, `evaluate_response(...)`, and `apply_containment(...) -> ContainmentReceipt`.

- [ ] **Step 1: Write failing response tests**

Use synthetic nonfunctional canaries. Assert canary touch => contain; unauthorized persistence => contain; revoked-lease use => contain; three-class attack chain => contain; ordinary denied file mistake alone does not automatically contain; containment revokes active leases; a request submitted after containment is denied before its capability adapter runs.

- [ ] **Step 2: Run and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test intrusion_response`

Expected: FAIL.

- [ ] **Step 3: Implement response policy as versioned deterministic rules**

Rules tighten authority only. Do not delete files, rotate real credentials, or perform destructive remediation in Stage A.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test intrusion_response`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/intrusion/canary.rs proofs/bastion-stage-a/src/intrusion/respond.rs proofs/bastion-stage-a/tests/intrusion_response.rs
git commit -m "feat(bastion): contain detected intrusion chains"
```

### Task 6: Evidence-backed recovery verifier

**Files:**
- Create: `proofs/bastion-stage-a/src/recovery.rs`
- Test: `proofs/bastion-stage-a/tests/recovery.rs`

**Interfaces:**
- Consumes: before/after `PersistenceSnapshot`, scan completeness, `Ledger::verify_chain`, `LeaseStore`, containment receipt, security state.
- Produces: `RecoveryCheck`, `RecoveryReceipt`, and `verify_recovery(input: RecoveryInput) -> Result<RecoveryReceipt, RecoveryError>`.

- [ ] **Step 1: Write failing recovery tests**

Assert recovery fails when the persistence scan is incomplete; when an unauthorized persistence delta remains; when any attacker lease remains active; when ledger integrity fails; or when the containment receipt does not match the target agent. Assert recovery passes only when all required checks pass and produces evidence references for every check.

- [ ] **Step 2: Run and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test recovery`

Expected: FAIL.

- [ ] **Step 3: Implement the verifier and guarded `Contained -> Trusted` transition**

`RecoveryReceipt.passed == true` is required to restore `Trusted`. No AI/model field appears in the pass predicate.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test recovery`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/recovery.rs proofs/bastion-stage-a/tests/recovery.rs
git commit -m "feat(bastion): verify intrusion recovery before trust"
```

### Task 7: End-to-end adaptive adversary proof harness

**Files:**
- Create: `proofs/bastion-stage-a/src/bin/intrusion-proof.rs`
- Create: `proofs/bastion-stage-a/tests/intrusion_proof.rs`
- Create: `proofs/bastion-stage-a/fixtures/untrusted/agent-task.txt`
- Create: `proofs/bastion-stage-a/fixtures/scenarios/stage-a-intrusion.json`
- Modify: `proofs/bastion-stage-a/Cargo.toml`

**Interfaces:**
- Consumes: all previous tasks plus existing brokered filesystem/network/persistence capabilities.
- Produces: `IntrusionProofReport` JSON with range/scenario IDs, technique sequence, prevention results, findings, chain IDs, containment receipt, persistence diff, ledger-chain result, recovery receipt, final state, and explicit coverage statement.

- [ ] **Step 1: Write the failing end-to-end proof test**

Create a disposable range with allowed project file, protected synthetic secret, cross-project fixture, persistence fixture root, fake allowed/unapproved origins, and a canary. Execute the scenario through the harness.

Assert:

- legitimate project file access succeeds;
- forbidden secret read is blocked;
- persistence creation is blocked;
- unapproved egress is blocked before fake transport execution;
- cross-project access is blocked;
- canary touch is detected and causes containment;
- post-containment action is blocked;
- no unauthorized persistence delta survives;
- ledger chain verifies;
- recovery passes;
- final state is `TRUSTED` only after the recovery receipt;
- report contains no synthetic secret value.

- [ ] **Step 2: Run and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test intrusion_proof`

Expected: FAIL.

- [ ] **Step 3: Implement the `intrusion-proof` orchestration binary**

The binary uses the deterministic planner by default. `--report <path>` writes JSON. It must refuse a scenario/range with public or unregistered targets.

- [ ] **Step 4: Run the full Stage A crate test suite and proof binary**

Run:

```bash
cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml
cargo run --manifest-path proofs/bastion-stage-a/Cargo.toml --bin intrusion-proof -- --report /tmp/bastion-intrusion-proof.json
```

Expected: all tests PASS; proof exits 0; report final state is `TRUSTED` with a passed recovery receipt and explicit local-fixture-only coverage.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a
git commit -m "feat(bastion): prove intrusion prevention containment and recovery"
```

### Task 8: CI intrusion-assurance gate and optional bounded AI-planner contract

**Files:**
- Create: `proofs/bastion-stage-a/src/adversary/model_adapter.rs`
- Test: `proofs/bastion-stage-a/tests/model_planner_contract.rs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `parse_bounded_plan(json, range, catalog) -> Result<ScenarioPlan, PlannerError>`. It parses only a structured list of registered technique IDs and bounded rationale strings; it does not make a provider call itself.

- [ ] **Step 1: Write failing bounded model-output tests**

Assert valid registered IDs parse; unknown IDs fail; additional fields requesting commands/URLs/paths are ignored or rejected according to a fixed schema; output attempting to change `range_id` fails; malformed JSON fails closed.

- [ ] **Step 2: Run and confirm failure**

Run: `cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml --test model_planner_contract`

Expected: FAIL.

- [ ] **Step 3: Implement the bounded adapter and add CI commands**

CI runs:

```bash
cargo test --manifest-path proofs/bastion-stage-a/Cargo.toml
cargo run --manifest-path proofs/bastion-stage-a/Cargo.toml --bin intrusion-proof -- --report bastion-intrusion-proof.json
```

No API key or Internet dependency is permitted for the gate. A future model provider may supply JSON to the adapter during an explicitly authorized demo, but the deterministic harness remains controlling.

- [ ] **Step 4: Run local verification equivalent to CI**

Expected: all Rust tests pass; intrusion proof exits 0; ordinary Perception `npm test` and `npm run build` remain unchanged/passing.

- [ ] **Step 5: Commit**

```bash
git add proofs/bastion-stage-a/src/adversary/model_adapter.rs proofs/bastion-stage-a/tests/model_planner_contract.rs .github/workflows/ci.yml
git commit -m "ci(bastion): gate bounded intrusion assurance proof"
```

## Final Verification

- [ ] Run `cargo fmt --manifest-path proofs/bastion-stage-a/Cargo.toml -- --check`.
- [ ] Run `cargo clippy --manifest-path proofs/bastion-stage-a/Cargo.toml --all-targets -- -D warnings`.
- [ ] Run the complete Bastion Rust test suite.
- [ ] Run both the base Stage A proof and the intrusion proof.
- [ ] Inspect generated reports and confirm no fixture secret values or arbitrary file contents are present.
- [ ] Confirm all adversary fixtures use local temp paths/fake transports only.
- [ ] Run repository `npm test` and `npm run build` to prove no Perception regression.
- [ ] Review the final diff specifically for any route that lets a planner bypass `TestRange`, `TechniqueCatalog`, policy, lease, or containment checks.

## Execution Order

Implement the base Stage A proof plan first through the shared broker/capability layer, then execute Tasks 1–8 above. Do not add deeper OS-native intrusion instrumentation until this controlled end-to-end loop is green; that belongs to the later native-endpoint plan.
