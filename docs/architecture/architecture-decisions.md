# Architecture decisions and open gates

**Status:** Proposed Stage 3 recommendations; none of D-01 through D-07 is Accepted.
**Purpose:** Respond to the Stage 2 [decision register](../design/workspace-feasibility.md#stage-3-technical-architecture-decision-register) without inventing evidence or silently approving technical choices.
**Scope:** Decisions guide the candidate conventional AM validation slice and proposed first public release. Future plugin/community infrastructure remains future.

The five product pillars and accepted product principles are direction, not approval of these technical recommendations. Each decision records an option and a validation gate; review can change the recommendation without rewriting Stage 1 requirements.

## D-01 — Numerical references and tolerances

- **Status:** Open; reference method recommended, numeric tolerances unresolved.
- **Context:** NFR-001/NFR-002 require correctness and reproducibility, while the university simulator is unaudited.
- **Options:** independently derived analytical cases plus cross-implementation checks; simulator-as-oracle; same-engine snapshots only.
- **Recommendation and rationale:** use analytical cases and independent references under explicit AM, sampling, and FFT conventions. Snapshots can detect regressions but cannot prove correctness; simulator output requires audit before comparison.
- **Risks:** ambiguous amplitude/FFT conventions, floating-point differences, and wrong references can produce false confidence.
- **Evidence needed:** reviewed equations, boundary and aliasing cases, independent expected values, browser comparisons, approved per-output tolerances, and audit disposition.
- **Related requirements:** FR-003, FR-006, FR-014; NFR-001–NFR-002. See [numerical verification](numerical-verification.md).

## D-02 — Graph construction and conversion coverage

- **Status:** Open; first-release feasibility gate.
- **Context:** FR-005/FR-006/FR-014 propose genuine user construction and faithful built-in-to-workspace conversion.
- **Options:** a narrow typed communication graph; guided-only first release; broad general DSP graph.
- **Recommendation and rationale:** attempt a narrow graph with source, carrier, AM modulator, and result roles; compile only documented supported topology. It must allow construction from empty, connection edits that affect execution/validation, and an inventory of preserved model fields. A general graph is premature; guided-only requires explicit Stage 1 scope revision.
- **Risks:** graph complexity, inaccessible canvas interaction, silent semantic loss, and coupling future domains to communication structure.
- **Evidence needed:** all [feasibility exit criteria](../design/workspace-feasibility.md#recommended-feasibility-checkpoint), including keyboard path, round trip, and numerical equivalence. Exact block semantics/topology remain open.
- **Related requirements:** FR-005–FR-006, FR-014; NFR-001–NFR-004, NFR-007.

## D-03 — Portable project format and versions

- **Status:** Open; envelope shape proposed, exact schema/version policy unresolved.
- **Context:** FR-007–FR-009 require local exchange, metadata, and safe unsupported-file behavior.
- **Options:** versioned data envelope with domain payload; opaque engine serialization; hosted project identifier.
- **Recommendation and rationale:** separate canonical model, optional editor layout, and derived results; use a versioned, portable data envelope. This supports self-hosting and domain-specific models without committing to JSON field names or a universal graph.
- **Risks:** migration ambiguity, accidental data loss, large/untrusted files, and schema coupling to an initial editor.
- **Evidence needed:** schema review, import validation and version matrix, malformed-file tests, round-trip equivalence, and self-hosted exchange. Decide exact format, file limits, and migration policy later.
- **Related requirements:** FR-007–FR-009, FR-014; NFR-002, NFR-005–NFR-008. See [project format](project-format.md).

## D-04 — Resource budgets and failure policy

- **Status:** Open; guard placement recommended, numeric limits unresolved.
- **Context:** NFR-005 requires safe handling of invalid and excessive work.
- **Options:** UI-only limits; validation plus execution guards; unlimited local execution.
- **Recommendation and rationale:** validate size/work before dispatch and enforce cooperative cancellation or worker termination at runtime. UI-only checks can be bypassed by imported files; unlimited work can hang the browser.
- **Risks:** guards may reject legitimate models or fail to interrupt a numerical primitive promptly.
- **Evidence needed:** measured representative workloads, memory/time/cancellation behavior on D-05 devices, approved budgets, and safe rejection tests.
- **Related requirements:** NFR-005; FR-002, FR-005–FR-008. See [simulation engines](simulation-engines.md).

## D-05 — Browser and device support

- **Status:** Open; no support matrix approved.
- **Context:** Guest-first browser use and self-hosting must include honest device capability and reproducibility claims.
- **Options:** broad uniform editing support; tiered supported workflows by viewport/input; desktop-only product.
- **Recommendation and rationale:** choose a published matrix from workflow and graph-accessibility evidence; keep guided simulation and inspection broadly responsive, and claim graph editing only where verified. A mobile limitation must be explicit before entering the editor.
- **Risks:** inconsistent worker/file APIs, touch/keyboard gaps, and cross-browser numerical variation.
- **Evidence needed:** functional and numerical runs across selected browsers/devices, import/export checks, and graph usability assessment.
- **Related requirements:** FR-001, FR-005–FR-009; NFR-002, NFR-004, NFR-008.

## D-06 — Accessibility standard and evaluation

- **Status:** Open; acceptance standard and results unresolved.
- **Context:** NFR-004 requires keyboard flows, text alternatives, and accessible diagnostics, but no compliance has been tested.
- **Options:** formal release standard with manual and automated evaluation; ad hoc checks only.
- **Recommendation and rationale:** select a recognized standard during review, then test core journeys with keyboard and screen reader users/tools, including graph construction and plot interpretation. Automated checks alone cannot establish usable engineering interaction.
- **Risks:** canvas graph or plot interactions may need substantial alternative controls; late fixes can change scope.
- **Evidence needed:** approved standard, test plan, results for first-release journeys, remediated findings, and device support alignment with D-05.
- **Related requirements:** NFR-004; FR-003, FR-005–FR-009, FR-014. See [workspace design](../design/workspace.md).

## D-07 — Minimal extension boundary

- **Status:** Open; internal boundary recommendation, no public plugin API approved.
- **Context:** NFR-003/NFR-007 require modular growth without universal graphs or premature third-party execution.
- **Options:** reviewed built-ins behind internal domain contracts; public plugin API now; domain-specific one-off integrations without shared envelope.
- **Recommendation and rationale:** use a small internal engine envelope, domain model/version identity, and editor adapters; keep capability descriptors internal until multiple real domains justify a public contract. This protects extension options without freezing an unsafe API.
- **Risks:** over-generalization, contract churn, and later migration cost; internal boundaries alone do not secure hostile plugins.
- **Evidence needed:** first-slice implementation review, a paper exercise with a non-graph domain, and threat model before any third-party execution.
- **Related requirements:** NFR-003, NFR-005, NFR-007–NFR-008; future FR-011–FR-012. See [extensibility](extensibility.md).

## Decision dependency and review rule

D-01, D-02, and D-03 must be resolved before graph-dependent first-release scope is confirmed. D-04 through D-06 need measured or evaluated evidence before release claims. D-07 can remain an internal recommendation while public plugin capabilities stay future. No status becomes Accepted merely because these documents are merged. A failed D-02 checkpoint returns FR-005, FR-006, and FR-014 to product review; this document cannot downgrade them.

## Related documents

[Stage 1 scope](../product/scope.md), [requirements](../product/requirements.md), [Stage 2 feasibility](../design/workspace-feasibility.md), [overview](overview.md), [implementation boundaries](implementation-boundaries.md).
