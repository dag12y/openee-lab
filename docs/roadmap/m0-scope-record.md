# M0 scope and assignment evidence

**Status:** T-01 scope record updated with instructor direction and direct lecture-PDF review; detailed rubric and integration decisions remain open.
**Purpose:** Keep the university assignment, architecture proof, public release, and long-term platform distinct.
**Scope:** Planning evidence only. This does not revise [Stage 1 scope](../product/scope.md) or approve public-MVP changes.

## Source and interpretation

The instructor requires simulations covering **Chapter 1 — Foundations of Communication Systems** (122 pages) and **Chapter 2 — Amplitude Modulation and Demodulation** (58 pages). Local copies of both lecture PDFs were inspected for topics and page counts. The Chapter 2 PDF's internal title is “Chapter 2 - Amplitude Modulation”; the name above follows the confirmed assignment description. Neither lecture supplies a complete separate implementation rubric. A topic's presence does not establish a required individual interactive feature or numerical method.

The following matrices are **proposed coverage for instructor review**, not an approved deliverable list. Explanatory material can accompany simulations; it does not replace the instruction to simulate content from both chapters.

### Chapter 1 — Foundations of Communication Systems

| Lecture topic | Proposed interactive simulation candidate | Explanatory material | Confirmation needed |
| --- | --- | --- | --- |
| Source, transmitter, channel, receiver | Trace a generated signal through a small configurable communication chain and inspect each stage. | Roles of blocks, channel/media examples, and application context. | Required chain depth and channel impairment. |
| Signal generation; time/frequency views; sinusoids and harmonics | Adjust amplitudes, frequencies, and phases; compare a sinusoidal sum in time and frequency views. | Meaning of amplitude, phase, harmonic, and representation. | Required signal families and controls. |
| Fourier series, coefficients, reconstruction, truncation | Vary retained harmonics and inspect coefficients, reconstructed waveform, and truncation effects. | Derivation, orthogonality, and phasor interpretation. | Required example waveforms and coefficient calculations. |
| Fourier transform, spectra, bandwidth | Compare a signal and spectrum; vary a parameter and inspect bandwidth interpretation. | Transform definitions and distinct bandwidth measures. | Transform and bandwidth conventions. |
| LTI systems and frequency response | Apply a bounded example filter or LTI response; inspect input/output time and frequency views. | LTI properties and transfer-function interpretation. | Filter design versus response exploration. |
| Correlation, power, Parseval's theorem | Shift signals to inspect correlation; compare time-domain and spectral energy or power for a defined finite example. | Inner-product reasoning and theorem statement. | Correlation and normalization conventions. |
| Random variables and random processes | Generate seeded sample realizations and inspect distributions or sample statistics. | Probability vocabulary and deterministic/random distinctions. | Required distributions, processes, and numerical depth. |
| Autocorrelation, stationarity, ergodicity, PSD, white/colored noise | Compare bounded seeded noise realizations, autocorrelation, and PSD estimates where mathematically valid. | Definitions, assumptions, and limits of finite-sample estimates. | Required process models and estimators; whether stationarity/ergodicity need demonstrations. |
| Historical developments and descriptive examples | None proposed solely for historical facts. | Timeline, technologies, media, and applications. | Whether historical content is assessed. |

### Chapter 2 — Amplitude Modulation and Demodulation

| Lecture topic | Proposed interactive simulation candidate | Explanatory material | Confirmation needed |
| --- | --- | --- | --- |
| Conventional AM | Vary carrier, message, and modulation index; inspect waveform, envelope, carrier/sidebands, bandwidth, power, and envelope detection. | Parameter conventions, under/critical/overmodulation, and detector limits. | Required input signals, detector model, and power convention. |
| DSB-SC | Generate suppressed-carrier modulation; compare spectra and coherent recovery as phase error varies. | Balanced/product modulator and synchronization concepts. | Required modulator and detector fidelity. |
| SSB | Switch USB/LSB and inspect spectra and coherent recovery; compare a documented generation approach if feasible. | Hilbert/phase-discrimination and filtering methods; practical filter limits. | Whether both generation methods must be implemented or only explained. |
| VSB | Adjust a defined shaping filter or vestige setting; inspect spectrum and recovery behavior. | Partial suppression, bandwidth tradeoff, and reception. | Required filter shape, reception model, and reference cases. |
| AM-family comparison | Compare spectra, bandwidth, and power/efficiency under stated common assumptions. | Implementation complexity, applications, and tradeoffs. | Graded quantities and conventions. |

## Four distinct work streams

| Work stream | Current evidence and boundary | Next decision |
| --- | --- | --- |
| Independent university assignment | The instructor requires simulations covering both chapters. The separate reported AM simulator covers conventional AM, DSB-SC, SSB, and VSB, but its numerical behavior, architecture, rights, and fitness for this assignment remain unaudited. Chapter 1 coverage is not established by that simulator. | Confirm minimum interactive coverage and audit the simulator before integration or reuse. DSB-SC, SSB, and VSB remain possible assignment integrations, not automatic public-MVP obligations. |
| Conventional AM architecture-validation slice | [M1–M3](milestones.md) use a narrow conventional AM case to test canonical model ownership, independent numerical references, guided/graph equivalence, genuine graph construction, and portable round trips. | Internal platform proof, not the two-chapter assignment or a public release. D-01 and D-02 remain evidence-gated. |
| Proposed first public OpenEE Lab release | [Stage 1](../product/scope.md#proposed-first-public-release-mvp) proposes an account-free verified communication experiment, limited genuine workspace graph, model inspection, and portable local project exchange. | This assignment update does not expand the public MVP. A failed D-02 returns FR-005, FR-006, and FR-014 to product review. |
| Future OpenEE Lab ecosystem | Five pillars: Engineering Workspace, Built-in Simulations, Plugin Ecosystem, Community, and Learning. Future domains may need different editors and engines. | Plugin execution, external engines, hosted community features, and additional domains need separate decisions. |

## Unresolved assignment inputs

The two-chapter instruction establishes breadth, but not the number of experiments, minimum interaction per topic, accuracy criteria, accepted approximations, grading weights, or whether explanatory coverage suffices for selected theoretical topics. The instructor should confirm which Chapter 1 topics need numerical interaction; which Chapter 2 variants, generation methods, and detectors must run; expected comparisons, deliverable format, demo environment, deadline, permitted libraries, and source/reuse rules. Lecture examples are teaching sources, not automatically numerical oracles. No lecture PDF is copied into this repository.

## M0 disposition and traceability

**T-01: Open pending detailed rubric and reviewer confirmation.** The instructor's direction and proposed coverage are recorded; assignment implementation and integration scope remain unapproved. Continue the [university simulator audit gate](validation-plan.md) before reuse. Public-path requirement identifiers remain FR-001–FR-009, FR-014, and NFR-001–NFR-008 as defined in [Stage 1 requirements](../product/requirements.md); future FR-010–FR-013 remain outside the first release. Related [roadmap tasks](implementation-plan.md) and [architecture decisions](../architecture/architecture-decisions.md).
