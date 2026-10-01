# Growth Operator v0.1

Perception's first commercial vertical: an approval-first organic growth operator.

## What this slice proves

The v0.1 loop is intentionally narrow and observable:

1. Connect an owned project to a public HTTPS site and optional GitHub repository.
2. Crawl the site safely from a Supabase Edge Function.
3. Establish a technical/content baseline.
4. Convert observed gaps into ranked growth opportunities.
5. Convert each opportunity into an exact bounded P1 job.
6. Queue the top jobs into the Perception Execution Ledger.
7. Keep publishing approval-required until the system has repeated verified wins.

The Growth Operator does **not** auto-publish in v0.1.

## Runtime pieces

- `supabase/functions/growth-operator/index.ts`
  - authenticated permanent users only
  - public HTTPS only
  - DNS/private-network checks
  - cross-host redirect rejection
  - response-size and timeout bounds
  - five-minute scan cooldown
  - maximum 50 pages per scan
- `supabase/functions/_shared/growth-operator.ts`
  - sitemap parsing
  - page signal extraction
  - deterministic opportunity scoring
  - bounded job construction
- `src/GrowthOperatorPanel.tsx`
  - configure
  - scan
  - inspect ranked opportunities
  - queue top 10
- `20261001171000_growth_operator_v01.sql`
  - durable site, scan, page, and opportunity state
  - owner-scoped read policies
  - no direct authenticated writes
  - dashboard RPC

## First proving ground

Let Me Teach You AI is the initial internal proof site.

- Site: `https://www.letmeteachyouai.com/`
- Repository: `DopestT/Let-Me-Teach-You-AI`
- Primary goal: qualified newsletter / AI Work Kit signups
- Conversion event: `newsletter_signup`
- Publishing mode: `approval`

The LMTYAI repository exposes a sitemap and robots policy already. The Growth Operator branch adds `public/llms.txt` and an explicit growth contract.

## Deploy order

1. Apply `supabase/migrations/20261001171000_growth_operator_v01.sql`.
2. Deploy the `growth-operator` Edge Function.
3. Deploy the Perception web app.
4. Open a permanent-account Project World.
5. In Growth Operator, connect the LMTYAI site/repository and goal.
6. Run the baseline scan.
7. Review the top opportunities.
8. Queue the top 10.
9. Continue the bounded jobs through the normal Perception permission / verification flow.

## Required proof before autonomy increases

Do not move from `approval` to `autopilot` until all are true:

- repeated scans complete without unsafe fetch behavior;
- bounded jobs stay within their declared repository scope;
- implementation builds pass;
- production verification can confirm the intended effect;
- conversion/search measurements can be tied back to actions;
- no repeated thin/duplicate-content pattern appears;
- operator failures remain explicit and retry-bounded.

## Next slice

v0.2 should add replaceable adapters rather than expanding the Edge Function into a monolith:

- Search Console / analytics measurements
- external keyword/SERP opportunity provider
- AI visibility checks
- content brief/content generation worker
- technical crawler worker for larger sites
- publisher adapters
- post-change verification and result attribution

Perception should continue to own project truth, permissions, routing, evidence, and learning. Commodity providers remain replaceable.
