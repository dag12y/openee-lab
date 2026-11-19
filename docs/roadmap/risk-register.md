# Risk register

**Status:** Proposed; severity is a planning judgment, not a measured probability.
**Purpose:** Make decisions and mitigation work visible before implementation commitments.
**Scope:** Public-slice critical path and separate assignment/future ecosystem exposure. Owner entries are roles, not assigned people.

| ID / severity | Risk and consequence | Mitigation / evidence | Owner role | Decision trigger |
| --- | --- | --- | --- | --- |
| R-01 / Critical | Wrong AM convention or circular reference gives plausible but incorrect results | Independently derive time/spectral cases; record FFT convention; audit simulator before reuse | Numerical lead | V-01 or V-02 fails; D-01 lacks approved tolerance/reference |
| R-02 / Critical | Graph editing is cosmetic or too costly, undermining FR-005/FR-006 | From-empty construction spike, typed connections, changed execution, keyboard task test | Workspace lead | M3 checkpoint fails or estimate exceeds approved scope; return Stage 1 to review |
| R-03 / High | Guided-to-graph conversion silently loses semantics | Canonical field inventory, plan comparison, explicit unsupported/fork path | Domain-model lead | V-05 reveals omitted assumption/parameter; block FR-014 |
| R-04 / High | Portable file import corrupts work or accepts hostile data | Transactional parse/validate, size limits, unsupported-version handling, untrusted-input review | Project-format lead | V-06 or security review fails; block M4/beta |
| R-05 / High | Unbounded runs freeze browser or misleading stale plots appear | Worker run identity, measured guards, cancellation/failure tests, stale-result labels | Runtime lead | V-07 fails or D-04 budget unresolved at release gate |
| R-06 / High | Canvas interaction excludes keyboard or screen-reader users | Accessible element/port list, manual task evaluation, approved standard | Accessibility lead | V-09 fails; block beta/public claim |
| R-07 / High | Architecture hard-codes communication graph for future domains | Shared envelope with domain payload; paper review using non-graph domain | Architecture lead | D-07 review finds universal-graph dependency |
| R-08 / High | Proprietary service becomes required for run/edit/exchange | Self-hosted end-to-end test and dependency inspection | Release engineering lead | V-10 fails; block public MVP |
| R-09 / Medium | Browser/file/worker differences change results or block a supported workflow | Explicit D-05 matrix and cross-browser tests | Compatibility lead | V-08 fails on selected environment; revise support policy before beta |
| R-10 / Medium | Assignment modes are accidentally promised as public features | Maintain assignment/public trace; audit each mode before integration | Product lead | Rubric arrives or simulator audit identifies extra scope |
| R-11 / High | Open-source license or reused simulator code is incompatible | License audit before code reuse and dependency selection | Maintainer/legal-review role | T-03/T-04 finds incompatible terms; stop reuse |
| R-12 / Medium | Premature plugins or hosted community work delays verified slice or widens attack surface | Keep stages future; require independent security/product gates | Product and security leads | Proposed plugin/hosting task enters M0–M6 without approval |
| R-13 / High | Release pressure bypasses unresolved D-01–D-07 evidence | Gate log, independent review, explicit scope-change record | Release lead | Milestone requested complete without required V-gate evidence |

Severity reflects impact if the risk occurs; it does not assert likelihood. Owners are responsible for gathering evidence and escalating decisions, not unilateral authority to approve product scope. Link each triggered risk to the [validation gate](validation-plan.md), [task](implementation-plan.md), and [decision record](../architecture/architecture-decisions.md) in the implementation issue tracker when one exists.
