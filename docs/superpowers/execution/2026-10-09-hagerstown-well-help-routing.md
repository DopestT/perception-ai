# Hagerstown Well Help routing execution

Implementation branch for the approved Hagerstown Well Help automation design and implementation plan.

Source spec: `spec/hagerstown-well-help-automation-20261005:docs/superpowers/specs/2026-10-05-hagerstown-well-help-automation-design.md`

Source plan: `spec/hagerstown-well-help-automation-20261005:docs/superpowers/plans/2026-10-09-hagerstown-well-help-automation.md`

Execution mode: Native, practice-first. Live outbound delivery remains disabled.

Ruling: this harness cannot clone GitHub into the container, so the isolated GitHub feature branch is the worktree-equivalent and pull-request CI is the command runner for RED/GREEN verification. Cost if wrong: slower feedback and less local inspection; mitigated by PR CI and direct file review.
