# T-05 conventional AM analytical reference

**Status:** Proposed, executable reference evidence; D-01 is Open. No production engine or browser has been verified.
**Purpose:** Give an independently derived numerical baseline for [T-05](../roadmap/implementation-plan.md) and [V-01](../roadmap/validation-plan.md) before implementing a signal engine.
**Scope:** One single-tone conventional AM convention for the architecture-validation slice. It does not define the university assignment, all AM conventions, or the proposed public release.

## Candidate model and Chapter 2 mapping

The candidate model is

$$
s(t)=A_c[1+\mu\cos(2\pi f_m t)]\cos(2\pi f_c t).
$$

`A_c` is the nonnegative carrier **peak amplitude** in the output signal unit; `f_m` and `f_c` are frequencies in hertz; `\mu` is dimensionless. Phase and time origin are zero in these fixtures. The Chapter 2 lecture's conventional AM form is `A_c[1+k_a m(t)]cos(2πf_c t)`. For a zero-mean, single-tone message `m(t)=A_m cos(2πf_m t)`, with `A_m` in its declared message unit and sensitivity `k_a` in inverse message units, **`\mu=k_a A_m`**. This mapping assumes the same carrier scaling, no extra DC message offset, and a documented fixed `k_a`. If a UI exposes both `A_m` and `\mu`, it must avoid contradictory independent settings. Under an additive carrier-amplitude convention `[A_c+k A_m cos(2πf_m t)]cos(2πf_c t)`, equivalence instead requires `A_c>0` and `\mu=k A_m/A_c`; the two `k` definitions must not be conflated.

The local 58-page Chapter 2 PDF was inspected for its conventional-AM and single-tone sections. It supports the broad `k_a m(t)` and `\mu=k_a A_m` relationship, but it is not an implementation oracle. The separate university simulator remains unaudited and no code was copied from it. The [M0 scope record](../roadmap/m0-scope-record.md) keeps the two-chapter assignment separate.

## Sampling and amplitude convention

For this finite record, `f_s>0` hertz and `N` is a positive integer. Sample `n` occurs at `t_n=n/f_s`, for `n=0,…,N−1`; duration is `T=N/f_s` and `t=T` is excluded. A coherent fixture has integer `N f_c/f_s` and `N f_m/f_s`. Coherence removes rectangular-window leakage for the fixture frequencies; it does not establish general FFT accuracy.

Product-to-sum yields the **independent reference expression**

$$
s[n]=A_c\cos(2\pi f_c n/f_s)
 +\frac{A_c\mu}{2}\cos(2\pi(f_c-f_m)n/f_s)
 +\frac{A_c\mu}{2}\cos(2\pi(f_c+f_m)n/f_s).
$$

For `0<f_m<f_c` with distinct, unaliased lines, the positive-frequency carrier is at `f_c` with **one-sided peak cosine amplitude** `A_c`; the sidebands at `f_c−f_m` and `f_c+f_m` each have `A_c\mu/2`. The corresponding ideal two-sided positive and negative complex coefficient magnitudes are `A_c/2` and `A_c\mu/4`. The strict baseline condition is `f_s>2(f_c+f_m)`; equality places the upper line at Nyquist, and lower rates can alias it. Frequency separation and no collision are additional conditions for the simple three-line claim.

The executable check uses a rectangular record and direct normalized DFT
`X[k]=(1/N) Σ_n s[n] exp(−i2πkn/N)`. Its two-sided plot quantity is `|X[k]|`. Its one-sided **peak amplitude** is `2|X[k]|` for interior positive bins and `|X[k]|` at DC or Nyquist. At DC/Nyquist the positive and negative bins coincide, so they cannot be doubled. These are amplitude conventions, not power or PSD conventions. When lines coincide or alias, complex coefficients add before magnitudes are taken. For noncoherent records, window/leakage behavior needs separate reference work.

## Proposed domains and boundary expectations

The reference fixture domain proposes finite `A_c≥0`, finite `\mu≥0`, `f_c>0`, `f_m≥0`, `f_s>0`, and positive safe-integer `N`. The clean baseline is narrower: `A_c>0`, `0≤\mu≤1`, `0<f_m<f_c`, distinct lines, and strict Nyquist separation. These domains classify **reference fixtures**, not approved production input policy. Negative or nonfinite numeric values, zero sample rate, and fractional sample counts are invalid fixture configurations. Resource limits and final engine rejection behavior remain D-01/D-04 questions.

At `\mu=0`, only the carrier remains. For `0<\mu<1`, the signed modulation factor stays positive; at `\mu=1`, it can reach zero; for `\mu>1`, it crosses zero and simple envelope detection distorts. Overmodulation is a reference case, not a silently accepted production input. At `A_c=0`, this multiplicative model gives zero even when `\mu>0`; an additive convention can behave differently. At `f_m=0`, all nominal lines merge into a carrier of amplitude `A_c(1+\mu)`. At `f_c=f_m`, the lower term is DC. Neither case supports a three-distinct-line interpretation.

## Fixture inventory and evidence

The self-contained [fixture package](../../verification/am-reference/package.json) holds explicit selected sample values and expected normalized spectral lines. The reference sample builder uses the product-to-sum expression, and the test transform is a simple direct DFT rather than a production FFT.

| Fixture | Primary expectation |
| --- | --- |
| Unmodulated carrier | `A_c=2, \mu=0`: only the 2 Hz carrier remains. |
| Under-modulation and distinct sidebands | `A_c=2, \mu=0.5, f_m=1, f_c=2, f_s=N=8`: 1/2/3 Hz one-sided peak amplitudes `0.5/2/0.5`; two-sided magnitudes `0.25/1/0.25`. Selected full-period samples are `[3,0,-2,0,1,0,-2,0]`. |
| Critical modulation | `\mu=1`: the signed factor reaches zero at `n=4`; sidebands have peak amplitude 1. |
| Overmodulation | `\mu=1.5`: factor crosses zero; sidebands have peak amplitude 1.5. Reference only. |
| Zero carrier amplitude | Every sample and spectral line is zero under this convention. |
| Upper sideband at Nyquist | `f_s=N=6`: 3 Hz is the Nyquist bin; its normalized DFT magnitude and one-sided amplitude are both 0.5. |
| Aliased line collision | `f_s=N=5`: 3 Hz aliases to 2 Hz and adds to the carrier, giving 2.5 one-sided peak at 2 Hz. |
| Zero message frequency | Both sidebands merge with the carrier, giving 3 one-sided peak at 2 Hz. |
| Equal carrier/message frequency | Lower term becomes DC amplitude 0.5; the carrier and upper line stay at 1 and 2 Hz. |
| Invalid numeric inputs | Nonfinite values, negative proposed-domain values, zero sample rate, and fractional count are identified before reference evaluation. |

The test harness uses a floating-point **arithmetic sanity threshold** proportional to machine epsilon to compare its explicit values and direct DFT. That threshold is local to these tiny coherent fixtures. It is **not** an approved engine tolerance, a cross-browser claim, or D-01 acceptance evidence. Expected fixture values are not generated by the future production implementation.

## Tooling, run, and dependency review

From `verification/am-reference/`, run `npm ci --ignore-scripts` and `npm test`. The exact lockfile records TypeScript 5.9.3 (Apache-2.0) and `@types/node` 24.19.2 (MIT), plus its transitive `undici-types` type package (MIT). TypeScript compiles the tests; Node's built-in `node:test` runs them. No application runtime dependency, FFT library, graph library, or simulator package is selected. These development dependencies are confined to the reference package. The pinned versions and lockfile support repeatable installs; use `npm audit` and normal security review on updates. This run was checked with Node 26.12.0 and npm 11.20.0; browser support remains D-05.

## Traceability and remaining evidence

| Link | Evidence now | Still open |
| --- | --- | --- |
| [T-05](../roadmap/implementation-plan.md), [V-01](../roadmap/validation-plan.md) | Candidate model, mapping, coherent samples, distinct/merged/aliased spectral lines, and executable analytical fixtures. | Independent reviewer sign-off; noncoherent/window cases; approved model and comparison conventions. |
| [D-01](../architecture/architecture-decisions.md#d-01--numerical-references-and-tolerances), [NFR-001](../product/requirements.md), [NFR-002](../product/requirements.md) | Repeatable, UI-independent reference calculations and edge-case catalog. | Approved per-output tolerances, production engine comparison, cross-browser reproducibility, simulator audit. D-01 remains Open. |
| [FR-002](../product/requirements.md), [FR-003](../product/requirements.md) | Proposed message-amplitude mapping, parameter domains, units, and spectral scaling that future controls/results can expose. | Guided UI, model metadata display, validation feedback, plots, and actual simulation runs. |

No production generator, graph, project workflow, or public-release capability is established by these tests. See [numerical verification](../architecture/numerical-verification.md) and [DSP architecture](../architecture/dsp-engine.md#conventional-am-integration) for the broader proposed plan.
