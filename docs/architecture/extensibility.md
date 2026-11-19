# Progressive extensibility

**Status:** Proposed Stage 3 architecture; third-party execution and external engines are future.
**Purpose:** Preserve a path from built-in functionality to a governed extension ecosystem without exposing an unsafe MVP plugin API.
**Scope:** Only built-in nodes, models, editors, and tools are proposed for the first public release. The later stages below are not first-release commitments.

## Extension ladder

| Stage | Capability | Trust and compatibility boundary | Scope |
| --- | --- | --- | --- |
| 1 | Built-in nodes and tools | Reviewed code distributed with the application; internal versioned model/engine contracts | Proposed MVP, limited communication slice |
| 2 | Reusable subgraphs | Data-only composition of approved nodes; validate cycles, types, size, and versions | Future |
| 3 | Restricted math expressions | Parsed expression language with allowlisted operations and bounded evaluation; no arbitrary JavaScript or dynamic imports | Future |
| 4 | Sandboxed third-party plugins | Explicit package provenance, permissions, capability negotiation, isolation, revocation, and update policy | Future; requires separate security design |
| 5 | External simulation engines | Explicit transport, authentication, data policy, version handshake, resource accounting, and result provenance | Future |

The ladder is a risk progression, not a promise that every stage must use one common plugin mechanism. A built-in circuit engine can be added through reviewed source without third-party plugin execution. A reusable subgraph is project data and still requires model validation. Restricted expressions need an AST interpreter or equivalent constrained evaluator and a formal resource policy; treating arbitrary code as an expression is outside this design.

## Capability and version negotiation

**Proposed internal descriptor:** component identity, provider, version, supported model kinds/versions, input/output quantities and units, deterministic/stateful claims, required capabilities, and compatibility range. At load or import, the host resolves exact compatible versions and either enables the feature or explains the missing capability. There is no silent downgrade that changes simulation meaning. Future plugin APIs need independent versioning from project format and engine versions. Projects referencing unavailable extensions must remain inspectable only where semantics can be represented faithfully; running them is blocked until compatible capabilities are present.

## Trust boundaries

Trusted built-ins are part of the reviewed application supply chain, but still receive validated inputs and resource limits. User project files are untrusted data and never executable merely because they contain a node name. Ordinary browser workers separate work from the UI thread; they are **not** secure isolation for hostile code. Third-party plugin execution requires a threat model covering filesystem/network access, data exfiltration, CPU/memory abuse, UI spoofing, extension updates, and revocation. Possible isolation mechanisms require future evaluation; no mechanism is approved here. External engines cross a network and governance boundary and cannot be required by essential self-hosted first-release workflows.

## Integration rules

The host owns project validation, user-visible permissions, diagnostics, and run provenance. An extension may declare capabilities but cannot silently claim a model version it does not implement. Editor contributions are separate from simulation engines; a custom editor does not automatically get execution privileges. Domain-specific payloads remain behind the shared engine envelope, preserving the ability to add non-graph disciplines. Community discovery and hosted installation are separate future product features, with privacy, licensing, moderation, and attribution decisions under FR-010 and FR-013.

## Alternatives, open questions, and traceability

**Alternative:** expose a public plugin API immediately. This would freeze contracts before graph/model and numerical semantics are validated; recommend internal boundaries first (D-07). **Alternative:** use workers as a plugin sandbox; rejected as a security claim. Open: extension package format, permissions, isolation, compatibility policy, expression language, and external-engine data governance. Related [overview](overview.md), [simulation engines](simulation-engines.md), [project format](project-format.md), [implementation boundaries](implementation-boundaries.md), [Stage 1 requirements](../product/requirements.md): NFR-005, NFR-007–NFR-008; future FR-011–FR-013.
