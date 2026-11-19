# Portable project format

**Status:** Proposed Stage 3 representation; exact schema and migration policy remain D-03.
**Purpose:** Define portable, versioned exchange without coupling projects to a browser session or hosted community service.
**Scope:** First-release local export/import for a supported communication model. Hosted sync, publishing, and cross-domain project composition are future.

## Three distinct data classes

1. **Project model (canonical):** the domain-owned model identity and version, parameters, topology when applicable, units, sampling configuration, and assumptions needed to rerun. For the first communication slice, simulation-relevant graph nodes and connections belong here. A guided definition can instantiate this model but is not itself the saved numerical source of truth. The model must not depend on editor pixel positions.
2. **Editor layout (optional):** node positions, open panels, viewport, and presentation preferences. It may be discarded or regenerated without changing simulation semantics. Portable files may include supported layout for convenience; whether browser-only layout preferences belong in the file is open.
3. **Simulation results and execution plans (derived):** plots, sample buffers, and compiled plans are not canonical model data. The proposed first format omits them; an optional future result attachment would need model/engine/version provenance, size limits, and invalidation rules. Reopening validates and recompiles the model, then reruns to reproduce results rather than trusting a stored plot or plan.

## Illustrative envelope

This JSON is a **proposal**, not an approved schema or extension. Field names and version values are illustrative.

```json
{
  "format": "openee-project",
  "formatVersion": "proposed-v1",
  "model": {
    "domain": "communications",
    "kind": "communication-signal-graph",
    "modelVersion": "example-model-version",
    "parameters": { "messageAmplitude": { "value": "<number>", "unit": "V" } },
    "sampling": { "sampleRate": { "value": "<number>", "unit": "Hz" } },
    "assumptions": ["illustrative only"],
    "representation": { "kind": "communication-graph", "nodes": [], "edges": [] }
  },
  "editor": { "representation": "communication-graph", "layout": {} }
}
```

The quoted `<number>` markers and empty graph are placeholders, so this example is not an importable project or a valid AM default. The built-in experiment's identity may be retained as noncanonical provenance, but the communication model kind identifies the graph semantics, including user-constructed graphs that differ from the built-in topology. A real schema must identify every required parameter and allowed unit. Model identity/version and format version serve different purposes; engine implementation version belongs in run provenance and may also be recorded as an informational project hint, but must not override model semantics.

## Serialization and import contract

Export reads a stable model revision, validates it, serializes only data, and offers a file whose contents are independent of proprietary services. A successful browser download must not be claimed until the platform can observe completion; otherwise report that export was initiated. Import is transactional: constrain input size, parse without executing content, validate envelope and supported version, validate domain payload and numerical finiteness, then present compatibility or migration information before replacing current work. Invalid or unsupported files leave the current project unchanged (FR-008). Protect against malformed nesting, oversized arrays/graphs, unexpected keys where policy requires, unsafe filenames, and HTML/script injection through text fields. A browser worker can keep parsing responsive but is not a security boundary for hostile code.

## Compatibility and migration

**Proposed:** distinguish format compatibility from model compatibility. A future format reader may migrate a known older envelope through explicit, tested, one-way transformations; never silently reinterpret model meaning or drop unknown scientific fields. Unsupported future versions fail with a clear reason and preserve the current project. If an editable representation cannot preserve a built-in model, conversion fails or offers an explicit fork with an itemized loss/change summary (FR-014). Importing a valid project does not imply the current editor can edit it; read-only inspection may be offered only if semantics can be faithfully displayed.

Round-trip verification compares the canonical model before export and after import, not byte-for-byte JSON ordering or editor coordinates. For the built-in simulation, compare its instantiated canonical model with the graph-opened model field by field before comparing compiled plan semantics and rerun outputs. For a user-constructed graph, preserve its own supported topology and parameters; do not replace it with the built-in recipe. Rerun comparison uses D-01 references and tolerances. No schema version, migration chain, compression, MIME type, or file extension is finalized here.

## Alternatives, open questions, and traceability

**Alternative:** save opaque engine objects or browser storage keys. This would make exchange fragile and hosted/self-hosted portability difficult. **Proposed:** a plain data envelope with domain-specific model payload and optional presentation data. Open D-03: required fields, supported versions, migration policy, size policy, and extension handling. Related [overview](overview.md), [simulation engines](simulation-engines.md), [extensibility](extensibility.md), [Stage 1 requirements](../product/requirements.md): FR-007–FR-009, FR-014, NFR-002, NFR-005–NFR-008; future FR-010, FR-013.
