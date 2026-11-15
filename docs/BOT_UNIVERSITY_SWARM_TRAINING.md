# Bot University — continuous swarm training, v0.1

**Status (2026-11-15): offline evaluation harness on review branch. No deployed agent runtime, model-weight training, autonomous execution, or customer-visible service is verified.**

Bot University provides a training and examination layer **for** project workers; Perception remains the execution/permission/verification authority. The first iteration deliberately has zero network calls, zero secrets, zero production reads/writes, and zero external effects.

## Verify the current evaluator

Run with Node.js 20+:

```bash
node scripts/bot-university-eval.mjs --self-test
```

Expected result: ten structural self-tests pass, spanning five ordinary and three adversarial synthetic cases. The passing fixtures are constructed by the test code; this is **not** evidence that any real agent improved.

## Evaluate an actual worker candidate

Send the eight `case_id` values from the `SCENARIOS` array into an explicitly authorized sandbox worker. Save its raw responses locally as a JSON object with one `receipts` array; do not upload secrets, private content or personal data. Each record must have:

```json
{
  "case_id": "source-check",
  "project_id": "PERCEPTION",
  "status": "UNVERIFIED",
  "action": "read_only",
  "performed_actions": [],
  "evidence_urls": ["https://example.org/synthetic-only"],
  "note": "No independent check; source provenance is still pending.",
  "human_review_required": false
}
```

In actual evaluations, never invent evidence. The URL above is **only** a placeholder for demonstrating schema; an HTTPS-shaped link is not verified provenance. Evaluate a real candidate:

```bash
node scripts/bot-university-eval.mjs --candidate /safe/path/candidate-receipts.json
node scripts/bot-university-eval.mjs --baseline /safe/path/baseline.json --candidate /safe/path/candidate.json
```

Exit status 0 means structural checks passed; status 1 means the candidate failed the eligibility gate; status 2 means invocation/input error. A pass is **eligible for independent review only**, not permission to execute or promote an agent. The evaluator checks declared fields, not whether agent claims are honest or whether external side effects happened. Independent source retrieval, artifact readback, runtime inspection and human review are still needed.

## Teaching loop

1. Registrar: accept a scoped objective and record project ID, role, tools and forbidden actions.
2. Instructor: derive a narrowly stated lesson from a **verified** failure; version prompt/tool instructions.
3. Exam: run baseline and candidate on the **same held-out scenarios**.
4. Challenger: attempt prompt injection, cross-project data access, unsafe permissions and false completion.
5. Verifier: inspect actual run traces, deliverables, independent sources, tests and side effects.
6. Dean: propose graduation **only if** measurable improvement and no critical regression; no automatic promotion.
7. Librarian: store curriculum decisions and evidence summaries in [the existing Bot University Notion page](https://app.notion.com/p/417c96f063c381bb8993e4fe104a4ffb); store executable code and test traces in the owning GitHub repo.

## Initial pilot and blockers

- [Perception issue #122](https://github.com/DopestT/perception-ai/issues/122) tracks the harness and real-worker integration.
- [Perception issue #80](https://github.com/DopestT/perception-ai/issues/80) must establish real authorized route → worker execution → independently verified effect before production claims.
- [NETIZENS engineering work orders](https://github.com/DopestT/the-bridge/pull/24) are an appropriate first **engineering** pilot; [NETIZENS in-app roster](https://github.com/DopestT/the-bridge/pull/23) is a separate proposal-only feature.
- Do not confuse synthetic fixture status, green CI, scheduled automation receipt or a draft PR with actual autonomous learning or user-complete project work.

Keep NETIZENS, LMTYAI, VCF, Blue Tsunami Wave, AEGENT, AIrwave and other project assets/namespaces separate. Production deployment, public publishing, private messages, financial actions, DNS, credentials, sensitive writes, deletion and permission elevation all require separate approval. Avoid self-grant, hidden execution, and unbounded autonomous retries.

**Next:** after reviewing this branch, use the actual Perception runtime and recorded grants to run exactly one reversible, branch-only NETIZENS assignment. Compare real baseline/candidate receipts, inspect independent evidence, and only then call a bot trained or ready for a scoped duty.
