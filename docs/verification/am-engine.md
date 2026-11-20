# T-07 conventional AM batch engine

**Status** — Implemented with Node reference checks. D-01 through D-07 remain Open.

The built-in engine `built-in-am@1` accepts `communications/conventional-am@1`. The canonical input has six scalar fields: `carrierAmplitude` (peak volts), `modulationIndex` (dimensionless), `messageFrequencyHz`, `carrierFrequencyHz`, `sampleRateHz`, and `sampleCount`. For the Chapter 2 single-tone message with fixed amplitude sensitivity, μ = kₐ × Aₘ, where kₐ is in inverse message units. Only μ is stored. This convention describes one conventional AM model. [T-05 reference](am-reference.md) · [Engine source](../../packages/engine-communications/src/index.ts)

## Execution and outputs

The engine evaluates the multiplicative AM equation in Float64 with zero phase and time origin. Sample times are n/fₛ for 0 ≤ n < N. The record duration is N/fₛ with its endpoint excluded. Frequencies are reduced modulo fₛ when evaluating sampled cosines to keep angles bounded. A run requests waveform, spectrum, or both. Output buffers are Float64 arrays in volts. Result metadata supplies fₛ, N, start time and exact run provenance.

The spectrum is a direct rectangular-window DFT of the sampled waveform. The forward sign is negative and normalization is 1/N. Outputs are one-sided peak amplitudes at k × fₛ/N for k = 0 through floor(N/2). Interior bins are doubled, with DC and even-N Nyquist left unscaled. Noncoherent records can leak across bins. Aliased and coincident components combine in the sampled waveform before the transform. The result describes a finite record. PSD, demodulation, and streaming are outside this increment.

## Validation and lifecycle

The model requires finite scalars, nonnegative amplitude and modulation index, fₛ > 0, 0 ≤ fₘ ≤ f꜀, a positive carrier, and a positive safe integer sample count. Duration, bin width and the waveform peak bound must be representable. Distinct clean lines require 0 < fₘ < f꜀ and fₛ > 2(f꜀ + fₘ) for a nonzero modulated signal. This provisional engine permits overmodulation, frequency collisions, Nyquist equality and aliasing, and reports diagnostic warnings where applicable. Zero carrier amplitude yields zero output. Only occupied lines are considered for sampling warnings.

The provisional limit of 2,048 samples applies to all runs before snapshot creation and allocation. It caps the direct transform at roughly 2.1 million sample/bin terms. The largest simultaneous waveform and spectrum buffers total about 24 KiB. This is an implementation guard and D-04 still needs device measurements and approved budgets. Invalid values, capability mismatches, resource limits and spectral interpretation warnings have separate codes.

The engine uses T-06 snapshots and accepts only snapshots created by its own validator in the current process. Run entry rechecks capabilities and parameter guards, then derives provenance from the same immutable snapshot. The internal fingerprint provides value identity. Cancellation is checked before work, every 64 waveform samples, at each spectral bin, and before publishing. Failure and acknowledged cancellation return no outputs. Execution is synchronous within the run call, so same-thread events cannot interrupt it. T-08 owns worker handoff and revalidation, scheduling, stale-result arbitration and cancellation delivery. [T-06 contracts](simulation-contracts.md) · [T-07 and T-08](../roadmap/implementation-plan.md)

## Evidence and tooling

The 17 engine tests compare each waveform against the independent T-05 product-to-sum reference and its explicit samples. They compare each spectral bin with T-05 expectations and check leakage against a separately derived three-sample result. The comparison slack is 128 machine epsilons scaled by expected magnitude for these tiny records. D-01 still needs reviewer approval, production tolerance criteria and browser evidence. Runtime tests also exercise rejection, limits, provenance, cancellation and failure. D-07 gains evidence of a UI-independent built-in using the internal contracts, with acceptance still pending. [Decisions](../architecture/architecture-decisions.md) · [Engine tests](../../packages/engine-communications/src/am.test.ts)

Run `npm ci --ignore-scripts` and `npm test` in `packages/engine-communications`. The package uses the existing TypeScript 5.9.3 and Node declaration pins with Node's built-in test runner. The compiler resolves the local contracts source and compiles the T-05 fixtures for tests only. The engine has no external runtime dependencies. [Lockfile](../../packages/engine-communications/package-lock.json)
