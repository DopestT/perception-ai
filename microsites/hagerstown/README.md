# Hagerstown Basement Waterproofing

Perception microsite portfolio slot #1.

## Deployment

Import `DopestT/perception-ai` into Vercel as a separate project with:

- Root Directory: `microsites/hagerstown`
- Build Command: `npm run build`
- Output Directory: `dist`
- Domain: `hagerstownbasementwaterproofing.com`

`vercel.json` contains the matching build/output settings and security headers.

## Lead intake

Estimate requests post to the Perception Supabase Edge Function `microsite-lead`. The endpoint validates fields, restricts browser origins to this domain, applies a honeypot and hashed-network rate limit, then records accepted submissions in `perception_microsite_leads`.

No service-role credential is shipped to the site.

## Truth policy

This is an independent local lead-generation/referral resource. Do not publish fabricated reviews, addresses, licenses, certifications, contractor identities, business history, or customer claims. Contractor-specific claims may be added only after a real participating provider is onboarded and those claims are verified.

## Indexing

The build emits real static HTML, canonical URLs, `robots.txt`, and `sitemap.xml`. Perception/BigSignal tracks corresponding pSEO entities with `is_indexed=false` until indexing is independently verified.
