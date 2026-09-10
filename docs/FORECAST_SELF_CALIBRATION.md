# Perception FORECAST — Self-Calibration

Goal: let Perception change forecast influence only when real resolved outcomes demonstrate that a model, provider, evidence type, or horizon deserves more or less weight.

Runtime:

FORECAST → MODEL OUTPUTS → RESOLUTION → IMMUTABLE SCORE LEDGER → SHRINKAGE PROFILES → ADAPTIVE WEIGHTS → FUTURE CONSENSUS

## Scoring

Each resolved forecast records the latest pre-resolution probability from every independent `model_key` and computes its Brier score:

`(probability - outcome)^2`

Lower is better. Scores remain immutable after resolution.

Directional evidence (`support` / `contradict`) is scored separately for whether its direction matched the final outcome. Neutral evidence is preserved in the evidence ledger but does not receive directional-credit scoring.

## Hierarchical profiles

Perception learns performance at several levels:

- global model performance
- exact model key
- model family
- external market provider
- forecast horizon bucket
- evidence source kind

Market tickers can be unique, so provider and model-family profiles allow learning to generalize across individual contracts.

## Anti-overfitting policy

The system starts at multiplier `1.00`.

Probabilistic profiles are shrunk toward a neutral Brier baseline of `0.25` using 12 virtual neutral samples. Directional evidence is shrunk toward 50% accuracy. The final runtime multiplier also retains a permanent neutral anchor and is bounded to `0.65–1.45` when applied.

A single lucky or unlucky forecast therefore cannot radically change future consensus.

The original neutral/base prior is never adaptively reweighted. It remains a weak fixed anchor.

## Write boundary

Adaptive weighting is applied inside `perception_record_forecaster_output_internal`, not independently by each worker. This ensures manual intelligence, AUTOPILOT, Kalshi, Polymarket, internal base rates, and future forecasters all use one calibration policy.

Each forecaster output records calibration metadata:

- base weight
- learned multiplier
- applied weight
- horizon bucket
- provider
- application timestamp

## Learning stages

- `cold_start`: fewer than 3 resolved forecasts
- `warming`: 3–19
- `calibrating`: 20–99
- `mature`: 100+

These stages are descriptive, not guarantees of accuracy. Calibration quality is judged by resolved performance, not by the stage label.

## Security

Users may read only their own calibration scores and profiles through RLS. Internal scoring and multiplier RPCs are service-only. The authenticated dashboard RPC exposes only the signed-in user's calibration state.
