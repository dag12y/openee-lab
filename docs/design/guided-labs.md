# Built-in simulations and guided labs

**Status:** Proposed Stage 2 UX specification; experiment content and numerical behavior require verification.  
**Purpose:** Define a reusable discovery and guided-experiment pattern without making AM the platform identity.  
**Scope:** One verified communication example, currently proposed as conventional AM, for the first public release. Other AM variants and domains are not integrated by this specification. Educator authoring is **Future**.

## Catalog and detail

The built-in catalog is organized by engineering domain and experiment purpose. It lists only working, verified experiments; a category with no available experiments is hidden or presented as clearly future editorial content, never as a launchable card. Each item exposes title, domain, short purpose, model identity/version, supported views, and whether it can open in the workspace. Search and filters are warranted only when the catalog size makes them useful.

A detail page explains the engineering question, prerequisites, model assumptions, controllable parameters, output types, and known boundaries. **Launch simulation** is the primary action. If the model is workspace-compatible, the detail may explain the transition. The university simulator's DSB-SC, SSB, and VSB modes do not appear merely because they exist separately; audit and integration are prerequisites.

## Guided simulation interface

**Proposed layout:** title and model/version header; concise task and explanation; parameter panel; run/status controls; time and spectrum results; equations/model-inspection panel; diagnostics and interpretation. At narrow widths, preserve this reading order in one column. The user can inspect the model without running, but results identify the exact run revision that produced them.

Parameter controls show quantity name, symbol where helpful, unit, editable value, constraints, and a short consequence of change. Use numeric input with unit-aware parsing and explicit validation; sliders may complement, never replace, precise input. Record sampling configuration with the model. Do not silently clamp out-of-range values. Distinguish blocking invalid inputs from engineering warnings that allow a run but call attention to interpretation. Warning thresholds and numerical limits are open decisions.

**Conventional AM illustration:** expose the message and carrier quantities and sampling settings supported by the verified model. Show waveform and spectrum views with labeled axes, units, legends, and a text summary of key observations. Equations explain the exact model and assumptions used by the run. A plot should distinguish signal traces without relying solely on color. Frequency content and sideband explanations must be checked against numerical reference cases before publication; the separate assignment simulator is not a source of truth until audited.

## Run, presets, and reset

**Proposed run policy:** edits mark results stale; the user explicitly runs to recompute. This makes the model/result relationship visible and avoids unexpected expensive work. Lightweight live previews are a future option only after resource and numerical behavior are understood. During a run, show active model revision and progress/status if known; do not fabricate percent progress. A failed run preserves the prior result as clearly stale and the current editable inputs. Validation blocks a run until corrected.

The first release requires one documented default and reset behavior (FR-004). Additional named presets are **Proposed P1 UX enhancement**, not a Stage 1 requirement: if supplied, each preset must state its model/version and input values. Reset restores documented defaults and either reruns or visibly prompts for a run, exactly as FR-004 allows. It does not silently discard unsaved project edits without warning when the lab has become a project.

## Learning and interpretation

A guided explanation presents a question, a prediction prompt where useful, the observed result, and a concise interpretation tied to plotted quantities. Learning mode is a **Proposed presentation mode**, not a separate numerical engine: it can reveal steps and explanations while using the same validated model and results. The first-release minimum is clear explanations and equations under FR-003; graded exercises, instructor authoring, and learner accounts are **Future**. Avoid treating an educational narrative as evidence of numerical correctness.

## Transition to the workspace

**Open in workspace** is shown only for models with a verified editable mapping. Before transition, the user can inspect model identity/version, units, sampling configuration, assumptions, and parameter values. A successful transition carries those semantics into an editable project and runs equivalently within later-approved tolerances. Unsupported mappings show a reason and leave the lab unchanged; an explicit fork may be offered only with a visible summary of changed or omitted behavior. The limited graph and this transition depend on the [feasibility checkpoint](workspace-feasibility.md).

## Key design decisions and alternatives

**Proposed:** Explicit run and visible stale-result status support reproducibility. **Alternative:** automatic recomputation may feel faster but needs known resource costs and precise cancellation behavior. The catalog stays domain-neutral even if it initially contains one communication experiment. A guided lab and editable graph use compatible supported models, not separate formulas maintained by the UI.

## Open questions

- Which model assumptions, reference cases, and tolerances will be approved after audit?
- Which preset, if any, is needed beyond the documented default?
- Should runs cancel or complete against their original revision when parameters change mid-run?
- Which learning content is essential to the first release versus a later increment?

## Related documents and traceability

[Stage 1 vision](../product/vision.md), [scope](../product/scope.md), [requirements](../product/requirements.md), [information architecture](information-architecture.md), [workspace](workspace.md), [interaction flows](interaction-flows.md). Relevant IDs: FR-001–FR-004, FR-009, FR-014, NFR-001–NFR-005, NFR-008.
