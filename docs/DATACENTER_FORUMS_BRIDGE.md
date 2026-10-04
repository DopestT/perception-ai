# DataCenter.Forums → Perception Bridge

DataCenter.Forums is an external evidence source for Perception. It is **not** a source of canonical truth.

The bridge accepts server-to-server push events and routes them through
`perception_ingest_project_observation_internal`. Perception owns entity resolution, contradiction handling,
epistemic promotion, verification, and Project World truth.

## Authentication

The bridge deliberately uses custom webhook authentication rather than a Supabase user JWT.

`supabase/config.toml` sets:

```toml
[functions.datacenter-forums-bridge]
verify_jwt = false
```

That only disables the Supabase gateway JWT check for this function. The function still authenticates every
request itself with an HMAC signature over the exact request body and a short-lived timestamp.

Required headers:

- `x-perception-client: datacenter-forums`
- `x-perception-timestamp: <unix seconds>`
- `x-perception-signature: sha256=<64 hex characters>`

The signature input is `<timestamp>.<exact raw JSON body>`, signed with HMAC-SHA256. Requests outside the
five-minute clock-skew window are rejected. Changing even one byte of the body invalidates the signature.

## Perception Edge secrets

Configure these server-side:

- `DATACENTER_FORUMS_PROJECT_ID` — UUID of the Perception Project World receiving this evidence stream.
- `DATACENTER_FORUMS_HMAC_SECRET` — high-entropy server-side secret used only for HMAC request signing.

The function uses the Supabase Edge runtime's secret/service credential only inside the function to call the
existing privileged ingestion RPC.

## DataCenter.Forums runtime secrets

Configure these only in the DataCenter.Forums backend:

- `PERCEPTION_BRIDGE_URL` — deployed URL for `datacenter-forums-bridge`.
- `PERCEPTION_BRIDGE_HMAC_SECRET` — the same HMAC secret held by the Perception receiver. The secret itself is never sent over the wire.

## Event contract

```json
{
  "event_id": "123",
  "event_type": "evidence.observed",
  "subject_ref": "sec_filing:0000000000-00-000000",
  "summary": "DataCenter.Forums evidence.observed for sec_filing ...",
  "observed_at": "2026-10-04T00:00:00.000Z",
  "data": {
    "canonicalUrl": "https://example.test/source"
  }
}
```

Required:
- `event_id` — non-empty, max 200 characters.
- `event_type` — non-empty, max 80 characters.
- `subject_ref` — non-empty, max 500 characters.
- `observed_at` — valid timestamp. Missing/invalid timestamps are rejected, never replaced with server time.

Optional:
- `summary` — max 5,000 characters.
- `data` — object. The normalized observation payload is capped at 250,000 characters.
- `data.canonicalUrl` — max 2,048 characters.

Oversized identifiers are rejected rather than truncated so distinct upstream identities cannot collapse into one
observation.

## Idempotency and immutable event identity

The content hash is computed from normalized stable event fields. Transport timestamps are not injected into the
observation payload, so signing a retry with a fresh timestamp does not change the evidence identity.

A private `perception_bridge_receipts` ledger permanently binds each `event_id` to the SHA-256 hash of the
exact signed request body. The same event id with the same body is idempotent. Reusing that id with different
content is rejected with HTTP 409.

A failed or stale processing receipt can be reclaimed safely. An already accepted receipt returns success without
creating another observation.

## Reserved-field protection

Nested `data` cannot replace canonical event identity or trust-boundary metadata. The bridge strips reserved keys
from `data` before assigning canonical `subject_ref` and integration metadata.

## Trust boundary

Incoming events become `perception_source_observations`. They are evidence, not verified Project World state.

The stored integration metadata explicitly records:

- `trust_boundary: external_observation_only`
- `authoritative_truth_requires_perception_verification: true`

This bridge therefore conforms to the Perception Sovereign Storage Rule: DataCenter.Forums supplies bounded
observations, while Legacy Works Ventures-controlled Perception storage remains authoritative.
