# Perception Microsite Engine

The Microsite Engine is a Perception capability for identifying local-service opportunities, generating independently deployable lead-generation sites, and managing their lifecycle from the Perception control plane.

Perception remains the source of truth. Microsites are outputs of the runtime.

## Portfolio target

V1 is designed around a 100-site portfolio. The number 100 is a capacity target, not permission to publish 100 weak sites. Perception creates 100 portfolio slots, researches opportunities continuously, and only promotes a slot when the market evidence clears the build threshold.

A slot progresses through:

`RESEARCHING -> CANDIDATE -> VALIDATED -> APPROVAL_REQUIRED -> BUILDING -> LIVE -> MONETIZING`

Unvalidated slots stay in research. Domain purchases and paid services remain gated.

## Runtime mapping

- EXPRESS: define portfolio objective and constraints
- PERCEIVE: collect market, search-result, competitor, domain, and local-demand signals
- RESOLVE: normalize service + market opportunities
- REALITY MAP: score competition, commercial intent, lead value, and evidence quality
- ROUTE: choose research, build, deploy, monitor, or monetize actions
- CREATE: generate a site package from a locked vertical template
- CONNECT: attach domain, call/form routing, and contractor destination
- EXECUTE: deploy an approved site and tracking endpoints
- VERIFY: check technical health, indexing, ranking, lead quality, and claims
- ADAPT: revise content, targeting, routing, or monetization
- REALIZE: graduate a site into a monetized portfolio asset
- LEARN: feed ranking, lead, and revenue outcomes back into opportunity scoring

## Public-site isolation

Each public microsite can have its own domain, branding, deployment, and analytics path. The public sites do not need to link to one another or expose the private portfolio control plane.

The private control plane can still aggregate rank, lead, uptime, and revenue events across the portfolio.

The engine must not invent reviews, addresses, licenses, certifications, contractor identities, business history, or customer claims.

## Human approval gates

Human approval is required before domain purchase, paid service activation, publication of material business claims, contractor commercial terms, pricing changes, disputed lead charges, and irreversible DNS or deployment changes.

## V1 vertical

Waterproofing and moisture-control services:
- basement waterproofing
- crawl-space encapsulation
- crawl-space repair
- mold remediation
- basement leak repair
- foundation waterproofing
- sump-pump installation and repair
- drainage / French drains

Initial geography: Mid-Atlantic. Seed markets are research candidates only until evidence is collected and scored.

## Opportunity scoring

Each service + market candidate is scored from 0-100 using commercial intent, competition advantage, local demand, estimated lead value, domain fit, and evidence confidence. A candidate must score at least 65 and have MEDIUM or HIGH evidence confidence before Perception can place it into a validated portfolio slot.

## Core entities

- MicrositePortfolio
- MicrositePortfolioSlot
- MarketCandidate
- OpportunityScore
- MicrositeSpec
- DeploymentRecord
- LeadEvent
- RevenueEvent
- VerificationRecord

## Persistence

Migration `013_microsite_portfolio.sql` creates persistent portfolios, 100 numbered slots by default, market candidates, microsites, lead events, and revenue events. Client access is read-only under RLS; bounded security-definer runtime functions own mutations.

The core model is provider-neutral. Hosting, database, rank-tracking, call-tracking, and telephony adapters attach through Perception capability routing rather than being hard-coded into the model.
