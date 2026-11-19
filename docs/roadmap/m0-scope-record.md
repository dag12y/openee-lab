# M0 scope and assignment evidence

**Status:** Proposed M0 record; T-01 is open pending the university assignment brief and product review.
**Purpose:** Keep four related work streams distinct before implementation starts.
**Scope:** Planning evidence only. This document does not revise [Stage 1 scope](../product/scope.md) or approve the public MVP.

| Work stream | Current evidence | Boundary and next decision |
| --- | --- | --- |
| Existing university AM assignment | A separate simulator is reported to cover conventional AM, DSB-SC, SSB, and VSB. Its numerical behavior, architecture, license, and assignment rubric have not been audited here. | Obtain the actual brief and inspect the simulator before deciding required deliverables, integration modes, or reuse. Assignment integration does not automatically become a public OpenEE Lab feature. |
| Conventional AM architecture-validation slice | Stages 1–4 propose it as a small way to test domain model ownership, independent numerical references, guided controls, graph construction/conversion, and portable round trips. The [M1–M3 plan](milestones.md) defines evidence gates. | It is an internal proof, not the assignment deliverable or a public release. The proposed equation and comparison method remain D-01; graph feasibility remains D-02. |
| Proposed first public MVP | [Stage 1](../product/scope.md#proposed-first-public-release-mvp) proposes an account-free verified communication experiment, limited genuine workspace graph, model inspection, and portable local project exchange. Graph-dependent P0 requirements are conditional on the feasibility checkpoint. | No public scope is approved by this record. Failure of D-02 returns FR-005, FR-006, and FR-014 to product review rather than silently producing a guided-only public release. |
| Future OpenEE Lab ecosystem | The five pillars are Engineering Workspace, Built-in Simulations, Plugin Ecosystem, Community, and Learning. Future domains may use different editors and engines. | Plugin execution, external engines, hosted community features, and additional domains need separate product/security decisions; they are not M0 or public-MVP obligations. |

## Missing assignment inputs

The repository does not contain the university brief, assessment rubric, deadline, demo requirements, required modulation variants, allowed libraries, source/reuse rules, or distribution/licensing instructions for the existing simulator. The assignment owner or product reviewer must provide or verify these before T-01 can be closed. A reference to four existing modes establishes neither that all four are required by the assignment nor that any are correct or reusable.

## M0 disposition and traceability

**T-01: Open.** The scope separation is recorded; assignment requirements and integration scope remain unconfirmed. Record the source of the brief, reviewer role, and resulting decision when available. Do not infer acceptance from this planning document. Relevant requirements: FR-001–FR-009, FR-014, NFR-001–NFR-008 for the proposed public path; future FR-010–FR-013 remain outside it. Related [roadmap tasks](implementation-plan.md), [architecture decisions](../architecture/architecture-decisions.md), and [university simulator audit gate](validation-plan.md).
