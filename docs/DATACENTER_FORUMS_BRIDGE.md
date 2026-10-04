# DataCenter.Forums → Perception Bridge

DataCenter.Forums is a production evidence source for Perception.

The bridge accepts signed push events from DataCenter.Forums and routes them through the existing
`perception_ingest_project_observation_internal` function. Incoming observations remain evidence;
they do not silently become Project World truth.

## Perception Edge secrets

Configure these as Supabase Edge Function secrets:

- `DATACENTER_FORUMS_PROJECT_ID` — the Perception Project World that owns the DataCenter.Forums learning stream.
- `DATACENTER_FORUMS_TOKEN_SHA256` — SHA-256 of the shared token. Never commit the raw token.

Deploy `datacenter-forums-bridge` after the secrets are configured.

## DataCenter.Forums runtime secrets

Configure these in the DataCenter.Forums backend:

- `PERCEPTION_BRIDGE_URL` — deployed Supabase Edge Function URL for `datacenter-forums-bridge`.
- `PERCEPTION_BRIDGE_TOKEN` — the raw shared token whose SHA-256 is stored in Perception.

## Contract

DataCenter.Forums sends:

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

- `x-perception-client: datacenter-forums`
- `x-perception-token: <shared token>`

The bridge converts the event into a `perception_source_observations` row bound to the configured
Project World. Perception can then resolve entities, detect contradictions, update epistemic state,
and score its own decisions against DataCenter.Forums benchmark cases.
