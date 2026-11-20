# T-08 simulation run lifecycle

**Status** — Implemented for the built-in AM engine and verified in Node. D-01 through D-07 remain Open.

## Controller and result eligibility

`RunController` takes an execution adapter. `submit(model, outputs)` validates synchronously, creates an immutable input snapshot, and returns a process-local run ID. `completed(id)` awaits the terminal outcome. `history` retains all run records and `current` exposes only an eligible success. Each record includes the model and engine versions, model revision, requested output list, fingerprint when validated, dispatch flag and cancellation request flag.

Validation can terminate as rejected or failed. Validated requests queue until the next microtask, then enter running and finish as success, rejected, cancelled or failed. Terminal records stay terminal. A new submission supersedes an older queued request. Running requests may finish out of order and remain in history. `edit()` advances the revision, clears result eligibility and cancels any queued latest request. Call it when the editing model changes. The newest submission in the current revision is the only candidate for current success. Pending, failed and cancelled candidates leave current empty, while earlier successes remain accessible in history. [Controller source](../../packages/simulation-core/src/index.ts)

## Dispatch and cancellation

The adapter receives a bounded JSON string carrying canonical AM scalars, expected fingerprint, correlation IDs, versions and output kinds. Negative zero has an explicit wire representation. The receiver checks a 4,096 UTF-16 code-unit cap before parsing and accepts only the fixed envelope, shallow records and scalar fields. Identity strings are capped at 128 code units, fingerprints at 2,048, and output lists at two entries. The decoder avoids recursive object copying. The worker checks capabilities, reruns AM validation including the 2,048-sample guard, creates a local snapshot and compares its fingerprint before running. Fingerprints contain input-derived data and should stay out of logs. This wire shape is provisional and separate from portable projects. [Dispatch source](../../packages/simulation-core/src/dispatch.ts)

The Node adapter uses a fresh worker per dispatch, so computation runs off the controlling thread. It delivers cancellation with an atomic shared flag that the synchronous engine can observe at checkpoints. Queued cancellation is acknowledged locally. Running cancellation remains pending until the outcome arrives. A late request can race with success, and a worker error or premature exit becomes failure even when cancellation is pending. The adapter cleans up a worker after its response. There is no cancellation hard stop or watchdog in this increment. The next run gets a fresh worker after failure. The controller checks response association before publishing it and retains the first terminal outcome. [Node adapter](../../packages/simulation-core/src/node-adapter.ts)

This internal seam trusts the configured worker implementation and incoming outcome types. It provides no third-party code isolation. The message cap covers dispatch validation, with trusted application code responsible for the transport itself. Run history and simultaneous workers are unbounded at controller level. M2 browser integration must wire edits and display eligibility, choose cooperative cancellation or worker termination semantics for the supported environment, and plan bounded concurrency and retention. Node shared memory evidence does not establish browser support.

## Verification and decisions

Run `npm ci --ignore-scripts` followed by `npm test` in `packages/simulation-core`. The package uses the existing locked TypeScript and Node type tooling, local contracts and AM engine source, and Node's built-in worker and test modules. Tests exercise actual worker success, shared cancellation and crash recovery along with deterministic adapter-controlled ordering, rejected messages and stale results. [Lifecycle tests](../../packages/simulation-core/src/lifecycle.test.ts)

T-08 supplies evidence for run correlation, UI-independent execution and controlled failures. D-01 still needs approved numerical tolerances, D-03 owns portable format policy, D-04 owns measured resource limits, and D-07 owns extension boundaries. [T-08 roadmap](../roadmap/implementation-plan.md) · [Architecture decisions](../architecture/architecture-decisions.md) · [NFR-002, NFR-003, NFR-005 and NFR-007](../product/requirements.md)
