# PERCEPTION ordinary web SEARCH — guest-first V0 contract

Status: **review-only**, prepared November 26, 2026. No search provider was activated, no network requests made, no real results returned, and nothing is in production as a result of this branch.

## Locked product decision

Search should work like a **regular web search engine**. A visitor enters a query and receives a ranked list of clickable source links, titles and meaningful snippets without creating an account. A clearly identified **Analyze with PERCEPTION** action is optional *after* results appear. It is never required to see ordinary results. Advanced AI work and saving Project World may require an account with its own permissions and spend gates.

The existing DISCOVER / PERCEIVE / SEARCH visual identity and plasma interaction remain. The SEARCH input should default to standard link results; no second "choose a mode" screen, empty AI task planning, or mandatory Project World. "No results" and provider failures must be honest, never replaced by fabricated examples.

## What this branch actually adds

- `src/lib/web-search-contract.ts`: pure, provider-neutral, deterministic input and result normalization. Query length cap; HTTPS domain-only source URLs; no user/password-bearing/local links; duplicate removal; rank order; optional publication date only when supplied; retrieval time supplied by the calling service.
- `src/lib/web-search-contract.test.ts`: offline tests for normal anonymous inputs, unsafe URLs, no made-up citations, empty output, limits, and optional analysis.
- `src/WebSearchResults.tsx` + `src/web-search-results.css`: stand-alone, reusable presentation of real provider-returned links/snippets and a separately wired, optional Perception analysis button; **not yet mounted in the live page**.
- `src/WebSearchResults.test.tsx`: SSR checks for ordinary clickable links, optional analysis, empty states and HTML escaping.
- No production UI wiring, API endpoint, API key, datastore, model invocation, automated provider spend, or auth/RLS changes. These tests validate only the contract/presentation, not a working web-search product.

## Required implementation order after the contract

1. **Server-side provider adapter, no secret in browser**. Evaluate Brave Web Search first for an independent conventional ranked-link index, with Tavily as a separate research/search alternative (its existing signed-in anticipatory pre-search is not a public results endpoint). Avoid Google's discontinued Custom Search JSON API for a new product. Compare provider latency, source quality, allowed display/caching/redistribution rights and real per-query price before choosing. Do not activate paid/credit-bearing provider access without specific approval.
2. **Anonymous abuse and spend control**. Server-enforced rate and concurrency limits, query bounds, caching only where terms permit, deterministic short timeouts, backoff, privacy boundaries, request metering and total spend hard stop. Keep public retrieval distinct from private Project World; never grant anonymous users privileged operations. Approval required for production permission changes and billing.
3. **Guest-first results UI**. SEARCH submits once, shows loading/empty/retry states, title, HTTPS original link, domain, short snippet, provenance and published date only when supplied. Clicking a source navigates normally. A second action `Analyze with PERCEPTION` requests an opt-in grounded synthesis, clearly separate from ordinary search and with authorization/cost gates. Account optional for saved research, workspaces and agent execution.
4. **Real offline/preview test and user acceptance**. Test a mocked provider (clearly labeled fixture) in branch/preview, then an explicitly approved provider sandbox. Verify actual output before public release; do not label fixtures as live search.
5. **Release only after explicit approval** and live browser checks on desktop, iPhone/Safari, direct URL, repeat searches, expired tokens, slow/error providers, traffic spikes and rollback.

## Search quality scoreboard — targets, not measured performance

- Task completion: at least 90% of held-out navigational/evergreen queries return a user-clickable relevant top-five link. **Proposed target, no benchmark results collected.**
- Citation integrity: 100% displayed links resolve to provider-returned URLs; zero fabricated titles, dates, or citations. Enforce by contract tests plus live checks.
- Speed: proposed p50 under 1.2 sec and p95 under 3 sec from Enter to first usable link in staged test conditions. Track device/network separately; no current measurements.
- Retention: monitor anonymous repeat searches, D1/D7/D30 returning search users and query reformulation rates without unnecessary personal tracking. Establish actual baseline before setting growth claims.
- Economics: monitor server requests/provider bill vs actual successful useful searches and retention. No "billionaire" valuation, user count, market share or revenue promise without externally verified results.

## Initial evaluation set

10 ordinary navigational queries, 10 evergreen factual queries, 10 time-sensitive or local queries, 10 ambiguity/contradiction cases, and 10 provider-outage/invalid-source fixtures, held out from tuning. Measure top-five relevance, source freshness, unsafe-link rejection, useful clicks, empty results, p50/p95, errors and cost. A passing unit test alone is not user-complete SEARCH.

## Primary source and repository references

- [Brave Search Web API documentation](https://api-dashboard.search.brave.com/documentation/services/web-search) — provider candidate, not selected/activated.
- [Tavily pricing and API documentation](https://www.tavily.com/pricing) — existing provider candidate, different pre-search function.
- [Google Custom Search JSON API](https://developers.google.com/custom-search/v1/overview) — closed to new users, scheduled discontinuation January 1, 2027.
- [PERCEPTION Search Engineer #95](https://github.com/DopestT/perception-ai/issues/95) and [Guest starter PR #118](https://github.com/DopestT/perception-ai/pull/118). PR #118 is an unsaved offline starting checklist, **not** a live web-search implementation.

No changes to LMTYAI, NETIZENS, VCF, Angels, Blue Tsunami, AEGENT, or AIrwave.
