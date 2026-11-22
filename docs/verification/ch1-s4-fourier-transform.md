# Chapter 1 / S4: Fourier Transform &amp; Frequency Domain

**Status** — CH1-S4 numerical implementation complete; all 14 engine tests pass. UI integration is deferred to a subsequent PR. D-01 through D-07 remain Open.
**Issue** — [#13](https://github.com/dag12y/openee-lab/issues/13) · **Branch** — `s4-fourier-transform` · **Lead** — Salamy (@salamy40)

## Mathematical conventions

| Quantity | Convention |
| --- | --- |
| Signal model | x(t) = Σ Aᵢ · cos(2π fᵢ t), evaluated at t = n/fₛ for 0 ≤ n &lt; N |
| Forward DFT | X[k] = (1/N) Σₙ x[n] exp(−j 2π kn / N) |
| Bin spacing | Δf = fₛ / N |
| One-sided bins | k = 0 … floor(N/2). Interior amplitudes doubled; DC (k=0) and Nyquist (k=N/2, even N) are undoubled |
| Two-sided bins | k = 0 … N−1. Signed frequency for k ≥ ⌈N/2⌉ is k − N. Amplitude = raw coefficient magnitude (no doubling) |
| Phase | Zero initial phase for all components (cosine locked to sample index 0) |
| Units | amplitudeV → V; frequencyHz → Hz; sampleRateHz → Hz; time → s |
| Aliasing | A tone at f aliases to |f mod fₛ| and to fₛ − (f mod fₛ), whichever falls ≤ fₛ/2 |
| Leakage | A tone is coherent when fᵢ / Δf is an integer; non-integers spread energy across adjacent bins |
| Parseval | (1/N) Σ|x[n]|² = Σ(Re{X[k]}² + Im{X[k]}²) holds for the two-sided DFT convention used here |

The DFT computation is fully delegated to `packages/numerics` `directDft`. This module does not duplicate the transform.

## Engine identity

| Field | Value |
| --- | --- |
| Engine ID | `built-in-ft` |
| Engine version | `1` |
| Model domain | `chapter-1` |
| Model kind | `fourier-transform` |
| Model version | `1` |

## Parameter domain

| Parameter | Type | Constraint |
| --- | --- | --- |
| `components` | `ToneComponent[]` | 1 … 8 entries |
| `components[i].amplitudeV` | `number` | finite, ≥ 0 |
| `components[i].frequencyHz` | `number` | finite, ≥ 0 |
| `sampleRateHz` | `number` | finite, > 0 |
| `sampleCount` | `integer` | 1 … 2048 (safe integer) |
| `sidedness` | `"one-sided" \| "two-sided"` | literal |

The sample count limit of 2,048 matches `maxDftSamples` in `packages/numerics`.

## Diagnostic codes

| Code | Severity | Condition |
| --- | --- | --- |
| `ft.aliasing` | warning | Component frequency exceeds Nyquist |
| `ft.nyquist-boundary` | warning | Component is at exactly Nyquist |
| `ft.spectral-leakage` | warning | Component is non-coherent (not integer multiple of Δf) |
| `ft.invalid-sampling` | error | Bad sample rate, count, or duration |
| `ft.resource-limit` | error | Sample count exceeds 2,048 |
| `ft.invalid-components` | error | Fewer than 1 or more than 8 components |
| `ft.invalid-component` | error | Individual component has bad amplitude or frequency |
| `ft.invalid-sidedness` | error | Sidedness is not `"one-sided"` or `"two-sided"` |
| `ft.unsupported-model` | error | Model identity or version does not match |
| `ft.invalid-snapshot` | error | Run called with an unvalidated snapshot |
| `ft.unsupported-output` | error | Requested output kind is not `"waveform"` or `"spectrum"` |
| `ft.cancelled` | info | Run cancelled before or during execution |
| `ft.execution-failed` | error | Unexpected runtime error |

## Implementation files

| File | Purpose |
| --- | --- |
| `packages/engine-communications/src/ch1/s4/model.ts` | Type definitions, constants (`maxComponents`, `maxFtSamples`), and unit documentation |
| `packages/engine-communications/src/ch1/s4/engine.ts` | T-06 `DomainEngine` implementation: validation, signal synthesis, DFT dispatch, diagnostics |
| `packages/engine-communications/src/ch1/s4/engine.test.ts` | 14 independent analytical tests |
| `packages/engine-communications/src/ch1/s4/index.ts` | Public exports for the S4 package |
| `packages/engine-communications/package.json` | Added `test:s4` and `test:all` scripts |
| `docs/verification/ch1-s4-fourier-transform.md` | This document |

## Tests and results

Run from `packages/engine-communications`:

```
npm run test:s4   # S4 tests only
npm run test:all  # S4 + existing AM tests (42 total)
```

| # | Test | Expected outcome |
| --- | --- | --- |
| 1 | Coherent 1 Hz cosine (N=8, fₛ=8 Hz) | amplitude[1] = 1 V; DC and other bins = 0 |
| 2 | DC component (3 V, f=0) | amplitude[0] = 3 V; all other bins = 0; real[0] = 3 |
| 3 | Nyquist tone (f=4 Hz, fₛ=8, N=4) | amplitude[2] = 2 V; `ft.nyquist-boundary` warning emitted |
| 4 | Aliasing (6 Hz at fₛ=8 Hz) | Same spectrum as 2 Hz; `ft.aliasing` warning emitted |
| 5 | Noncoherent 1.5 Hz (N=8, fₛ=8) | `ft.spectral-leakage` warning; Parseval holds to 64ε |
| 6 | Superposition (1 Hz + 2 Hz) | amplitude[1]=1 V, amplitude[2]=0.5 V, DC=0 |
| 7 | Two-sided spectrum | amplitude[1]=amplitude[7]=0.5 V; freqs: +1 Hz, −1 Hz |
| 8 | Waveform output | x[n] = cos(2π n/8) exact to 64ε; spectrum absent |
| 9 | Spectrum-only | Waveform absent; spectrum present; amplitude[2]=1 V |
| 10 | Invalid inputs (9 cases) | All rejected with appropriate diagnostic codes |
| 11 | Cancellation | Pre-cancelled run → `status: "cancelled"` |
| 12 | Zero-amplitude component | Spectrum is all zeros |
| 13 | Bin width metadata | binWidthHz = fₛ / N = 2 Hz |
| 14 | DC + coherent tone | amplitude[0]=2 V, amplitude[1]=1 V, amplitude[2]=0 |

**Actual results:** 14/14 pass; 42/42 pass (including pre-existing AM tests). Tolerance: 64 × Number.EPSILON × max(1, |expected|).

## Limitations and integration dependencies

- **UI:** No browser UI is included. A topic-specific frontend workspace panel is tracked separately.
- **FFT:** This engine uses the O(N²) `directDft` reference in `packages/numerics`. An FFT upgrade is an S4/S7 coordination item.
- **Worker adapter:** The T-08 worker lifecycle currently binds only the AM model. Wiring S4 into the browser worker requires a reviewed domain-adapter change (not in this PR).
- **Phase:** Only zero initial phase (cosine locked to n=0) is supported. Arbitrary phase input is out of scope.
- **Windows:** Rectangular window only; windowing functions belong to S7.
- **D-01–D-07:** All open architecture decisions remain provisional.
