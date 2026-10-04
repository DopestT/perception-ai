# DataCenter.Forums → Perception Bridge

DataCenter.Forums is a production evidence source for Perception.

The bridge accepts HMAC-signed push events from DataCenter.Forums and routes them through the existing
`perception_ingest_project_observation_internal` function. Incoming observations remain evidence;
they do not silently become Project World truth.

## Security boundary

The bridge is deliberately narrow:

- POST only
- `application/json` only
- maximum request body: 256 KiB
- HMAC-SHA256 authentication over the exact request body and timestamp
- five-minute clock-skew / replay window
- strict event-id and event-type validation
- bounded field lengths
- external observations remain non-authoritative until Perception verifies them
- duplicate observation bodies are idempotent through Perception's existing `source_id + content_hash` uniqueness
- every `event_id` is locked to one exact signed request body in a private bridge receipt ledger
- reusing an existing `event_id` with different content is rejected with HTTP 409
- failed/stale deliveries can be reclaimed and retried without weakening event identity

A captured signed request cannot be replayed after the timestamp window. A duplicate received within
the window resolves through the receipt ledger and does not create a second observation. Event identity
is immutable: the same event id can never later be used to smuggle different content into Perception.

## Perception Edge secrets

Configure these as Supabase Edge Function secrets:

- `DATACENTER_FORUMS_PROJECT_ID` — the Perception Project World that owns the DataCenter.Forums learning stream.
- `DATACENTER_FORUMS_HMAC_SECRET` — a high-entropy shared HMAC secret. Never commit it or expose it to a browser.

Deploy `datacenter-forums-bridge` only after the secrets are configured.

## DataCenter.Forums runtime secrets

Configure these only in the DataCenter.Forums backend:

- `PERCEPTION_BRIDGE_URL` — deployed Supabase Edge Function URL for `datacenter-forums-bridge`.
- `PERCEPTION_BRIDGE_HMAC_SECRET` — same high-entropy HMAC secret held by the receiver.

The sender must never include the HMAC secret itself in a request.

## Signing contract

DataCenter.Forums serializes the JSON request body once and sends that exact byte sequence.

Example body:

```json
{
  "event_id": "123",
  "event_type": "evidence.observed",
  "subject_ref": "sec_filing:0000000000-00-000000",
  "summary": "DataCenter.Forums evidence.observed for sec_filing ...",
  "observed_at": "2026-10-04T00:00:00.000Z",
  "data": {}
}
```

Headers:

- `content-type: application/json`
- `x-perception-client: datacenter-forums`
- `x-perception-timestamp: <unix-seconds>`
- `x-perception-signature: sha256=<hex HMAC>`

Signature input:

```text
<unix-seconds>.<exact raw JSON body>
```

Signature algorithm:

```text
HMAC-SHA256(PERCEPTION_BRIDGE_HMAC_SECRET, signature_input)
```

The sender must create a fresh timestamp/signature for every delivery attempt. It must not parse and
re-serialize the body after signing.

## Trust semantics

The bridge converts an accepted event into a `perception_source_observations` row bound to the
configured Project World. Authentication proves which integration sent the bytes; it does **not**
prove that the source claim is true.

Perception can then resolve entities, detect contradictions, update epistemic state, and score its
decisions against DataCenter.Forums benchmark cases.
