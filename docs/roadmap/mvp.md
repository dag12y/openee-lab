# Proposed first public MVP

**Status:** Proposed planning boundary; not an approved delivery commitment.
**Purpose:** State the public product slice and preserve its gates and exclusions.
**Scope:** First public OpenEE Lab release after validation. It is distinct from the existing university assignment and internal conventional AM architecture-validation slice.

## Product outcome

A guest can discover a verified built-in communication simulation, adjust parameters, inspect equations and model metadata, run it, open a compatible model in a limited engineering workspace, genuinely construct or change a supported communication graph, rerun, and exchange a portable project file. Conventional AM is the candidate first example, not the platform identity. The workspace and model/engine boundaries must permit future specialized editors without requiring a universal graph.

| Capability | Stage 1 trace | Release condition |
| --- | --- | --- |
| Guest-first catalog and guided experiment | FR-001–FR-004; NFR-004, NFR-008 | Working destination, validated inputs, labeled time/spectrum results, equation and reset; no account or proprietary service |
| Inspectable model identity, units, sampling, assumptions | FR-009; NFR-001–NFR-002 | Metadata matches actual run and portable project model |
| Limited communication graph | FR-005–FR-006; NFR-003–NFR-004, NFR-007 | D-02 checkpoint proves from-empty construction, connection editing, typed errors, accessible path, and UI-independent execution |
| Built-in-to-workspace conversion | FR-014; NFR-002 | Supported mapping preserves semantics and equivalent results under approved D-01 criteria; unsupported mapping fails clearly or requires explicit fork |
| Local portable project exchange | FR-007–FR-008; NFR-002, NFR-005–NFR-006, NFR-008 | Fresh-session and self-hosted round trip; malformed/unsupported files leave work intact |
| Safe, reproducible execution | NFR-001–NFR-005 | Independent numerical references, defined conventions and budgets, controlled failure/cancellation, tested browser/device policy |

These P0 capabilities retain their Stage 1 priority. The graph and conversion are **proposed P0, conditional on D-02 feasibility**; a guided-only public release would require explicit Stage 1 scope and requirement revision. Additional presets or learning modes are optional presentation enhancements only if they do not delay P0 evidence.

## Boundaries

**Existing university AM assignment:** the separate simulator covers conventional AM, DSB-SC, SSB, and VSB. Its integration requirements are unknown; audit precedes reuse. Those additional modes may be assignment deliverables, but do not automatically enter the public MVP.

**Architecture-validation slice:** conventional AM exercises canonical model ownership, numerical references, guided and graph routes, conversion, and project exchange. Passing a slice is evidence, not a public launch.

**Public MVP exclusions:** general DSP streaming/filtering, circuit/control/digital engines, a full editor suite, public plugin API or execution, reusable subgraphs, arbitrary expressions, hosted project storage, accounts, community publishing/forking, and optional managed compute. These remain visible as future platform direction under the five pillars, with separate decisions and funding.

## Decisions before commitment

D-01 must approve numerical convention/reference cases and tolerances; D-02 must pass or trigger product scope review; D-03 must settle a portable format/version policy; D-04–D-06 must provide budgets, support policy, and accessibility evidence; D-07 must confirm minimal internal extension boundaries. None was marked Accepted by Stage 3. See [decision register](../architecture/architecture-decisions.md), [validation plan](validation-plan.md), and [release plan](release-plan.md).
