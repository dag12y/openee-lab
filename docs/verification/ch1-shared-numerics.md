# Chapter 1 shared numerics and team integration

**Status** — CH1-F00 implementation for review. D-01 through D-07 remain Open. This work supports the Chapter 1 assignment track. [Issue #17](https://github.com/dag12y/openee-lab/issues/17) · [Assignment scope](../roadmap/m0-scope-record.md)

## Numerical API

| API | Convention |
| --- | --- |
| `SamplingGrid`, `recordDuration`, `sampleTime` | Finite uniform grid with positive sample rate in Hz, positive integer count N and finite origin in seconds. Use t₀ = 0 unless the experiment specifies otherwise. Sample n is at t₀ + n/fₛ for 0 ≤ n < N. Record duration is N/fₛ and its endpoint is excluded. |
| `RealSignal`, `validateSignal` | Borrowed finite real Float64Array backed by a local ArrayBuffer, with exact length N and an explicit unit such as V or 1. Callers own the buffers and must keep them stable during synchronous operations. Choose and document units and dimensions at the domain boundary. Buffers are runtime data. Snapshot inputs use bounded plain data under T-06. |
| `binFrequencyHz` | Bin spacing is fₛ/N. One-sided bins run from 0 through floor(N/2). Two-sided bins use DFT array order, with signed indices k for k < ceil(N/2) and k−N otherwise. For even N the single Nyquist bin appears at +fₛ/2 one-sided and −fₛ/2 two-sided. |
| `directDft` | Rectangular record, forward sign −, normalization 1/N, phase relative to sample index zero. Returns real and imaginary coefficients and amplitude in the signal unit. Both views retain the same complex coefficients for each represented bin. Two-sided amplitude is coefficient magnitude. One-sided amplitude doubles interior magnitudes only. DC and even-N Nyquist are undoubled. |

Strictly below Nyquist is the clean baseline for reconstructing a band-limited signal. Energy above Nyquist can fold into lower bins, and the sampled data alone cannot reveal the original component. A noncoherent tone leaks across finite-record bins. A one-sided amplitude spectrum is neither power nor PSD. A power/PSD result must name its own normalization, estimator and units, such as V²/Hz for PSD.

The provisional guard permits 65,536 samples for the grid and signal helpers and 2,048 for direct DFT. The DFT checks the count before scanning samples or allocating output arrays and evaluates at most 4,194,304 sample/bin pairs. Numerical operations use Float64 with ordinary rounding, including when a large time origin obscures small intervals. Extreme amplitude ranges can underflow, and unrepresentable output magnitudes are rejected. This is a small O(N²) reference transform. Convolution, FFT selection, Fourier-series content, distributions, autocorrelation, PSD estimation and filtering belong to topic reviews. Chapter 2 continues to use its own verified AM path, whose one-sided convention matches this foundation. [Source](../../packages/numerics/src/index.ts) · [AM verification](am-engine.md)

## Team ownership and workflow

| Work item | Lead | Topic boundary |
| --- | --- | --- |
| [S1 / #10](https://github.com/dag12y/openee-lab/issues/10) | Kaleab | Signal fundamentals and Euler identity |
| [S2 / #11](https://github.com/dag12y/openee-lab/issues/11) | Abeni | LTI, convolution and response |
| [S3 / #12](https://github.com/dag12y/openee-lab/issues/12) | Mosses | Fourier-series coefficients and truncation |
| [S4 / #13](https://github.com/dag12y/openee-lab/issues/13) | Salamy | Fourier transform, bin and spectrum interpretation |
| [S5 / #14](https://github.com/dag12y/openee-lab/issues/14) | Gudeta | Probability distributions and sampling |
| [S6 / #15](https://github.com/dag12y/openee-lab/issues/15) | Tekalign | Seeded processes and time-domain statistics |
| [S7 / #16](https://github.com/dag12y/openee-lab/issues/16) | Yohannes and Dagm | PSD, noise and systems |

Start the lecture mapping, proposed controls, expected plots and independent fixtures now. Use the issue's suggested branch from current `main`, then open a draft PR referencing the topic issue. Keep the inventory review and implementation review focused. Prefer an isolated directory such as `packages/engine-communications/src/ch1/s4/` with model and validation, computation and tests. Coordinate shared edits in a dedicated PR with the consumers and reviewers before merging through the protected branch workflow.

S3 owns analytical series coefficients and reconstruction. S4 coordinates shared DFT conventions and any future FFT proposal. S7 uses compatible spectral primitives and owns PSD, noise and window/estimator policy. Review any transform API change together. S5–S7 should agree on a seed type, algorithm and version, stream derivation and deterministic vectors before sharing generator code. Record the effective seed and algorithm version in the validated model or assumptions, keep generator state run-local, and use fixed seeds plus analytical expectations and justified statistical bounds. Avoid global or unseeded RNG in reproducibility tests.

## Integrating and testing a topic

Give each model and engine a versioned identity, define parameter domains and units, and report structured diagnostics with stable codes and relevant field locations. Validate domain rules and resource budgets before creating bounded plain-data snapshots. Publish derived outputs with units and `provenanceFor(request)`. For guided display, include axis quantities and units, assumptions, and a text summary of what the result shows. The compile-time metadata example demonstrates a local T-06 engine binding. Production engines must also check request capabilities at execution entry and map unexpected failures to a structured outcome. [Example](../../packages/numerics/src/integration-example.ts) · [T-06 contracts](simulation-contracts.md)

T-08's controller and worker codec currently bind to the AM model. A Chapter 1 integration PR should add a reviewed built-in domain adapter to that lifecycle, supplying validation, bounded model encoding/decoding, worker-side revalidation, fingerprint comparison and outcome typing. Preserve current-result arbitration, correlation, and cancellation semantics. Local tests can call the T-06 engine directly until that seam is wired. [T-08 lifecycle](run-lifecycle.md)

Run `npm ci --ignore-scripts` and `npm test` in `packages/numerics` and the owning package. Use independent hand calculations or trusted references with explicit conventions. Include boundaries, coherent and noncoherent cases where relevant, and absolute error near zero. The foundation checks short analytical records with 64 machine epsilons scaled by expected magnitude for ordinary Float64 rounding. D-01 review of production tolerances, D-03 portable serialization, D-04 measured budgets and D-07 long-term boundaries remain open. [Foundation tests](../../packages/numerics/src/numerics.test.ts) · [Decision register](../architecture/architecture-decisions.md)
