# Validation and evidence plan

**Status:** Proposed; no listed result has been measured or accepted.
**Purpose:** Define what evidence blocks implementation and release decisions.
**Scope:** Candidate conventional AM validation slice and proposed public MVP. Additional domains require their own reference plans.

## Gate order

| Gate | Evidence and method | Blocks until reviewed | Related tasks / requirements |
| --- | --- | --- | --- |
| V-01 — AM convention and references | Review the [proposed equation](../architecture/dsp-engine.md#conventional-am-integration), message-amplitude mapping, units, sample index/end policy, sideband amplitudes, FFT scaling, analytical boundary and aliasing cases; derive expected values independently | Any numerical correctness claim, M2 lab result publication, D-01 sign-off | T-05, T-07; FR-003, NFR-001 |
| V-02 — University simulator audit | Compare each existing conventional AM/DSB-SC/SSB/VSB mode's assumptions and outputs against independent references; inspect architecture and license before borrowing behavior/code | Simulator reuse and assignment integration decisions; not necessarily greenfield M1 work | T-04; D-01; NFR-001 |
| V-03 — Reproducible engine | Run same canonical model/version, sampling, and engine version repeatedly in non-UI and browser contexts; record input identity, provenance, diagnostics, and selected comparison method | M3 equivalence claim and public result reliability | T-06–T-08; NFR-002–NFR-003 |
| V-04 — M3 graph feasibility and provisional round trip | From empty, construct/connect/break/repair supported graph; verify typed errors, keyboard path, undo/redo, guided conversion; export/import a **provisional versioned portable file** across a fresh session and self-hosted deployment; compare nodes/edges, parameters, model/version, units, sampling, assumptions, compiled semantics, and rerun outputs using the current proposed D-01 comparison method; record effort/accessibility plan and failure-state proof | T-17 checkpoint and M4 graph integration; formal pass waits for approved D-01 reference criteria. Failure requires Stage 1 review | T-12–T-17; D-02; provisional D-03 evidence; FR-005–FR-009, FR-014; NFR-002, NFR-004, NFR-008 |
| V-05 — Conversion and lifecycle failure | Inventory preserved fields; attempt unsupported mapping; verify clear refusal or explicit fork summary and consent with source unchanged; demonstrate invalid input, engine failure, cancellation, and stale-result recovery before checkpoint | T-17 pass and M4 conversion completion | T-13, T-16, T-20; FR-014; NFR-005 |
| V-06 — Production project exchange | After D-03 review, test approved schema/version policy, user-facing export/import, transactional rejection of malformed/oversized/incompatible files, compatibility and migration where approved; rerun fresh-session and self-hosted round trips | M4 exit, beta, public release. M3's provisional proof cannot substitute for this gate | T-18–T-19; D-03; FR-007–FR-009; NFR-005–NFR-008 |
| V-07 — Resource/failure behavior | Measure representative cases and chosen devices, then approve limits; test invalid values, over-budget graphs/files, cancellation, failed run, previous-result staleness, and recovery | Alpha/beta claims and public release; M3 needs only the behavioral proof in V-05, not final budgets | T-21; D-04; NFR-005 |
| V-08 — Browser/device compatibility | Select D-05 matrix; execute guest, lab, graph, file, and cross-browser numerical cases; record limitations before navigation | Beta support claim and public release; M3 self-hosted round trip is a narrower proof | T-22; NFR-002, NFR-004, NFR-008 |
| V-09 — Accessibility | Approve D-06 standard; manually test keyboard and screen reader flows for graph construction, model inspection, plots, diagnostics, import/export; supplement with automated checks | Beta and public release; M3 requires keyboard proof and credible accessibility plan | T-14, T-23; NFR-004 |
| V-10 — Self-hosting and boundaries | Build/serve without proprietary API; complete run–inspect–edit–exchange; inspect package imports for UI-independent engine and internal-only extension surface | Public release; M3 has a narrower self-hosted file round-trip proof in V-04 | T-24; D-07; NFR-003, NFR-007–NFR-008 |

## D-01 through D-07 disposition

- **D-01:** V-01 and V-03 plus approved per-output tolerances and independent reviewer; status remains Open until documented approval. No tolerance is set here.
- **D-02:** V-04 and V-05 plus the full [Stage 2 checkpoint](../design/workspace-feasibility.md#recommended-feasibility-checkpoint); a failed or evidence-incomplete gate blocks graph-dependent public scope.
- **D-03:** M3's provisional versioned file is evidence that a round trip is feasible, not approval of a format. V-06 plus a reviewed production schema/version and migration policy resolves D-03; proposed examples in Stage 3 are not approved format.
- **D-04:** V-07 with measured budgets and safe rejection; no budget is invented here.
- **D-05:** V-08 with an explicit support matrix; do not infer device support from responsive layouts alone.
- **D-06:** V-09 with an approved standard and findings; design guidance is not compliance evidence.
- **D-07:** V-10 plus dependency review and a paper exercise for a non-graph future domain; no public plugin API is required or approved.

## Numerical evidence detail

For conventional AM, derive samples and ideal carrier/sideband lines from the proposed reference model independently of implementation. Exercise `μ=0`, below/at/above unity, zero carrier if accepted, coherent and noncoherent records, Nyquist boundary and aliasing, invalid numerical input, units, and display scaling. Record model/engine versions, sample rate, count, window, transform convention, reference source, and comparison method. Compare time samples and frequency-domain quantities separately; screenshots are supplementary only. Audit the university simulator rather than treating it as a reference. Cross-browser results are interpreted under D-01's eventual tolerance policy, not bitwise equality assumptions.

## Evidence record and escalation

For each gate, save the test procedure, inputs, expected values, observed values, environment, reviewer role, and disposition with a link to its task/decision. A failure is either fixed and rerun or explicitly escalated to product review. It cannot be waived by saying the feature is “experimental” while retaining a public P0 claim. The [release plan](release-plan.md) collects these records at alpha, beta, and public gates.
