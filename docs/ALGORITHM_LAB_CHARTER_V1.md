# PERCEPTION Algorithm Laboratory — development charter v1
2026-11-26 | Founder approved expanding the laboratory; detailed targets below are proposed engineering criteria, not deployed capabilities.

## Mission
Improve user-complete search, Percive evidence understanding, and Discover relevance without manipulating engagement or forcing workflows. Preserve account-free ordinary search and the plasma identity. Separate each project's private data.

## Workstreams and outputs
| Workstream | Output |
|---|---|
| Language | intent labels, uncertainty, paraphrase/error slices |
| Retrieval/ranking | judged query-document pairs, NDCG@5, Recall@10, source freshness |
| Ingestion | provenance, timestamps, rights, completeness and consumption receipts |
| Knowledge graph | source-attributed edges and correction history |
| Reasoning | grounded claim evaluations and abstention |
| Contradiction | claim pairs, counterevidence and false-positive rate |
| Adaptive learning | reviewed feedback candidates, versioned snapshots |
| Discovery | relevance, novelty and diversity judgments |
| Security/privacy | access isolation, consent, deletion/retention tests |
| Independent evaluation | frozen holdout, comparative scorecard and release verdict |

## Proposed data and experiment contracts
Use isolated Supabase staging only after schema/permissions review and approval. Draft logical entities: datasets (id, version, hash, license, provenance, split, review status); examples (dataset id, sanitized input, task, expected outcome, reviewer status, duplicate cluster, source reference); experiments (git SHA, dataset hash, model/config, seed, metrics, slice counts, artifact hash, cost, latency, status); corrections (explicit consent, sanitized input, reviewer, retention deadline); releases (candidate, baseline, independent review, approved status, rollback reference). No raw private search logs by default. Do not create actual tables or collect private user data under this charter.

## Growth stages
1. Offline foundation: existing synthetic 1,000 corpus, 64 varied development challenge; establish annotation rubric, hard negatives and independent reviewers.
2. Curated scale: target 500 reviewed examples, then 2,000, then 10,000 as quality permits. Split by semantic cluster, author and time before tuning; lock test IDs and hashes. Synthetic volume is not real-world accuracy.
3. Train candidates using cheap local classifiers, retrieval tuning, calibrated abstention and explicit safety gates. Compare against frozen baseline; record every failure.
4. Offline retrieval/reasoning tests with licensed fixtures; verify evidence support and no invented sources. Ordinary search always works independently of optional intent suggestions.
5. Shadow/preview evaluation only after approvals, no paid calls or live data by default. Release requires independently reviewed evidence, approved spend and production authorization. Roll back any material regression.

## Proposed release criteria (not certified)
Independent intent holdout >=90% macro-F1, each class recall >=80%, zero false build suggestions in a minimum 300 hard-negative sample (zero observed does not imply zero risk); uncertainty/fallback evaluated separately. No automatic workflow starts from prediction. Ranking: >=5% relative NDCG@5 gain over frozen baseline with no material slice regression. Reasoning: >=95% claim citation support on adjudicated set, report abstention and contradictions. Latency and cost must be measured against actual service budgets before release. No private data leakage or unauthorized actions. Thresholds are provisional and must be validated with representative samples, confidence intervals and product review. Never optimize solely for engagement.

## Operating rhythm
Daily: reproducible offline test run and evidence receipt (commit, data version, baseline/candidate, per-class confusion, failures, next action). Weekly: independent audit, trend and regressions; review false positives first. Persistence Brain coordinates safe work; Perception Auditor certifies only observed outcomes. Existing Perception Test Watch may report evidence; no new schedules created by this charter.

## First experiment
Run node scripts/algorithm-lab-intent-challenge.mjs on this branch. Equivalent in-isolate evaluation of 1,000 training examples and 64 manually authored development examples: v0 42/64 correct, 9 false build predictions; explicit-build gate 44/64, zero false build predictions, build recall 7/8 unchanged. Not a hidden or independently reviewed test; not a release result. Next: independently label fresh queries, especially local/shopping and mixed intents; fix training feature leakage, compare calibration on development set only, then freeze and evaluate. No production model integration.
