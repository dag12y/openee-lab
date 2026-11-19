# Release plan and gates

**Status:** Proposed; no release readiness, date, or deployment is asserted.
**Purpose:** Define progressive evidence thresholds from architecture validation to first public MVP.
**Scope:** Candidate conventional AM public slice, with graph/editor scope conditional on D-02. Assignment integration and future ecosystem releases are separate.

## Stages

| Stage | Entry | Exit / release evidence | Audience and disposition |
| --- | --- | --- | --- |
| Architecture validation (M1–M3) | M0 scope and evidence owners recorded | Independent candidate AM references; UI-independent batch execution; guided path; from-empty graph and faithful conversion; undo/redo, keyboard path, failure-state proof, and credible accessibility/effort plan; **provisional versioned portable graph/project export/import** preserving nodes, connections, parameters, essential metadata, and numerical behavior after fresh-session and self-hosted reopen | Internal; no public-readiness claim. Formal D-02 pass waits for approved D-01 comparison criteria and all Stage 2 checkpoint evidence. Failure returns Stage 1 scope and FR-005/FR-006/FR-014 to product review; provisional serialization does not approve D-03. |
| Internal integration (M4) | D-02 pass and provisional M3 round-trip evidence available; D-03 production policy review begins | Guided-to-graph end-to-end run; approved schema/version policy before hardened implementation; user-facing export and transactional import; malformed/incompatible file and resource/security handling; compatibility/migration where approved; self-hosted production workflow proof | Internal development build; M3 round-trip evidence is retained but does not replace production V-06 validation. Incomplete D-04–D-06 evidence remains visible. |
| Alpha candidate (M5) | Integrated P0 paths operable | Normal and boundary numerical cases pass reviewed D-01 criteria; resource guards and failure recovery are demonstrable; documentation identifies limitations; no critical data-loss/security defect | Restricted evaluation only; feedback is evidence, not automatic public approval. |
| Beta candidate (M5) | Alpha findings triaged and blocking defects fixed | D-04 budgets, D-05 browser/device matrix, and D-06 accessibility standard have review evidence; graph keyboard path and plot alternatives tested; project compatibility and self-hosting rechecked; contribution and issue-reporting guidance usable | Wider evaluation under explicit support policy; unresolved P0 failures block beta. |
| Public MVP decision (M6) | Beta evidence complete and product scope confirmed | All proposed public P0 requirements demonstrated, D-01–D-07 dispositions reviewed, reference and regression suite passing, self-hosted essential workflow verified, release notes and rollback rehearsed | Product/release reviewers decide whether to publish. No launch is inferred from completing documentation. |

The alpha/beta labels describe gate maturity, not a calendar or promise of distribution. A guided-only alpha can be useful internally, but a guided-only **public MVP** conflicts with the current proposed Stage 1 graph-dependent P0 scope unless that scope is explicitly revised. A result must not be presented as verified before its reference evidence exists.

## Documentation and contribution readiness

Before public release, documentation must explain supported model convention, units, sampling and FFT presentation, known limits, project format/version compatibility, file import behavior, self-hosted setup, accessibility/support policy, and assignment simulator audit disposition. Contribution guidance must identify numerical evidence and compatibility tests required for changes to engines or project models. License and dependency review precede borrowed code or new package selection. Future plugin/community plans should be described as direction, not launch features.

## Regression and rollback

Treat a numerical-model change, engine version change, project-format migration, or graph conversion change as release-sensitive. Run independent numerical references, guided/graph equivalence, project round trips, invalid-input/resource tests, accessibility tasks, and selected-browser smoke flows before promotion. Keep previous release artifacts and migration compatibility policy as approved under D-03. If a release regresses numerical results or corrupts projects, stop distribution, communicate affected model/version, and restore the last validated artifact where feasible. Do not silently reinterpret or overwrite user project files; recovery and format rollback rules require D-03 review.

## Outstanding approvals

Approve candidate model/reference conventions and tolerances (D-01), graph feasibility and conversion coverage (D-02), portable format/version policy (D-03), measured limits (D-04), support matrix (D-05), accessibility standard/results (D-06), and minimal internal extension boundary (D-07). See [milestones](milestones.md), [validation gates](validation-plan.md), [risks](risk-register.md), and [Stage 1 requirements](../product/requirements.md).
