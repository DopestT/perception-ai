# Project Bastion — Intrusion Defense + Adversary Validation

Date: 2026-10-23
Status: approved extension to Bastion architecture
Owner: Legacy Works Ventures LLC
Parent spec: `docs/superpowers/specs/2026-10-23-bastion-ai-security-design.md`

## Intent

Add intrusion prevention, detection, containment, and recovery validation as a first-class Bastion pillar. Bastion should not only constrain AI agents; it should continuously test whether its defenses actually stop attacker-like behavior and whether trust can be re-established after an intrusion attempt.

The defining loop is:

`simulate -> detect -> prevent -> contain -> investigate -> recover -> verify -> learn`

The attacker side may use AI for planning and variation, but **AI does not receive unrestricted offensive execution authority**. A deterministic adversary harness executes only approved, bounded simulation actions inside an explicitly registered Test Range.

## Why this is required

AI-era security creates two simultaneous problems:

1. a legitimate AI agent can be manipulated into dangerous actions through untrusted content, excessive authority, or compromised tools; and
2. an external attacker can use automation/AI to probe, adapt, establish persistence, steal credentials, and evade simplistic signature-only defenses.

Bastion therefore needs both an execution-policy layer and an intrusion-defense layer.

## Core product promise

> Bastion continuously proves that protected systems can resist, contain, and recover from approved adversary simulations without exposing arbitrary real-world targets to an autonomous attacker.

## Five intrusion functions

### 1. Prevent

Deny actions that violate deterministic policy before they produce effects. Initial prevention classes include:

- protected secret access;
- persistence creation without P3 authorization;
- unauthorized network egress;
- cross-project file access;
- expired/revoked credential use;
- privilege-boundary requests outside Capsule policy;
- execution paths not present in the approved capability catalog.

### 2. Detect

Observe and correlate security-relevant events even when prevention did not fire. Detection must distinguish an isolated low-risk event from an attack chain.

Initial normalized events include:

- process/action identity;
- project and agent identity;
- file/secret access request;
- persistence mutation request;
- network request;
- lease/credential use;
- policy decision;
- containment action;
- persistence inventory delta;
- verification result.

### 3. Contain

When a rule or correlated intrusion condition is satisfied, Bastion may automatically tighten protection:

- revoke Bastion-issued temporary leases;
- freeze the test agent/run;
- deny new brokered network access;
- deny new consequential actions;
- mark the device/project `CONTAINED`;
- preserve the evidence chain;
- start a fresh persistence inventory.

Containment is not destructive remediation.

### 4. Recover

Recovery rotates/revokes simulated authority, removes unauthorized test artifacts where safe, restores a known-good test baseline, and re-runs the relevant persistence and trust checks.

### 5. Verify

A system cannot return to `TRUSTED` because a model says the intrusion is over. Required deterministic checks must pass and their evidence must be attached to the recovery receipt.

## Adversary Controller

Bastion includes an **Adversary Controller** for defensive validation.

The controller may use an AI model to:

- choose from approved test techniques;
- vary order and timing;
- select different benign decoys/fixtures;
- attempt alternate paths after a blocked action;
- explain what it was trying to accomplish;
- generate new safe test scenarios from the approved action catalog.

The controller may not:

- execute arbitrary shell commands;
- scan arbitrary networks;
- target systems outside the registered Test Range;
- use real stolen credentials;
- deploy malware;
- disable Bastion protections;
- change its own Test Range or capability scope;
- create a new offensive primitive at runtime.

AI proposes the sequence. A deterministic harness validates and executes it.

## Test Range

Every adversary run requires an immutable `TestRange` identity.

Minimum fields:

- `range_id`
- owner/project identity
- approved filesystem roots
- synthetic secret locations
- approved persistence fixture roots
- approved sinkhole/mock network origins
- approved simulated identities/leases
- allowed adversary technique IDs
- maximum consequence level
- created/approved timestamps
- expiration

No range means no adversary execution.

Targets outside the range fail closed.

## Three validation modes

### Continuous Lab

Runs frequently against disposable/sandbox fixtures. This is where the adaptive attacker AI is allowed to explore the approved technique catalog most aggressively.

### Scheduled Staging

Runs against a production-like staging environment with stricter scope and cleanup requirements. No external third-party targets.

### Production Canary

Non-destructive only. Uses canary resources, synthetic credentials, harmless policy probes, and verification checks. No exploit delivery, destructive persistence, credential dumping, lateral movement, or arbitrary shell execution.

Stage A implements **Continuous Lab only**.

## Approved Stage A adversary techniques

Stage A uses safe simulations rather than real exploit code:

- `TA-SECRET-READ` — request a protected synthetic secret.
- `TA-PERSISTENCE-CREATE` — request creation of a fixture startup/persistence entry.
- `TA-EGRESS-UNAPPROVED` — request network access to a fake unapproved origin through the broker.
- `TA-CROSS-PROJECT-READ` — request a file outside the active Capsule.
- `TA-EXPIRED-LEASE` — attempt an otherwise allowed operation using expired authority.
- `TA-REVOKED-LEASE` — attempt use after containment revokes authority.
- `TA-PROMPT-HIJACK` — provide untrusted fixture content that asks an agent to perform one or more forbidden catalog actions.
- `TA-CANARY-TOUCH` — access a synthetic canary resource that legitimate workflows never need.

These are behavioral test cases, not exploit implementations.

## Attack chains

The adversary controller should be able to compose safe test techniques into chains such as:

`untrusted input -> secret request -> blocked -> alternate persistence request -> blocked -> alternate egress request -> blocked -> containment -> rescan -> recovery verification`

A successful defense report must preserve the chain so the user can understand what Bastion stopped and why.

## Intrusion state machine

Protected scopes use these security states:

- `TRUSTED`
- `CHANGED`
- `SUSPICIOUS`
- `CONTAINED`
- `RECOVERY_REQUIRED`

Rules:

- a high-confidence canary touch or forbidden multi-step chain may move directly to `CONTAINED`;
- a single low-confidence anomaly may move to `SUSPICIOUS`;
- containment invalidates prior trust;
- `TRUSTED` can only be restored by recovery verification;
- model output alone cannot restore trust.

## Detection architecture

Initial Stage A detection is deterministic and evidence-backed.

A detector consumes normalized security events and emits findings such as:

- `forbidden_secret_attempt`
- `unauthorized_persistence_attempt`
- `unauthorized_egress_attempt`
- `cross_project_attempt`
- `credential_after_revocation`
- `canary_access`
- `multi_stage_intrusion_chain`

A correlator groups events by agent/run/project and bounded time window. AI may later summarize/explain findings, but the triggering evidence is deterministic.

## Automatic response policy

Stage A response rules:

- any canary touch -> contain the agent immediately;
- any attempt to create persistence outside an explicitly approved P3 test action -> contain;
- use of a revoked lease -> contain;
- three distinct denied sensitive capabilities in one adversary run -> contain;
- scan/inventory failure after containment -> `RECOVERY_REQUIRED`;
- successful re-scan + no unauthorized persistence delta + all leases revoked + ledger chain valid -> eligible for recovery verification.

Thresholds are versioned policy, not model suggestions.

## Canary resources

Bastion should create synthetic resources that normal project work should never require, for example:

- fake API token metadata;
- fake private-key path;
- fake admin credential record;
- fake persistence target;
- fake internal hostname.

Touching a canary is useful because it converts ambiguous behavior into a strong signal without exposing a real secret.

Canary values must be nonfunctional.

## Proof report

Every adversary run produces a machine-readable report containing:

- range identity;
- scenario identity/version;
- controller decisions;
- attempted technique sequence;
- prevention decisions;
- detector findings;
- containment receipt;
- persistence before/after snapshots;
- ledger integrity result;
- recovery verification result;
- final security state;
- coverage statement describing what was and was not tested.

The report must never contain secret values or arbitrary file contents.

## Relationship to MITRE/OWASP

Future scenario metadata may map safe Bastion simulations to MITRE ATT&CK behaviors for coverage reporting. Bastion should model behavior rather than depend only on fixed malware signatures.

AI-agent scenarios should also map to prompt injection, excessive agency, tool misuse, identity/privilege abuse, and unexpected code-execution risks where applicable.

Framework mappings are descriptive metadata; they do not create authority.

## Safety boundary

Bastion's adversary system is a defensive assurance feature, not an autonomous offensive platform.

Hard invariants:

- explicit authorized Test Range required;
- no public Internet scanning in Stage A;
- no third-party targets;
- no real credential theft;
- no malware deployment;
- no arbitrary exploit generation/execution;
- no self-expansion of attack capability;
- no attack action executes merely because an AI requested it;
- all adversary actions use the same tamper-evident ledger as defensive actions.

## Stage A intrusion success conditions

Stage A intrusion defense is successful only when automated tests prove:

1. the simulator cannot target a path or origin outside its Test Range;
2. the adversary controller cannot introduce an unregistered technique;
3. each approved technique produces the expected normalized events;
4. protected-secret, persistence, cross-project, expired-lease, revoked-lease, and unapproved-egress attempts are prevented;
5. canary access triggers containment;
6. a composed multi-stage attack is correlated as one intrusion chain;
7. containment revokes active leases and prevents subsequent brokered actions;
8. the persistence re-scan cannot return `clean` when coverage is incomplete;
9. recovery cannot return `TRUSTED` until all required deterministic checks pass;
10. legitimate project-scoped work still succeeds before and after a completed recovery cycle;
11. all tests run without public Internet access;
12. disabling any optional AI planner leaves deterministic prevention, detection, containment, and recovery checks functional.

## Product principle

The attacker AI is allowed to be creative about **which approved test to try next**.

It is never allowed to be creative about **what systems it may attack or what offensive primitives it may execute**.
