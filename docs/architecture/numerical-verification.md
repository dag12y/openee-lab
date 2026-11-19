# Numerical verification

**Status:** Proposed Stage 3 verification strategy; reference cases and tolerances are not yet approved.
**Purpose:** Establish evidence for trustworthy, reproducible simulation before first release.
**Scope:** First verification target is the candidate conventional AM slice. The method extends to later domains with domain-specific references.

## Reference hierarchy

Use independently derived analytical cases where possible, then trusted independent implementations or published equations with explicit conventions, and finally cross-implementation comparisons. Document model equation, units, amplitude convention, time origin, sample rate, duration, Fourier convention, and expected output for each case. The existing university AM simulator must be audited for numerical and architectural behavior before it is reused; its output is not a reference oracle by default. A reference must be independent of the code under test to avoid mirrored mistakes.

## Conventional AM verification matrix

Use the [proposed reference equation and discrete indexing](dsp-engine.md#conventional-am-integration) as one candidate test model, not an approved universal AM definition. For `A_c > 0`, `0 < f_m < f_c`, and distinct unaliased lines, the expansion is

$$
s(t)=A_c\cos(2\pi f_c t)+\frac{A_c\mu}{2}\cos(2\pi(f_c-f_m)t)
     +\frac{A_c\mu}{2}\cos(2\pi(f_c+f_m)t).
$$

Thus the ideal **one-sided peak cosine amplitudes** are `A_c` at `f_c` and `A_c μ/2` at each sideband; in a two-sided complex transform, coefficients at each positive/negative line are half those values. These are analytical expectations for this convention, not validated output tolerances. A finite `N`-sample spectrum uses `t_n=n/f_s`, `n=0,…,N−1`, `T=N/f_s` with the endpoint excluded. Select coherent-bin cases to check line amplitudes under a declared rectangular-window FFT normalization, then noncoherent cases to check leakage and labeling. Require `f_s > 2(f_c+f_m)` for an unaliased baseline; test equality and lower rates as rejected or explicitly aliased cases according to the eventual policy.

| Case class | Expected evidence | Failure modes exposed |
| --- | --- | --- |
| `μ = 0` | Carrier-only `A_c cos(2πf_c t)`; sidebands vanish | Incorrect offset or amplitude handling |
| `A_c = 0`, if permitted | Zero signal under this multiplicative convention, or explicit rejection | Division by zero, hidden normalization, confusion with additive conventions |
| Message/carrier frequency relationship | Time waveform and sideband locations from analytical derivation | Wrong frequency units or angular-frequency conversion |
| `0 < μ < 1`, `μ = 1`, and `μ > 1` | Envelope stays positive, touches zero, or crosses zero respectively; warning/rejection policy remains open | Incorrect envelope interpretation and overmodulation feedback |
| Sampling near and beyond representable bandwidth | Expected aliasing or explicit validation/warning under selected sampling policy | False spectrum claims and mislabeled plots |
| Boundary/invalid inputs | Finiteness, positivity, duration, and resource guard behavior | NaN propagation, silent clipping, hangs |

Do not assume every listed case is accepted input: parameter-domain decisions must precede expected-output finalization. Time-domain checks cover sample values at analytically chosen indices, envelope behavior where applicable, phase/time-origin convention, and units. Frequency-domain checks cover bin placement, scaling, sideband symmetry, DC/Nyquist handling, leakage under chosen windows, and plots' distinction between amplitude and power. FFT results cannot be validated by visual resemblance alone.

Independent verification should derive sample values directly from the displayed equation, derive line locations/amplitudes via the product-to-sum identity, and compare with a separate high-precision or independently implemented transform under the same declared normalization. Include cases where `f_m = 0` or `f_c = f_m` only with separately derived expectations because spectral lines merge. Compare guided and graph paths only for matching canonical model fields and compiled-plan semantics; a deliberately rewired user graph is a different model, not a failed equivalence test. The separate university simulator may be compared after audit but cannot define expected truth. D-01 still owns approved tolerances and reference sign-off.

## Reproducibility and cross-browser checks

Record exact project model/version, engine implementation version, settings, sampling configuration, reference ID, and comparison method. Repeated runs from identical inputs should produce equivalent results under D-01 criteria. Compare a non-UI engine invocation with lab and graph routes; model and graph conversion should preserve supported semantics (FR-006, FR-014). Validate on the D-05 browser/device matrix once approved; distinguish expected floating-point variation from model defects. No cross-browser bitwise identity or tolerance value is claimed here.

## Performance and resource methodology

Build representative small, boundary, and rejected cases. Measure validation time, run time, memory, worker startup/transfer overhead, cancellation latency, and user-visible responsiveness on devices in the approved support matrix. Use repeated measurements with recorded environment and model sizes; report distributions rather than a single best run. Set D-04 budgets from evidence and product needs, then test safe rejection and recovery. Performance measurements do not replace numerical checks.

## Release gate and ownership

A release candidate must have reviewed references, declared tolerances, passing normal and boundary cases, an audit disposition for borrowed simulator behavior, documented browser results, and failure cases that block release. A graph-dependent release also needs evidence that guided and graph paths match within approved criteria. Who approves references and tolerances remains D-01. If evidence is missing, mark the result unverified rather than claiming correctness.

## Alternatives, open questions, and traceability

**Alternative:** use only snapshots generated by the same engine. This catches regressions but cannot establish correctness; snapshots may supplement independent references. Open: approval of the proposed AM equation and message-amplitude mapping, parameter acceptance policy, FFT conventions, tolerance policy, reference ownership, browser matrix, and resource budgets. Related [DSP runtime](dsp-engine.md), [simulation engines](simulation-engines.md), [decisions](architecture-decisions.md), [Stage 1 requirements](../product/requirements.md): FR-003, FR-006, FR-009, FR-014, NFR-001–NFR-005.
