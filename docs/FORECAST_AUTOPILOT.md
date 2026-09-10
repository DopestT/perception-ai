# Perception FORECAST AUTOPILOT

AUTOPILOT keeps open forecasts current after the user leaves the app.

Canonical loop:

CREATE → FIRST INTELLIGENCE RUN → SCHEDULE → REFRESH SIGNALS → RECOMPUTE → WATCH RESOLUTION → PROPOSE → HUMAN CONFIRM → SCORE → LEARN

## Scheduling

A Supabase `pg_cron` job runs every 30 minutes and calls a dedicated `forecast-autopilot` Edge Function through `pg_net`. The scheduler credential is generated outside source control, stored in Supabase Vault, and verified by SHA-256 against `perception_runtime_secret_hashes`.

The worker claims only due open forecasts. Each successful run schedules the next check adaptively:

- more than 90 days from deadline: every 24 hours
- 14–90 days: every 6 hours
- 2–14 days: every 3 hours
- within 2 days: every hour
- after the deadline while unresolved: every hour

Failures back off from 30 minutes up to 12 hours instead of hammering providers.

## Refresh behavior

AUTOPILOT refreshes previously matched Kalshi and Polymarket markets, re-attempts discovery when a provider is missing, rescans recent public GDELT evidence with duplicate suppression, and refreshes the internal empirical base-rate model when enough resolved analogs exist.

All model outputs and evidence remain append-oriented. Existing probability versions are never rewritten.

## Resolution safety

Forecast influence and forecast resolution use different thresholds. Markets may influence probability at moderate match quality, but a resolution candidate requires a materially stronger match.

AUTOPILOT never silently resolves a forecast. It can only create a `perception_forecast_resolution_proposals` record. The user confirms or dismisses that candidate in the interface.

Kalshi proposals require a finalized/settled market with an explicit YES or NO result. Polymarket proposals require a closed binary market with terminal outcome prices. A NO candidate is not proposed before the forecast deadline.

If independent terminal sources disagree, AUTOPILOT records a resolution conflict and abstains.

## UI

The FORECAST view displays:

- AUTOPILOT on/off state
- last and next scheduled checks
- failure/backoff state
- append-only probability history
- net probability movement
- pending resolution candidates and confidence

New forecasts automatically trigger their first autonomous intelligence run when the forecast result mounts. Manual RUN INTELLIGENCE remains available as an explicit refresh control.
