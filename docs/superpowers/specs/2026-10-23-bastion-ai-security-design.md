# Project Bastion — AI Security Control Plane + Persistence Guard

Date: 2026-10-23
Status: approved design
Owner: Legacy Works Ventures LLC
Relationship to Perception: standalone product powered by Perception's verification and execution model
Working name: Project Bastion

## Intent

Build an AI-era security platform that sits between humans, AI agents, and valuable systems. Bastion is not generic antivirus and does not claim to be literally “AI-proof.” Its job is to make consequential authority bounded, temporary, attributable, observable, and independently verified.

The product centers on four capabilities:

1. **Persistence Intelligence** — identify what can survive a reboot, logout, password reset, token rotation, agent shutdown, or apparent malware removal.
2. **Project Isolation** — constrain an AI agent to the files, repositories, credentials, tools, networks, and cloud resources required by one project.
3. **Verified Effects** — preserve Perception's distinction between intended, authorized, attempted, observed, and verified actions so agent claims do not become truth.
4. **Provable Recovery** — explain why Bastion believes an environment is clean after containment and remediation.

The defining promise is:

> AI can work. Nothing gets permanent control without you knowing.

## Product boundary

Bastion is a standalone LWV product. Perception supplies verification intelligence and an existing trust vocabulary; Bastion owns security authority and enforcement.

The core invariant is:

> Agents produce actions and evidence. Bastion controls authority. Perception determines what the evidence establishes.

Bastion must not become merely another Perception UI feature, and Perception must not become the endpoint enforcement mechanism.

## Trust model

Bastion inherits the current Perception permission classes and execution phases.

Permission classes:

- `P0` Observe — inspect/read within an allowed boundary.
- `P1` Draft — produce proposed artifacts with no external effect.
- `P2` Reversible Execute — bounded reversible action in delegated scope.
- `P3` Consequential Execute — publishing, spending, deleting, changing access/security, persistence creation, production deployment, secret export, or other material effects.

Execution phases:

`intended -> authorized -> attempted -> observed -> verified`

Failure phases remain `blocked`, `failed`, and `rolled_back`.

An agent's statement that an action succeeded is never sufficient evidence for `verified`.

## Deterministic boundary

The security AI is not the final authorization mechanism.

AI may classify, correlate, explain, prioritize, investigate, or escalate. Deterministic policy decides whether a requested capability is allowed, denied, requires stronger authorization, or triggers containment.

An AI result may raise risk. It may never lower a `P3` action into a less protected class or grant itself new authority.

## Agent identity

Every protected agent run receives a distinct execution identity containing at minimum:

- provider/application
- device identity
- user identity
- project identity
- run ID
- parent objective
- granted capabilities
- credential lease metadata
- creation time
- expiration time

Provider names such as “ChatGPT,” “Claude,” or “Codex” are not sufficient security identities by themselves.

## Project Capsules

Each protected project is represented as a Capsule. A Capsule defines the agent's allowed blast radius:

- filesystem roots
- repository identities
- secret classes
- network destinations
- cloud resources
- tools/capabilities
- AI identities
- maximum consequence level
- permission expiration
- production boundary
- persistence roots that must be monitored

Cross-project access is denied unless explicitly authorized.

## Execution gate

Every brokered consequential action follows this path:

1. record `intended`
2. identify actor, project, target, capability, and required permission level
3. evaluate deterministic Capsule policy
4. record `authorized` or `blocked`
5. if authorized, issue only the minimum temporary authority required
6. record `attempted`
7. execute through a bounded capability adapter
8. record the observed external result
9. independently verify the resulting state
10. record `verified` only when evidence supports the effect

## Persistence Guard

Persistence is a first-class security object.

Bastion must be able to inventory supported mechanisms that can retain or restore access, including progressively:

- startup programs/services/daemons
- scheduled tasks/login items
- browser/IDE extensions
- shell initialization hooks
- SSH authorization and deploy keys
- package and build hooks
- MCP servers and AI skills/plugins
- CI workflows
- OAuth grants and refresh credentials
- cloud roles/service identities/scheduled jobs
- AI memory or durable instruction surfaces

The first implementation does not claim OS-wide persistence coverage. It proves the contract using explicitly configured persistence roots and adapters, then deeper platform-specific adapters are added later.

## Persistence Graph

Discovered persistence becomes a graph of actors, mechanisms, credentials, and resources. The product should eventually answer:

- what survives a reboot?
- what survives a password reset?
- what survives a token rotation?
- what survives deleting the original malicious process?
- what paths still lead back to a protected project?

The user-facing hero action is **WHAT CAN SURVIVE?**

## Tamper resistance and owner control

Bastion should be difficult for an ordinary process or agent to disable, but it must never behave like a hidden rootkit.

The owner retains a documented removal/recovery path. Security-critical binaries and policy are signed. Unexpected silence from a protected endpoint is itself a security event.

A cloud outage must not silently disable local enforcement. Cached signed policy continues to apply and high-consequence operations fail closed when required authorization cannot be obtained.

## Policy monotonicity

Protection may be tightened automatically. Meaningful reductions in protection require stronger authorization.

Examples:

- deny/revoke capability: automatic
- contain agent: automatic when policy conditions are met
- grant new capability: authorization required
- disable Persistence Guard: strong owner authorization
- allow unrestricted shell: strong owner authorization
- disable Bastion: strong owner authorization

## Containment

Bastion needs an emergency `CONTAIN NOW` operation capable of:

- freezing brokered AI execution
- revoking Bastion-issued temporary credentials
- terminating active agent leases
- blocking protected-project egress through supported gateways
- marking the device/project untrusted
- preserving forensic evidence
- beginning a fresh persistence inventory

Containment and destructive remediation are separate operations.

## Recovery

Recovery is evidence-driven:

`contain -> inventory surviving authority -> revoke credentials -> remove unauthorized persistence -> restore known-good components -> rotate trust anchors -> rescan -> verify -> re-establish baseline`

The final product must answer: **Why does Bastion believe this device/project is clean?**

## Technical direction

- endpoint/security core: Rust
- deterministic typed policy
- append-oriented tamper-evident local event ledger
- local encrypted state using OS-protected keys
- privileged endpoint service kept intentionally small
- cloud control plane separated from the local enforcement path
- Perception used for evidence synthesis, risk reasoning, orchestration, and verification
- model providers treated as replaceable bounded processors
- temporary scoped credentials preferred over long-lived secrets exposed to agents

## Stage A proof loop

Stage A proves one adversarial scenario before attempting full EDR coverage.

Scenario: an AI coding agent is assigned to fix a repository issue. Untrusted project content attempts to manipulate the agent into:

1. reading a protected secret;
2. creating a persistent startup mechanism; and
3. contacting an unauthorized network destination.

Bastion must:

1. identify the agent run and Capsule;
2. deny the protected secret read;
3. deny persistence creation;
4. deny unauthorized egress;
5. record each action attempt with the Perception-compatible execution phases;
6. preserve provenance of the untrusted instruction;
7. show the attack chain in a machine-readable proof report;
8. confirm through a persistence re-scan that no supported unknown survival path was created; and
9. continue allowing legitimate project-scoped operations.

## Stage A success conditions

Stage A is successful only when automated tests prove:

- a protected agent cannot read a forbidden secret through a brokered filesystem capability;
- a protected agent cannot create a supported persistence entry without `P3` authorization;
- a protected agent cannot contact an unauthorized destination through the brokered network capability;
- allowed project files remain usable;
- every denied request produces an `intended` then `blocked` receipt;
- every successful reversible action follows the expected phase ordering and is not `verified` without evidence;
- persistence inventory before and after the attack shows no unauthorized survival path;
- containment revokes active temporary capability leases;
- disabling any optional AI risk scorer does not disable deterministic enforcement.

## Non-goals for Stage A

Stage A does not:

- replace SentinelOne, CrowdStrike, Defender, or a full EDR;
- claim kernel/firmware protection;
- claim complete Windows or macOS persistence coverage;
- ship enterprise fleet management;
- perform destructive automatic remediation;
- expose permanent production credentials to an AI agent;
- rely on prompts as a security boundary;
- use provider memory as authoritative state;
- allow model confidence to grant security permissions.

## Build sequence after Stage A

1. Stage A — proof loop: Capsule, policy gate, filesystem/network/persistence adapters, execution ledger, containment proof.
2. Stage B — desktop UX: protected projects, security states, approvals, activity, Persistence Graph, containment control.
3. Stage C — developer identity: GitHub integration, temporary credential broker, repository policies.
4. Stage D — cloud reach: cloud identities, production boundary, deployment controls.
5. Stage E — deep native endpoint: platform-specific telemetry, enforcement, and tamper resistance.
6. Stage F — team: organization policy, shared project controls, audit.
7. Stage G — enterprise: fleet, SIEM/SOC integration, compliance, managed response.

## Long-term moat

The defensible asset is the continuously updated security graph connecting:

`human -> device -> project -> agent -> objective -> process -> credential -> permission -> repository -> cloud resource -> network destination -> persistence mechanism -> action -> effect -> verification`

The product should ultimately answer questions conventional antivirus does not answer well:

- Which AI currently has a path to production?
- What changed after this agent ran?
- What can still regain access after credential rotation?
- Did containment actually remove the attacker's path back in?
- Can the AI complete its job without possessing the owner's long-lived credentials?

## Product principle

Do not make AI incapable of powerful work.

Make powerful work bounded, attributable, temporary, observable, reversible where possible, and verified afterward.
