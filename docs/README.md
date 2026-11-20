# Documentation

**Status:** Current index for Phase 0, Stages 1–4, and the proposed M1/T-05 analytical reference; Stage 2–4 specifications and plans are proposed.
**Purpose:** Navigate product, UX, architecture, and roadmap documentation and explain how to read its decision labels.

## Recommended reading order

1. [Product vision](product/vision.md) — users, principles, and long-term direction.
2. [Product scope](product/scope.md) — assignment, validation slice, proposed public release, and future boundaries.
3. [Product requirements](product/requirements.md) — priorities, acceptance criteria, and traceability.
4. [User journeys](product/user-journeys.md) — representative first-release and future paths.
5. [Information architecture](design/information-architecture.md) — navigation, screens, and guest entry points.
6. [Workspace](design/workspace.md) — shell, editing views, lifecycle, and panels.
7. [Guided labs](design/guided-labs.md) — catalog, experiment controls, results, and workspace transition.
8. [Interaction flows](design/interaction-flows.md) — actions, system responses, and failures.
9. [Design system](design/design-system.md) — reusable visual and accessibility guidance.
10. [Workspace feasibility](design/workspace-feasibility.md) — graph checkpoint and Stage 3 decision register.
11. [Architecture overview](architecture/overview.md) — platform boundaries and dependency direction.
12. [Simulation engines](architecture/simulation-engines.md) — domain contracts and run lifecycle.
13. [Batch-first DSP runtime](architecture/dsp-engine.md) — candidate communication execution path and AM reference.
14. [Portable project format](architecture/project-format.md) — canonical model exchange and compatibility.
15. [Progressive extensibility](architecture/extensibility.md) — built-ins through future plugins and external engines.
16. [Numerical verification](architecture/numerical-verification.md) — independent references and release evidence.
17. [Architecture decisions](architecture/architecture-decisions.md) — open D-01 through D-07 recommendations and gates.
18. [Implementation boundaries](architecture/implementation-boundaries.md) — proposed package ownership and first-slice sequence.
19. [Milestones](roadmap/milestones.md) — ordered evidence and implementation gates.
20. [Proposed public MVP](roadmap/mvp.md) — bounded capabilities and graph-dependent scope.
21. [Implementation plan](roadmap/implementation-plan.md) — focused tasks with dependencies and acceptance evidence.
22. [Validation plan](roadmap/validation-plan.md) — numerical, graph, project, accessibility, browser, and self-hosting gates.
23. [Risk register](roadmap/risk-register.md) — severity, mitigation, owner roles, and triggers.
24. [Release plan](roadmap/release-plan.md) — architecture validation through public decision criteria.
25. [T-05 AM numerical reference](verification/am-reference.md) — executable analytical fixtures and evidence still required for D-01.
26. [T-06 simulation contracts](verification/simulation-contracts.md) — internal request, snapshot, provenance, and outcome design.
27. [T-07 conventional AM engine](verification/am-engine.md) — batch execution, validation policy, and numerical evidence.

The [repository README](../README.md) gives a short introduction and current status.

## Document status conventions

Each major document states its **Status** and **Purpose**. Within documents:

The documents distinguish the **university AM assignment** (a separate existing simulator and possible integration path), **conventional AM vertical slice** (a proposed architecture-validation exercise), **first public release** (a proposed bounded product), and **long-term ecosystem** (the five pillars). The platform foundation consists of agreed product principles; specific technical architecture has not been approved. A long-term pillar or assignment feature does not become a public-release commitment merely by appearing here.

- **Accepted:** An agreed product principle or direction; it does not approve a technical architecture, implementation, or release scope.
- **Proposed:** A product choice awaiting review and approval.
- **Assumption:** A working premise used to make the proposal concrete; it needs validation.
- **Open question:** A decision or fact still to resolve.
- **Future:** Direction outside the proposed first release.

Requirements inherit the decision status of the scope item they describe. A requirement marked Proposed is testable planning material, not an approved delivery commitment. Auditing the separate AM simulator is required before reusing its behavior or code.
