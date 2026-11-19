# Technical architecture overview

**Status:** Proposed Stage 3 architecture; no technical decision is Accepted.
**Purpose:** Define platform boundaries and dependency direction without enlarging the proposed first public release.
**Scope:** First implementation is one verified communication-domain vertical slice. The five long-term pillars remain Engineering Workspace, Built-in Simulations, Plugin Ecosystem, Community, and Learning; the latter two ecosystems and third-party execution are future.

## System boundaries

```mermaid
flowchart LR
  subgraph Browser[Self-hostable browser application]
    UI[Navigation, labs, workspace UI] --> APP[Application orchestration]
    APP --> PROJ[Project import/export service]
    APP --> REG[Built-in model and engine registry]
    APP --> RUN[Run controller]
    RUN --> WORKER[Dedicated computation worker]
  end
  REG --> CONTRACT[Domain-neutral contracts]
  PROJ --> CONTRACT
  WORKER --> CONTRACT
  WORKER --> COMM[Built-in communication engine]
  COMM --> MATH[Numerical primitives]
  FUTURE[Future editors, engines, plugins, community services] -. capability-gated .-> CONTRACT
```

The **browser application** owns routing, accessible controls, plots, selection, and feedback. **Application orchestration** coordinates project revisions, validation, run lifecycle, and stale-result labeling. **Project services** parse, validate, migrate only supported formats, and export portable files; they do not rely on hosted storage. **Domain engines** own numerical behavior and engineering diagnostics. A worker is proposed for responsive browser execution, not a security sandbox. The engine must also be callable in a non-UI verification environment (NFR-003). Future hosted services may add accounts or community publication but must not be required for essential run, inspect, edit, and exchange workflows (NFR-008).

## Model and editor separation

An experiment definition declares a supported domain model, defaults, metadata, and presentation guidance. A guided lab and a specialized workspace editor inspect or edit that same model, or use an explicitly checked conversion. The first communication editor may use a typed signal graph. A circuit editor might use a schematic/netlist and a controls editor a state-space or block representation. The engine contract carries a domain identifier and versioned model payload; it does not require a universal graph. Model-to-editor adapters have explicit support predicates and lossless-conversion claims. If a predicate fails, the UI explains the unsupported mapping or offers an explicit, reviewed fork; it never silently omits semantics (FR-014).

## Dependency direction

```text
UI / editor adapters / lab presentation
             ↓
application orchestration and project services
             ↓
versioned contracts ← domain engines → numerical primitives
```

Contracts define request/result envelopes, diagnostics, model metadata, and version identifiers. Engines may depend on contracts and numerical primitives but never on UI components, browser routing, or editor layout. UI code does not import engine internals. Project format contains domain model data and optional editor state, not runtime objects or executable callbacks. This is a modular monolith proposal, not a microservice plan; see [implementation boundaries](implementation-boundaries.md).

## First-release deployment

**Proposed:** static browser assets plus a locally executed built-in engine, deployable from ordinary self-hosted web serving without a proprietary managed API. No account or server project database is needed. Browser workers improve responsiveness, but fallback behavior and browser support are D-05 decisions. File import/export stays local. No claim is made that arbitrary uploaded code is safe to execute. Future community hosting, extension registries, remote engines, and managed compute are separate optional services with explicit trust boundaries.

## Cross-cutting invariants

- A run is tied to immutable model input, model/engine versions, sampling configuration, and a revision identifier. Late results cannot overwrite newer revisions.
- Validation precedes execution; input and work limits are enforced at more than the UI layer. Values for limits are D-04, not specified here.
- A reproducible project records essential model identity, version, units, and assumptions (FR-007, FR-009, NFR-002).
- Numerical references and tolerances require independent verification (D-01). The separate university AM simulator is unaudited and is not an oracle.
- The graph and conversion are proposed P0 scope but require D-02 feasibility evidence; if infeasible, product scope and priorities must be reviewed rather than quietly changed.

## Alternatives and risks

One universal graph would simplify tooling but force unrelated domains into a weak model; domain-specific editors behind shared contracts are recommended. A server-first architecture would create avoidable hosting dependency for the first release. A single UI-thread engine is simpler but risks blocking interaction; a worker is proposed while retaining a non-browser test path. These choices are recommendations, not approval of specific packages, protocols, or deployment topology.

## Open questions and traceability

Open: D-01 through D-07 in [architecture decisions](architecture-decisions.md), especially graph feasibility, browser support, and resource budgets. Related [Stage 1 requirements](../product/requirements.md): FR-001–FR-009, FR-014, NFR-001–NFR-008; future FR-010–FR-013. Related [workspace design](../design/workspace.md) and [feasibility checkpoint](../design/workspace-feasibility.md).
