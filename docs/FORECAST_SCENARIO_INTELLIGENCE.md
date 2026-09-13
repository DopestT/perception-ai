# Perception FORECAST — Scenario Intelligence

Goal: stop a calibrated probability from collapsing uncertainty into one story.

Runtime extension:

`SIGNALS → CONSENSUS → SCENARIO TREE → FAILURE TESTS → OBSERVE → SCORE → LEARN`

## Scenario snapshots

Every forecast probability version can receive one immutable scenario set. The set stores the probability, confidence, model count, model disagreement, and evidence count that existed at that forecast version.

The first implementation keeps the binary forecast contract explicit:

- **YES branch** — probability equals the current calibrated consensus.
- **NO branch** — probability is the exact complement.

The more likely branch is marked `base`; the other remains visible as `alternate`. The branch analysis does not invent a second probability model and does not alter consensus.

Branch context is evidence-bounded:

- YES assumptions come from recorded supporting evidence.
- NO assumptions come from recorded contradicting evidence.
- Both branches inherit explicit watch signals as triggers.
- Downstream consequences describe what a verified resolution means without rewriting earlier forecast snapshots.

## Failure tests

Each scenario snapshot creates three explicit checks.

### Counterfactual

**What would make this wrong?**

Perception inspects the evidence pointing against the currently leading outcome. If none exists, the absence itself is surfaced as a high-risk blind spot rather than interpreted as confidence.

### Shared assumption / correlated failure

**Could the models fail together?**

A single model key is high risk. Multiple tightly clustered model keys still receive a correlated-failure warning because agreement is not the same as independence. Visible disagreement is treated as useful information, not noise to average away.

### Surprise

**What could arrive from outside the model?**

The system checks whether the forecast has explicit watch signals. No watch surface is high risk; one signal is still thin; multiple signals provide a better early-warning surface but never prove an outcome by themselves.

## Append-only rule

Scenario analysis is unique per `forecast_id + forecast_version`. A refresh for an already-analyzed version returns the existing snapshot. When probability/evidence changes and a new forecast version is created, a new scenario snapshot is eligible to be generated.

This preserves the state of the forecast's thinking at that moment and allows later inspection of how scenarios and blind spots changed over time.

## Truth boundary

Scenario intelligence is analytical evidence, not authoritative truth.

It may:

- expose alternate futures;
- surface missing disconfirming evidence;
- warn about correlated models;
- surface missing surprise/watch signals.

It may not:

- change `current_probability`;
- resolve a forecast;
- rewrite historical forecast versions;
- update Project World truth as though a scenario occurred.

A `forecast.scenarios.generated` event is appended for auditability.

## Security

Authenticated users can read only their own scenario sets, branches, and checks through RLS. Direct client writes are revoked. Generation runs through an authenticated, ownership-checked security-definer RPC.
