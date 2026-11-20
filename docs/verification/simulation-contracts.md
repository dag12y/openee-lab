# T-06 internal simulation contracts

**Status** — Implemented for internal review. D-01 through D-07 remain Open.

The private TypeScript package owns model and engine references, quantity and sampling metadata, diagnostics, input snapshots, run identity, provenance and the generic engine interface. The package depends on standard JavaScript at runtime. Its interfaces may evolve with built-in engine integration. Domain engines own the meaning of model fields, units and results. [Contracts source](../../packages/contracts/src/index.ts) · [Architecture proposal](../architecture/simulation-engines.md)

## Lifecycle and capabilities

A built-in resolves and validates the canonical model and execution parameters, then immediately calls `createValidatedInput` with those values. The caller queues a request with its run ID, model revision, exact engine version and requested output kinds. Capability matching compares the exact engine and model identity/version and requires one matching descriptor entry to support all requested output kinds. An empty output list only checks identity compatibility. Unsupported engine, model and output selections are explicit.

At execution entry, use `provenanceFor(request)` to check snapshot origin and capture request correlation, requested outputs, sampling and assumptions. Use that provenance for success and publish outputs with units for each named result. Rejection, acknowledged cancellation and failure carry context and diagnostics. A pre-validation rejection can omit the fingerprint. The discriminated union excludes outputs from all unsuccessful outcomes. Diagnostic codes are stable machine keys such as `am.invalid-parameter`. Messages explain the issue in human terms. Locations refer to stable model IDs or field paths, with optional remediation text.

A cooperative token exposes the current cancellation request. The engine checks it at safe points and emits `cancelled` when it acknowledges the request. A pending request can still lead to success or failure.

## Snapshot identity

The factory copies and recursively freezes finite primitives, dense arrays and plain data records. Built-ins must normalize mutable input buffers to numeric arrays before validating and snapshotting them. Derived outputs may use typed arrays under the owning engine's output contract. Snapshot data has value semantics, so reference sharing and record insertion order carry no meaning.

The provisional fingerprint encodes the exact copied model, identity/version, sampling and assumptions as deterministic text with sorted record keys and explicit signed zero. The factory derives it internally. A process-local weak set lets `provenanceFor` reject copied or forged envelopes before use. This check establishes local factory origin. Built-in validators remain responsible for semantic correctness. The text has size proportional to the input, exposes its contents, and must be kept out of routine logs. It provides no cryptographic authentication or portable format guarantee. A worker must revalidate and recreate the snapshot locally before comparing the expected identity.

## Domain examples and follow-up

The compile-time examples bind a communication engine to a carrier-frequency model and sampled output, and a circuit engine to a resistor model and voltage output. Each uses its own payload without a shared graph. [Contract tests](../../packages/contracts/src/contracts.test.ts)

T-07 must define the domain validation, numeric representation, output units and provisional resource guards used before copying and execution. T-08 must define request ownership when queuing, worker handoff and revalidation, cancellation checkpoints and stale-result handling. Portable format, measured budgets and extension policy remain D-03, D-04 and D-07. [T-06–T-08](../roadmap/implementation-plan.md) · [Decisions](../architecture/architecture-decisions.md) · [NFR-003, NFR-005 and NFR-007](../product/requirements.md)

## Verification tooling

Run `npm ci --ignore-scripts` and `npm test` in `packages/contracts`. This uses the T-05 pins for TypeScript 5.9.3 (Apache-2.0) and Node declarations 24.19.2 (MIT), including transitive `undici-types` 7.24.6 (MIT). Node's built-in test runner exercises runtime behavior after compilation checks positive and negative type cases. Dependencies stay in development and use an integrity lockfile. Review advisories and licenses on upgrades. [Lockfile](../../packages/contracts/package-lock.json) · [Dependency policy](../decisions/licensing-and-dependencies.md)
