# Operator Capability Attachment

Perception's route planner must distinguish capabilities that exist in code from capabilities that are actually attached to the runtime.

The objective edge function always exposes the local baseline:

- `reason`
- `generate`
- `verify`

External operator capabilities are opt-in through the server-side `PERCEPTION_OPERATOR_CAPABILITIES` environment variable. Values are comma-separated capability kinds, for example:

```
PERCEPTION_OPERATOR_CAPABILITIES=code,retrieve
```

Attaching a capability only makes it eligible for route planning. It does **not** bypass the Permission Gate. P2/P3 actions still require a matching scoped permission grant, and external effects must be independently observed and verified before Project World advances.

For GitHub Operator v1, enable `code` only when the GitHub execution adapter is configured and able to return independent commit/file/check evidence.
