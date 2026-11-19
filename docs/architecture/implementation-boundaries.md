# Implementation boundaries

**Status:** Proposed Stage 3 repository and dependency organization; package names are illustrative.
**Purpose:** Keep the first vertical slice achievable while preserving platform growth paths.
**Scope:** Documentation for a future monorepo implementation, not a request to create packages or install dependencies now.

## Proposed repository shape

```text
apps/
  web/                 browser UI, routing, accessible interaction
packages/
  contracts/           versioned envelopes, diagnostics, model identity
  project/             portable validation, import/export, migrations
  simulation-core/     run orchestration and numerical primitives
  engine-communications/  first domain model and batch execution
  editor-communications/  guided/model/graph adapters (graph gated)
  ui/                  reusable visual components and tokens
```

These are logical ownership boundaries, not a required build tool or package-manager layout. A single repository and deployable browser application are sufficient initially. No microservice split or separate backend is required for essential first-release workflows.

## Responsibilities and interfaces

| Area | Owns | Must not own |
| --- | --- | --- |
| `contracts` | Domain/model identifiers, run/result envelopes, diagnostics, capability descriptors | AM equations, UI components, universal graph schema |
| `project` | Safe data parsing, format/version checks, migrations if approved, export | Engine execution, hosted accounts, trusted interpretation of arbitrary file code |
| `simulation-core` | Run lifecycle, resource/cancellation hooks, numerical primitives | DOM, routing, graph canvas |
| `engine-communications` | Communication model validation, AM behavior, provenance | React/Vue/etc. components, editor layout |
| `editor-communications` | Model-to-guided/graph mappings and supported conversion coverage | Numerical source of truth |
| `apps/web` and `ui` | Navigation, controls, plots, accessibility, worker coordination | Hidden scientific formulas or canonical project semantics |

**Public versus internal:** portable project format and documented model semantics are user-facing compatibility commitments once approved. Internal TypeScript interfaces may evolve during the first slice. No public plugin SDK, extension loading contract, or remote-engine API is promised. Future third-party capability requires security and version governance under D-07.

## First implementation increments

1. Define and independently verify the conventional AM model and sampling/FFT conventions; audit the separate university simulator before reusing it (D-01).
2. Implement UI-independent finite batch execution and model metadata/diagnostics, then a guided simulation and model inspection path.
3. Spike genuine graph construction, connection validation, keyboard access, and semantics-preserving conversion (D-02). Confirm or return public scope to product review before claiming the graph P0 requirements.
4. Add portable project exchange and safe import/version behavior (D-03), then verify the entire flow in a self-hosted deployment.
5. Measure resource limits (D-04), test selected browsers/devices (D-05), and evaluate accessibility (D-06) before release.

This sequence is a dependency plan, not a silent guided-only MVP revision. The first public release still proposes the limited graph; a failed spike requires explicit product approval to change Stage 1 scope and priorities.

## Dependency constraints and enforcement

Allow dependency flow from UI and adapters toward contracts, project services, and engines, never from engines back into UI. Engine numerical tests run without browser mounting. Enforce package import rules and cycle checks when implementation exists. A build-time or test-time boundary check should reject DOM/UI dependencies in engine packages; review generated bundles for unintended hosted-service requirements. Contract tests cover request/result compatibility and diagnostics. Model-to-editor conversion tests cover all supported fields and deliberate unsupported cases. Project round-trip tests compare canonical models and fresh-session reruns. Verification uses independent references and declared tolerances, not mirrored implementation tests.

## Intentionally deferred

General DSP streaming and filtering, circuit/control/digital engines, a universal graph, user-authored expressions, reusable subgraphs, third-party plugin execution, external engines, hosted project storage, community publishing/forking, and managed compute. The assignment's DSB-SC/SSB/VSB integration is a separate audited path and does not automatically expand public MVP scope.

## Alternatives, open questions, and traceability

**Alternative:** begin with independently deployed services and a public SDK. This increases operational and compatibility cost before first-slice evidence; recommend modular packages within one application. Open: exact package names, build tooling, D-01–D-07 decisions, and whether the graph checkpoint justifies its first-release cost. Related [overview](overview.md), [decisions](architecture-decisions.md), [Stage 1 requirements](../product/requirements.md), [Stage 2 workspace](../design/workspace.md), and [feasibility](../design/workspace-feasibility.md). Traceability: FR-001–FR-009, FR-014, NFR-001–NFR-008; future FR-010–FR-013.
