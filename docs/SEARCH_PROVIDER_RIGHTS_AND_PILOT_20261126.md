# PERCEPTION Search provider rights and zero-overage pilot

Checked: 2026-11-26. Scope: **PERCEPTION only**, review branch, no new provider subscriptions, billing, passwords, production settings or provider requests.

## Owner authorization and the important distinction

The owner approved preparing a Brave Search API pilot restricted to included credits, **zero paid overages**. This does not approve adding a payment card, accepting contractual commitments on their behalf, buying credits, a production configuration change or deployment. Do not enable public search until the actual provider account and contract use rights have been confirmed.

The intended product is a **consumer web search destination**, not merely a tool for internal question answering. A standard ranked source list is the default; PERCEPTION's AI evidence analysis must be optional. Provider licensing must cover (1) end-user display of ranked links and snippets at scale, (2) eventual monetized operation, and (3) optional AI analysis of retrieved source material without impermissible model training or retention.

## Current primary candidate — Brave Search Web API

- Official [API listing and pricing](https://brave.com/search/api/), checked Nov 26: Search plan **US$5 per 1,000 requests**, with **US$5 in credits monthly**; credit card requested for abuse prevention; [prepaid credit terms](https://api-dashboard.search.brave.com/terms-of-service/credit-terms) describe optional auto-reload. A zero prepaid balance/auto-reload off is not enough without verifying the precise hard limit in the authenticated dashboard and ensuring no other API usage consumes those credits.
- Current [Terms of Service](https://api-dashboard.search.brave.com/terms-of-service), last updated Sep 1, 2026, section 3(b): restricted actions include making the API replace its own functionality, redistributing/reselling search results and using results to create/evaluate/improve AI services or models. Section 4(c) also places end-user contractual obligations on the customer. This does **not** conclusively establish that an ordinary public search-results page is forbidden: Brave itself markets the API to power search engines. It DOES create a material rights ambiguity for the owner’s intended combination of public search + Perception analysis, so seek written provider confirmation of the exact use before activation.
- The draft code is locked by two distinct server settings: `PERCEPTION_SEARCH_PUBLIC_ENABLED === 'true'` **and** `PERCEPTION_SEARCH_BRAVE_USAGE_RIGHTS_CONFIRMED === 'true'`. Neither is sufficient without a live secret, validated atomic quota RPC, a verified provider hard stop, and explicit owner approval for the environment/deployment. The second flag must not be set on assumptions.
- The [Brave pricing page](https://brave.com/search/api/) quotes fixed request pricing, but monthly dollar credits are an account-level billing matter. Proposed conservative pilot: **20 globally accepted web searches per UTC day** and five per visitor bucket per day, for at most 620 provider searches over a 31-day month and estimated list cost **US$3.10** if all charged at $0.005 each. This is a *math estimate*, not a verified spending cap; account-level hard limits and other usage still need confirmation. Separate proposed SQL has NOT been applied.

## Alternative to benchmark — Mojeek independent web index

- [Mojeek Web Search API](https://www.mojeek.com/services/search/web-search-api/), checked Nov 26: Startup list price **GBP £2 per 1,000 requests**; free testing credit is advertised, but opening an account requires a bank card. Mojeek says it does **not** automatically process PAYG payments and allows one-hour temporary cache on Startup. These claims need verification in an actual account before pilot.
- [Mojeek API terms](https://www.mojeek.com/about/legal/api-terms.html), section 6, explicitly permit results in internet search experiences, AI applications, commercial subscriptions and ads alongside results, with caveats about third-party copyright, data indexing and storage rights. This appears better aligned than Brave's default terms for the combined consumer/AI design, though it does not demonstrate source ranking quality, speed or total contract suitability.
- No Mojeek API key, account, provider call or integration has been activated.

## Actual account/connection check on Nov 26

- Connected Vercel `perception-ai` project environment-list read (not decrypted) showed no visible search keys in the response. This is NOT a determination that the owner has no separate Brave account.
- The available ChatGPT app directory did not surface a direct Brave Search API account connector; the connected browser could not be accessed from the present chat. No Brave dashboard login, billing configuration or API token was obtained. Connected Gmail searches did not find a Brave API welcome/billing email within the checked Gmail accounts; unrelated accounts could still exist.

## Release and licensing gates — do these in order

1. Ask Brave API sales/support **in writing** whether a consumer web search destination with ranked links/snippets, advertising, and an optional Perception evidence-analysis button (no training or durable storage of Brave results) is allowed on the default Search plan. Ask which end-user terms/attribution and caps are required.
2. Evaluate Mojeek as fallback on the same criteria, including permitted end-user search display, AI grounding/analysis, source retention, costs, geography, performance and privacy.
3. After affirmative provider terms and explicit approval to accept signup terms, open the relevant provider dashboard through a user-authorized browser, set **zero automatic reload** and a **provider-enforced ceiling at or below the included credit balance**; confirm the price/cap from dashboard readback.
4. Privately provision only the required server-side key; never paste it into GitHub, Notion, chat, browser client, CI logs or files. Obtain separate approval before changing live Vercel/Supabase environment variables, service-role grants or database schemas.
5. Independently prove the shared counter is atomic, cannot be exhausted past global cap by concurrent clients, has safe retention and secure IP identity. Current Vercel [request headers docs](https://vercel.com/docs/headers/request-headers) state `x-forwarded-for` is overwritten by the platform for ordinary deployments; verify any proxy configuration before trusting it as per-IP identity.
6. Run a small, explicit, controlled test of real live results with **no paid overages**, then browser UI acceptance for desktop/iPhone, error paths and PERCEPTION optional analysis. Only then seek separate merge/deployment authorization.

**Current status: review-only source/CI; public search remains not activated.** Blocker is account/rights verification plus spend ceilings, not more speculative architecture.
