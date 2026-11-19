# Visual graph editor feasibility

**Status:** Proposed Stage 2 assessment and checkpoint; feasibility is not established.  
**Purpose:** Define the minimum evidence needed before committing the limited graph editor and simulation conversion to the first public release.  
**Scope:** First communication-domain graph only. A general DSP engine, other domain editors, third-party plugin execution, and community hosting are **Future**.

## Minimum useful editor

The smallest useful graph must let a user add supported blocks, configure their parameters, create, remove, and reroute connections between compatible ports, identify signal direction, run a valid model, inspect outputs and diagnostics, undo/redo edits, and export/reopen the model. Mere drag-and-drop placement is insufficient. The current proposed block set is **source**, **carrier**, **conventional AM modulator**, and **result/plot**; exact block semantics and whether source/carrier are separate types remain open.

**Construction threshold:** starting from an empty supported project, a user must be able to choose and place the required block types, connect them into a runnable signal path, deliberately break and repair a connection, change a parameter, and observe the resulting change after a run. Removing or reconnecting a block must update execution semantics or produce a specific validation error. Moving fixed blocks on a canvas, cosmetically rearranging a prewired AM experiment, or editing only parameters does not satisfy FR-005. The first release may restrict block count and topology, but must disclose those constraints and permit meaningful user construction within them; the supported topology remains a Stage 3 decision.

Ports need declared signal type and compatible quantity/unit expectations where applicable. A connection attempt must validate direction, type, multiplicity, and required inputs; rejection should explain the incompatible endpoints. The editor needs an accessible non-pointer path for selecting nodes/ports, creating and removing connections, and reading graph structure. Visual wires and color are supplementary.

## Model, execution, and persistence dependencies

The graph must map to a supported simulation model without moving numerical formulas into UI components. A run validates graph completeness and cycles or unsupported topology as applicable, constructs a simulation request, and associates diagnostics and results with the exact model revision. This does not require a general DSP graph engine in the first release. It does require a narrow execution path with explicit supported topology and an interface independent of the UI. Whether a future DSP engine reuses that path is an open architecture question.

Parameter changes propagate to dependent simulation inputs according to documented model semantics. The inspector, graph labels, guided controls, and model inspection must agree on value, unit, sampling configuration, and model/version. Conversion from built-in simulation to graph must preserve these semantics and yield equivalent results within later-approved tolerances. If no faithful mapping exists, the action fails clearly or offers an explicit fork with a change summary. No best-effort silent omission is acceptable.

Undo/redo must cover add/remove, connect/disconnect, and committed parameter edits while preserving a valid history boundary. Project export/import must restore model, blocks, connections, parameters, metadata, and format version; panel layout need not be part of the portable project. Malformed or unsupported files must not replace current work. Resource limits and validation messages must be designed before execution is exposed; no limits are set here.

## Complexity and risks

| Area | Why it is material | Evidence needed |
| --- | --- | --- |
| Engineering semantics | Graph topology, typed ports, units, sampling, and equations must agree with the simulation model | Reviewed mapping and reference examples independent of UI |
| Conversion | Guided models may contain assumptions or parameters absent from visible blocks | Round-trip inventory of preserved fields; explicit unsupported/fork behavior |
| UX and accessibility | Canvas manipulation can exclude keyboard, touch, and screen-reader users | Task walkthrough for create, connect, edit, run, and inspect using keyboard and assistive technology plan |
| Undo/persistence | Compound edits and imports can corrupt or silently alter models | Edit-history scenarios and export/reopen round trip |
| Numerical integrity | UI libraries do not establish simulation correctness | Independent reference cases and declared tolerances before release |
| Resource and failure handling | Invalid or large graphs can hang or produce ambiguous partial results | Defined rejection, cancellation, and stale-result behavior with budgets approved later |

## Recommended feasibility checkpoint

Conduct before confirming the graph in public-release scope. The checkpoint is a design and implementation spike, not an assumption that an available graph library solves the problem. Exit only when reviewers can demonstrate or validate all of the following with a representative conventional AM model:

1. From an empty project, a user can construct a runnable supported graph, break and repair a connection, and inspect the changed model through pointer and keyboard paths. Reviewers observe a real execution or validation difference from connection edits; moving prewired blocks alone fails this criterion.
2. The same supported model opens from the built-in simulation without losing parameters, units, sampling configuration, assumptions, or version metadata; unsupported cases fail clearly or require an explicit fork.
3. A UI-independent simulation path runs the graph and guided model equivalently against approved reference cases and tolerances.
4. Undo/redo and portable export/import preserve supported graph semantics across a fresh session and self-hosted deployment.
5. Invalid input, engine failure, cancellation, and stale results are distinguishable and recoverable.
6. The team has a credible estimate and accessibility plan for completing the editor within the approved release scope. The support policy and resource budgets must be decided before release, not invented by this checkpoint.

If any criterion fails, document the failure and return the public-release scope to product review. Do not quietly mark graph-dependent P0 requirements as satisfied or ship a misleading disabled editor.

## Key design decisions and alternatives

**Alternative:** release the verified guided simulation and model inspection first, with the graph editor later. This reduces interaction and execution risk but does **not** meet the current proposed P0 graph and conversion requirements (FR-005, FR-006, FR-014) or the Stage 1 first-public-release scope as written. Choosing it requires an explicit product-scope revision and updated requirement priorities. A narrower graph with fixed topology may be another candidate if it still gives meaningful construction and passes all exit criteria.

**Recommendation:** keep the limited graph as a proposed MVP capability while treating it as the primary feasibility gate. Approve a first-release graph only after the checkpoint; otherwise request a deliberate Stage 1 scope decision. A library evaluation may inform interaction cost, but cannot substitute for semantic, numerical, persistence, and accessibility evidence.

## Open questions

- What is the minimum meaningful editable topology and block set for the first communication example?
- Which model fields need visible graph elements versus inspector-only metadata?
- Can the first editor be usable on the approved mobile/tablet support range?
- Which future DSP capabilities, if any, should constrain the first graph interface?
- Who approves numerical references, tolerances, accessibility criteria, and the checkpoint outcome?

## Stage 3 technical architecture decision register

The register records decisions to make, not decisions already approved. Stage 1 product principles and requirement priorities remain unchanged. Each decision needs a documented rationale and evidence before implementation or release commitments depend on it.

| ID | Decision to resolve | Evidence / decision gate | Related requirements | Status |
| --- | --- | --- | --- | --- |
| D-01 | Numerical reference cases and tolerances for the first model | Independently derived cases, boundary behavior, units, sampling assumptions, and comparison method; audit the separate assignment simulator before reuse | FR-003, FR-006, FR-014; NFR-001–NFR-002 | Open |
| D-02 | Graph construction boundary and conversion coverage | Enumerate supported blocks, topologies, and model fields; demonstrate faithful built-in-to-workspace conversion or explicit unsupported/fork behavior | FR-005–FR-006, FR-014; NFR-007 | Open; graph feasibility gate |
| D-03 | Portable project format and version policy | Define what model, metadata, and version data must round-trip; test malformed and unsupported files without replacing work; avoid coupling essential exchange to hosted services | FR-007–FR-009; NFR-002, NFR-006, NFR-008 | Open |
| D-04 | Resource budgets and failure policy | Measure representative models and devices, then set input, graph, computation, and cancellation limits with clear rejection behavior | NFR-005 | Open |
| D-05 | Browser and device support | Choose a support matrix using first-release workflows, self-hosted deployment, and graph feasibility evidence; document any device-specific editing limits | NFR-002, NFR-004, NFR-008 | Open |
| D-06 | Accessibility acceptance standard and evaluation | Approve a release standard; evaluate keyboard, screen-reader, plots, diagnostics, and graph construction against it | NFR-004; FR-005, FR-014 | Open |
| D-07 | Minimal extension boundary | Decide which internal contracts preserve future editor/engine growth without promising a public plugin API or third-party execution in the MVP | NFR-003, NFR-007; future FR-011–FR-012 | Open |

No numeric tolerance, performance target, browser matrix, resource budget, project schema, or accessibility certification is inferred by this register. If D-02 fails, return the proposed public MVP and graph-dependent P0 requirements to product review rather than silently changing scope.

## Related documents and traceability

[Stage 1 scope](../product/scope.md), [requirements](../product/requirements.md), [workspace](workspace.md), [guided labs](guided-labs.md), [interaction flows](interaction-flows.md), [design system](design-system.md). Relevant IDs: FR-005–FR-009, FR-014, NFR-001–NFR-008; future FR-011–FR-012.
