# Product requirements

**Status:** Draft; first-public-release requirements are Proposed, product principles are Accepted for further planning.  
**Purpose:** Give testable expectations for the proposed first release and trace future platform capabilities separately.

**Priority:** P0 = required for the proposed public MVP; P1 = desirable after its core flow; Future = outside this MVP. All entries below remain proposals until scope is approved. P0 graph requirements are conditional on the [feasibility checkpoint](scope.md#proposed-first-public-release-mvp). Acceptance criteria describe observable behavior, not current functionality or an approved technical architecture.

## Functional requirements

| ID | Priority | Requirement | Acceptance criterion |
| --- | --- | --- | --- |
| FR-001 | P0 | Open the guided AM lab without an account | A new visitor reaches and runs the lab without registration or sign-in. |
| FR-002 | P0 | Edit conventional AM parameters | Valid message amplitude/frequency, carrier amplitude/frequency, and sampling settings can be changed; invalid values are identified and do not start a run. |
| FR-003 | P0 | Explain and visualize the lab result | For a valid run, time and frequency views, relevant equations, parameter values, and units are visible; changing a parameter updates the corresponding result. |
| FR-004 | P0 | Reset the guided lab | Reset restores documented defaults and reruns or clearly prompts for a run, yielding the same output as the initial defaults. |
| FR-005 | P0 | Build a supported communication graph | A user can place, connect, and configure the approved built-in source, carrier, AM modulator, and result blocks; unsupported or incomplete connections produce actionable errors. |
| FR-006 | P0 | Run and inspect a supported graph | A valid graph runs and exposes its parameters, connections, and output plots; an equivalent lab and graph model give matching results within documented numerical tolerances. |
| FR-007 | P0 | Exchange and reopen a project locally | A project can be exported as a portable file and reopened in a fresh browser session without an account or managed service; supported blocks, connections, parameters, essential metadata, and format version are restored. |
| FR-008 | P0 | Handle incompatible project files | Malformed or unsupported-version files are rejected with a clear explanation and do not replace the current project. |
| FR-009 | P0 | Inspect essential model metadata | The user can see the model identity and version, units, sampling configuration, and assumptions used for a result and included in supported project exchange. |
| FR-010 | Future | Share a project through a hosted service | Hosted sharing requires an approved storage, privacy, access, and operations model; local portable exchange under FR-007 needs no hosted service. |
| FR-011 | Future | Add specialized editors and domain engines | Each proposed domain identifies its model, engine, editor needs, and independently testable reference cases before delivery. |
| FR-012 | Future | Run third-party extensions | Plugin loading and execution require an approved permission, isolation, compatibility, and resource-limit design before acceptance criteria are finalized. |
| FR-013 | Future | Publish, discover, and fork | Community workflows require approved hosting, privacy, licensing, moderation, and attribution policies before acceptance criteria are finalized. |
| FR-014 | P0 | Move a built-in simulation into the workspace | A supported built-in simulation opens as an editable workspace model with equivalent parameters, metadata, and results within declared tolerances; an unsupported conversion fails clearly or requires an explicit fork, and never silently drops information. |

## Nonfunctional requirements

| ID | Priority | Requirement | Acceptance criterion |
| --- | --- | --- | --- |
| NFR-001 | P0 | Numerical correctness | Documented reference cases, including normal and boundary inputs, pass against independently derived expectations within declared tolerances; failed cases block release. |
| NFR-002 | P0 | Reproducibility | The same project, model version, and settings produce the same result within declared tolerances on supported browsers; any nondeterminism is documented. |
| NFR-003 | P0 | UI-independent simulation | The simulation core can be invoked and checked without mounting the browser UI; UI presentation does not alter numerical results. |
| NFR-004 | P0 | Accessibility | The core lab, graph, run, inspect, save, and reopen flows work by keyboard; controls have accessible names, results have text alternatives, and errors are announced or described in text. A release standard remains to be approved. |
| NFR-005 | P0 | Input and resource safety | Invalid numeric inputs, oversized projects, and work exceeding a defined computation budget fail safely with clear feedback; limits are specified before release. |
| NFR-006 | P0 | Data handling | Local save/reopen works without account or server-side project storage; the user is informed when an action would leave the browser. |
| NFR-007 | P0 | Modularity | The first communication model and simulation contract have documented boundaries independent of the UI; review confirms they do not require future disciplines to use its graph representation. A public plugin API is not required. |
| NFR-008 | P0 | Open-core portability | The first release's essential run, inspect, edit, and portable project exchange workflows operate in a self-hosted deployment without proprietary managed services; verify the same supported workflow in that deployment before release. |

## Traceability

| Product outcome / scope area | Journey | Requirements |
| --- | --- | --- |
| Account-free built-in simulation and learning | [First-time visitor](user-journeys.md#first-time-visitor); [student](user-journeys.md#student-using-a-guided-am-lab) | FR-001–FR-004, FR-009, NFR-001, NFR-004 |
| Supported communication workspace | [Graph builder](user-journeys.md#user-building-a-signal-processing-graph) | FR-005–FR-006, NFR-001–NFR-005, NFR-007 |
| Built-in simulation to editable project | [Simulation-to-workspace](user-journeys.md#built-in-simulation-to-editable-workspace) | FR-003, FR-005–FR-007, FR-009, FR-014, NFR-001–NFR-003 |
| Portable local project continuity | [Save/reopen](user-journeys.md#user-saving-and-reopening-a-project) | FR-007–FR-009, NFR-002, NFR-005–NFR-006, NFR-008 |
| Future editor and domain growth | [Future journeys](user-journeys.md#future-journeys) | FR-011, NFR-007–NFR-008 |
| Future plugin and community ecosystem | [Future journeys](user-journeys.md#future-journeys) | FR-010, FR-012–FR-013, NFR-005, NFR-008 |

## Decisions still required

Stage 2 must confirm assignment integration needs; run the graph and conversion feasibility checkpoint; and decide public-release breadth, graph blocks, conversion coverage, numerical reference cases and tolerances, supported browsers, accessibility release standard, resource limits, project exchange format/version policy, and minimal extension boundary. Future requirements FR-010–FR-013 describe gates, not approved delivery dates or complete acceptance criteria. No numerical tolerances, performance targets, browser policy, resource budgets, or schema details are approved here.
