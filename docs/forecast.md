# Perception FORECAST

## Purpose

FORECAST is Perception's calibrated prediction intelligence layer. It estimates future outcomes, records uncertainty, identifies the evidence that would change a forecast, and learns from resolved outcomes.

FORECAST is not a wagering system. Any future real-money/event-contract layer must remain separate from the core forecasting engine.

## Canonical runtime

REALITY → SIGNALS → CAUSES → SCENARIOS → FORECAST → OBSERVE → SCORE → LEARN

## Core forecast object

Each forecast should preserve:

- question / event
- domain
- created_at
- target / resolution date
- probability
- confidence
- trend vs previous forecast
- supporting evidence
- contradicting evidence
- next signals to watch
- forecast review / expiry date
- source/model contributions
- scenario branches
- resolution status and eventual outcome

Historical probability snapshots are append-only. Updating a forecast creates a new snapshot; it never rewrites the original probability.

## Evidence scoring

Evidence is scored on:

- source reliability
- corroboration
- freshness
- independence
- specificity
- manipulation risk
- directness to the forecast question

Evidence must be classified as fact, inference, rumor, opinion, or signaling where possible.

## Ensemble

FORECAST should support independent contribution slots for:

- historical base rates
- time-series / quantitative models
- causal and agent reasoning
- crowd forecasts
- external prediction-market probabilities
- LLM forecasters
- domain-specialized forecasters

The system should display disagreement rather than averaging away meaningful conflict. Forecaster weights should become domain-specific and update from historical calibration.

## Scenario tree

The system should retain multiple futures instead of a single deterministic answer. Each branch has:

- scenario description
- probability
- assumptions
- trigger signals
- downstream consequences

## Counterfactual and surprise checks

For every important forecast, ask:

1. What evidence would make this forecast wrong?
2. What shared assumption could cause multiple models to fail together?
3. What low-probability event would materially change the outcome?

## Calibration

Resolved binary forecasts should be scored with Brier score first. Log loss can be added later. Calibration must be measurable by domain, forecast horizon, confidence band, source set, and model.

The system should report whether forecasts made at roughly 70%, 80%, 90%, etc. resolve at approximately those rates over time.

## Project World integration

FORECAST should append events including:

- `forecast.created`
- `forecast.updated`
- `forecast.resolved`
- `calibration.updated`

Forecasts should become part of Project World rather than a disconnected datastore.

## Initial UI

FORECAST becomes a fourth top-level experience mode alongside DISCOVER, PERCEIVE, and SEARCH.

Initial result card:

- Event
- Probability
- Confidence
- Trend
- Why / evidence count
- Strongest supporting evidence
- Strongest contradicting evidence
- Watch next
- Review / expiry date
- Historical calibration on comparable forecasts

When available, show these separately:

- Perception AI forecast
- crowd forecast
- external market-implied probability

A large disagreement between independent sources should surface as an investigation signal.

## MVP acceptance criteria

1. Signed-in users can select FORECAST and submit a binary, date-bounded forecast question.
2. Perception persists the forecast and its evidence snapshot.
3. Forecast updates preserve prior probabilities.
4. A forecast can later be resolved with a timestamped outcome.
5. Brier score updates after resolution.
6. Project World records forecast lifecycle events.
7. UI clearly separates AI, crowd, and external market probabilities when present.
8. No wagering functionality is required for MVP.
