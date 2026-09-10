# Perception FORECAST — Autonomous Intelligence Slice

Goal: turn a user question into a continuously auditable forecast without requiring a manual market ticker.

Runtime:

QUESTION → MARKET MATCH → PUBLIC EVIDENCE SCOUT → BASE RATE → MARKET MODELS → CONSENSUS → ADVERSARIAL CONFIDENCE CHECK → VERSION

Principles:

- No wagering or trade execution.
- External markets are signals, not truth.
- Every retrieved source and model output is timestamped.
- Latest-per-model consensus prevents one noisy model from flooding the ensemble.
- If no strong market match exists, Perception abstains from adding that signal.
- Public evidence discovery records source metadata and article claims as evidence, not as verified outcomes.
- Autonomous runs append evidence and forecast versions; prior history is never rewritten.
- Confidence is a function of model count, evidence strength and disagreement, not rhetorical certainty.
- Correlated market sources remain separately identifiable so future calibration can downweight families that move together.

Initial autonomous providers:

1. Kalshi public market data.
2. Polymarket public Gamma search/market data.
3. GDELT DOC 2.x public news discovery for recent contextual evidence.
4. Internal base-rate forecaster when enough similar resolved Perception forecasts exist.

This slice intentionally does not use a headline keyword heuristic as a high-weight directional forecaster. Market signals and resolved internal base rates may move probability; news evidence mainly improves context until a stronger evidence classifier is available.
