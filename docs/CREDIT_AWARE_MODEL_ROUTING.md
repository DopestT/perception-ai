# Credit-aware model routing

Perception now treats model spend as a routing concern rather than a prompt-writing concern.

## Runtime rule

For low-risk work with deterministic or schema verification, the runtime starts with the cheapest configured target and escalates only when verification fails.

Default ladder:

1. local model endpoint, when configured
2. economy model
3. balanced model
4. deep model
5. deterministic fallback when no safe paid/local route is available

High-risk work is not forced downward simply to save credits. Automatic cost control can also be disabled, in which case the deepest configured target is preferred.

## Daily budget behavior

`perception_token_policies.daily_budget_usd` is evaluated before a model call.

- below 80%: normal governed lane
- 80%-99%: low-risk mechanically verifiable work may start one lane cheaper
- 100%+: paid models are blocked for low-risk work; local is allowed and otherwise the deterministic fallback is used

Budget pressure relies on recorded `estimated_cost_usd`. Configure per-model prices for meaningful dollar-budget enforcement.

## Verification and escalation

The Meaning Resolver is mechanically checked by structured JSON parsing against the resolver contract. A failed endpoint, missing output, or invalid JSON causes the resolver to try the next stronger configured candidate. Attempts and token usage are retained for audit.

## Persistence

Every resolver run records:

- selected provider and model
- routing strategy and attempts
- token counts, including cached and reasoning tokens when the provider reports them
- estimated cost and deep-model baseline when pricing is configured
- daily budget pressure
- an observed P0 model-routing entry in the Execution Ledger linked to token-usage evidence

## Configuration

The server-side environment supports `PERCEPTION_MODEL_ECONOMY`, `PERCEPTION_MODEL_BALANCED`, and `PERCEPTION_MODEL_DEEP` for OpenAI Responses API models.

Optional local or hosted OpenAI-compatible endpoints can be configured through `PERCEPTION_LOCAL_*` and `PERCEPTION_COMPAT_*`. The endpoint must be network-reachable from the Supabase Edge runtime. `chat_completions` and `responses` protocols are supported.

The legacy `PERCEPTION_MEANING_MODEL` remains an economy fallback so existing deployments continue to work.
