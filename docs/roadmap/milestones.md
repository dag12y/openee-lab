# Implementation milestones

**Status:** Proposed Stage 4 plan; dates, staffing, and technical decisions are unapproved.
**Purpose:** Order evidence and implementation so a small communication slice validates a reusable engineering platform.
**Scope:** M0–M6 lead toward the proposed first public release. Assignment integration and ecosystem expansion are separate tracks.

## Sequence and gates

| Milestone | Goal and deliverables | Depends on | Exit criteria and validation | Principal risk |
| --- | --- | --- | --- | --- |
| M0 — Decision preparation | Confirm assignment obligations; record D-01–D-07 owners by role and evidence plan; set first-slice boundary; review license and contribution assumptions | Stage 1–3 review | Product reviewer confirms what is being validated, what remains proposed, and who can approve each gate. No feature is called approved by this milestone. | Treating architecture proposals as commitments |
| M1 — Numerical foundation | Independent AM reference cases; documented model convention and units; audit of the separate university simulator before any reuse; non-UI batch engine prototype and diagnostic contract | M0; D-01 method chosen for validation | Analytical and independent checks pass under proposed comparison method; model metadata is inspectable; simulator audit disposition recorded. D-01 tolerances still require explicit sign-off. | Incorrect or circular numerical reference |
| M2 — Platform validation slice | Browser guest path, built-in candidate experiment, guided parameters, model/equation inspection, time/spectrum views, explicit runs and stale-result handling | M1 reference behavior; provisional D-04 guards | End-to-end guided conventional AM path uses the UI-independent core; reference cases and invalid-input flows pass; no hosted dependency. This is an internal validation slice, not a public release. | AM-specific UI architecture |
| M3 — Graph feasibility checkpoint | From-empty graph construction, typed connections, keyboard path, compiler, guided-to-graph conversion inventory, undo/redo proof | M1 model and engine; M2 built-in model; D-02 review criteria | All [Stage 2 checkpoint criteria](../design/workspace-feasibility.md#recommended-feasibility-checkpoint) are demonstrated with evidence. Failure returns FR-005, FR-006, and FR-014 to product scope review; it does not silently downgrade them. | Graph cost, accessibility, semantic loss |
| M4 — Integrated project workflow | Supported workspace graph, local export/import, version and error handling, self-hosted end-to-end run–edit–save–reopen path | M3 pass; D-03 format policy; D-04 provisional limits | Canonical model and metadata round-trip; equivalent built-in/graph model results match approved D-01 criteria; malformed/unsupported imports preserve work. | Project compatibility and unsafe files |
| M5 — Release hardening | Resource measurements and approved budgets; browser/device matrix; accessibility evaluation; security review; docs and contribution workflow | M4; D-01–D-06 evidence | Alpha and beta gates in [release plan](release-plan.md) met; first-release P0 traceability reviewed; D-07 boundary reviewed. | Late accessibility or browser gaps |
| M6 — Public MVP decision | Release candidate, validation evidence, self-hosted verification, rollback plan, final scope and documentation | M5; explicit product and technical gate approvals | Public criteria in [release plan](release-plan.md) met. Release remains unapproved until reviewers sign off; no date is set. | Pressure to launch with unverified behavior |

The sequence is a dependency order, not a promise that each milestone is one sprint or one deployment. M1 and M2 may use temporary internal UI, but first-release work must retain the platform's domain/editor/engine boundaries. M3 is a **blocking scope checkpoint**, not a decorative prototype. If it fails, leadership must explicitly revise Stage 1's proposed public scope and graph-dependent P0 requirements before choosing a guided-only public release.

## Separate assignment and future tracks

**University assignment track:** obtain rubric and integration requirements, audit conventional AM/DSB-SC/SSB/VSB behavior and architecture, then decide which modes belong to assignment work. The audit informs M1 but assignment integration is not automatically part of M4 or the public MVP. No unverified simulator code becomes a numerical oracle.

**Future ecosystem track:** after the public slice, evaluate additional built-in simulations and specialized editors, reusable subgraphs, restricted expressions, sandboxed plugins, external engines, and community publishing. Each needs its own product, security, and evidence gates; none is on the M0–M6 critical path.

## Related plans and traceability

[Proposed MVP](mvp.md), [implementation tasks](implementation-plan.md), [validation](validation-plan.md), [risk register](risk-register.md), [release gates](release-plan.md), [Stage 1 scope](../product/scope.md), [Stage 3 decisions](../architecture/architecture-decisions.md). M1 traces NFR-001–NFR-003 and D-01; M3 traces FR-005–FR-006, FR-014 and D-02; M4 traces FR-007–FR-009, NFR-008 and D-03; M5 traces NFR-004–NFR-005 and D-04–D-07.
