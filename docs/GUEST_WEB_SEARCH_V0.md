# PERCEPTION ordinary web SEARCH — guest-first V0 contract

Status: **review-only**, prepared November 26, 2026. The guest search UI and a fail-closed Vercel API route are now wired on this separate branch. No search provider was activated, no paid provider query was made, no real result was returned, and production remains unchanged. Preview requests will report unavailable until an approved quota migration, secret configuration, billing cap and release are completed.

## Locked product decision

Search should work like a **regular web search engine**. A visitor enters a query and receives a ranked list of clickable source links, titles and meaningful snippets without creating an account. A clearly identified **Analyze with PERCEPTION** action is optional *after* results appear. It is never required to see ordinary results. Advanced AI work and saving Project World may require an account with its own permissions and spend gates.

The existing DISCOVER / PERCEIVE / SEARCH visual identity and plasma interaction remain. The SEARCH input should default to standard link results; no second "choose a mode" screen, empty AI task planning, or mandatory Project World. "No results" and provider failures must be honest, never replaced by fabricated examples.

## What this branch actually adds

- `src/lib/web-search-contract.ts`: pure, provider-neutral, deterministic input and result normalization. Query length cap; HTTPS domain-only source URLs; no user/password-bearing/local links; duplicate removal; rank order; optional publication date only when supplied; retrieval time supplied by the calling service.
- `src/lib/web-search-contract.test.ts`: offline tests for normal anonymous inputs, unsafe URLs, no made-up citations, empty output, limits, and optional analysis.
- `src/WebSearchResults.tsx` + `src/web-search-results.css`: reusable view of genuine provider links/snippets and an optional Perception analysis button, now **mounted in the feature-branch App, not production**.
- `src/lib/guest-web-search-client.ts`: anonymous, no-credential, same-origin browser fetch with honest error states and response normalization.
- `src/lib/guest-web-search-service.ts`: Brave Web Search adapter; requires an atomic quota reservation before any paid API request, limits result count and duration, and does not fabricate sources.
- `api/search.ts`: Vercel `GET /api/search?q=...` handler; disabled by default, cross-site guarded, and no provider call until a real Supabase quota RPC approves the request. Needs separately approved server-only configuration.
- `src/App.tsx`: SEARCH is default first-view mode and submits independently of the sign-in wall/Project World. The button for deeper Perception research is optional and only prefills a separate explicit action.
- `src/WebSearchResults.test.tsx`, `src/lib/guest-web-search-service.test.ts` and `src/lib/guest-web-search-endpoint.test.ts`: SSR/offline tests for linked results, limit/authorization fail-closed, empty/error behavior and source escaping.
- `docs/GUEST_SEARCH_QUOTA_PROPOSAL.sql`: **unapplied proposal** for daily shared hard quotas; generate a real migration with the Supabase CLI and review security before deployment.
- No production UI, live search endpoint, API key, datastore change, model invocation, automated paid provider spend, or auth/RLS change. This is branch code and tests only, not a working public search release.

## Remaining release gates after branch code

1. **Provider activation, no secret in browser**. A Brave Web Search adapter is coded but not enabled. Compare it against Tavily for ranking, licensing, privacy and actual cost. Brave currently quotes $5 per 1,000 requests with $5 monthly credits, but requires an API signup and payment/budget decision. Do not purchase or activate it without specific approval. Its credentials must be server-only.
2. **Anonymous abuse and spend control**. With approval, generate and review a migration for `perception_reserve_guest_search_quota` from the SQL proposal; test atomic limits and RLS. Configure server-only Supabase connection, an HMAC fingerprint salt, a separate Brave API key and `PERCEPTION_SEARCH_PUBLIC_ENABLED=true` only after quota and provider hard monthly cap are verified. Also require platform WAF rate limiting/concurrency controls and a privacy/retention policy. Fail closed on missing service role/RPC, never expose provider or service keys in Vite. Approval required for any live DB/security/billing/configuration changes.
3. **Verify a genuine guest-first results UI**. SEARCH now submits independently of sign-in and displays a source list when the API returns data. The optional `Analyze with PERCEPTION` action prefills a separate Perceive request rather than synthesizing automatically; signing in may be required at that second stage. Browser/network acceptance, actual upstream relevance and real provider credentials remain untested. The preview should honestly report search unavailable until enabled.
4. **Real offline/preview test and user acceptance**. CI must pass for final branch head, preview must verify unauthenticated SEARCH never opens auth, and unconfigured `/api/search` must return HTTP 503 without paid calls. Test a mocked provider with explicit fixture labels, then a separately approved capped Brave sandbox. Confirm source validity and speed; never label fixtures as live results.
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
