# Incremental implementation plan

**Status:** Proposed task backlog; package names and task boundaries may change after architecture review.
**Purpose:** Turn milestones into focused implementation sessions with observable outputs and gates.
**Scope:** M0–M6 public-slice path. The university assignment audit is included as an input gate, not an automatic feature integration.

Package names below are the illustrative logical areas in [implementation boundaries](../architecture/implementation-boundaries.md). A task is complete only when its listed acceptance evidence exists. Tasks that implement a proposed technical choice wait for the relevant decision or are explicitly labeled spikes.

| ID / milestone | Focused task | Depends on; inputs | Output / relevant area | Test or acceptance evidence |
| --- | --- | --- | --- | --- |
| T-01 / M0 | Confirm assignment rubric and mode-integration scope | Stage 1 scope; assignment owner input | Written assignment/public-scope separation; product planning | Reviewer records required modes without altering MVP implicitly |
| T-02 / M0 | Open decision evidence log for D-01–D-07 and review authority | Stage 3 decisions | Gate checklist and owner roles; planning | Each decision has reviewer, needed evidence, and status still Open until review |
| T-03 / M0 | Review open-source license and dependency policy | Product open-core principle; intended packages | Approved licensing constraints; repository policy | Planned essential workflow can be distributed/self-hosted; no incompatible dependency is chosen |
| T-04 / M1 | Audit separate university simulator, without adopting code | T-01; existing simulator access | Numerical/architecture findings and reuse disposition; verification | Each AM mode checked against documented convention or marked unverified; no simulator output treated as oracle |
| T-05 / M1 | Define candidate conventional AM model and reference matrix | T-02; [proposed equation](../architecture/dsp-engine.md#conventional-am-integration) | Reviewed model/units/sampling draft; `engine-communications` | Independent analytical cases, boundary and aliasing expectations; D-01 approval requested, tolerances not invented |
| T-06 / M1 | Specify minimal run envelope, diagnostics, and immutable snapshot | T-05; D-07 boundary proposal | Internal contract draft; `contracts` | Contract review covers success/rejected/cancelled/failed and model/engine/revision provenance |
| T-07 / M1 | Implement non-UI finite AM execution and validation | T-05, T-06; provisional D-04 guard | Batch engine; `engine-communications`, `simulation-core` | Independent time and frequency reference cases, invalid inputs, and no UI import; release claim waits for D-01 |
| T-08 / M1 | Add reproducible run identity and cancellation handling | T-06, T-07 | Run controller/worker seam; `simulation-core` | Stale revisions cannot become current; cancelled/failed outcomes carry no outputs; non-UI path works |
| T-09 / M2 | Build guest navigation and verified catalog/detail path | T-05; Stage 2 IA | Browser shell and one actual experiment entry; `apps/web`, `ui` | No auth gate, no dead future navigation, keyboard path to experiment |
| T-10 / M2 | Build guided parameter form and model inspection | T-05, T-09 | Mapped controls and metadata view; `editor-communications`, `apps/web` | FR-002/FR-009 fields and units match canonical model; invalid values block run |
| T-11 / M2 | Build explicit run, plots, equations, reset, diagnostics | T-07, T-08, T-10 | Internal guided slice; `apps/web`, `ui` | FR-003/FR-004 flows; prior results labeled stale; plots have text summaries; numerical checks remain independent |
| T-12 / M3 | Spike from-empty graph construction and typed connections | T-05–T-08; Stage 2 checkpoint | Supported graph editor proof; `editor-communications`, `apps/web` | User adds blocks, connects, breaks/repairs, and sees changed execution/validation; pointer and keyboard paths |
| T-13 / M3 | Spike graph compiler and guided conversion inventory | T-10, T-12; canonical model | Plan compiler/mapping report; `engine-communications`, `editor-communications` | Guided and equivalent graph models preserve all supported fields and match D-01 criteria; unsupported mapping reports loss/fork |
| T-14 / M3 | Exercise graph edit history and accessibility tasks | T-12, T-13 | Undo/redo and accessible graph findings; `editor-communications`, `ui` | Add/remove/connect/parameter edits round-trip through undo; keyboard and assistive workflow findings recorded |
| T-15 / M3 | Decide graph scope gate | T-12–T-14; D-01 evidence | D-02 decision record; product/architecture review | All checkpoint criteria pass or explicit Stage 1 scope/priority review is initiated; no silent downgrade |
| T-16 / M4 | Define and review portable project schema/version policy | T-05, T-13, T-15; D-03 | Format contract and import policy; `project`, `contracts` | Canonical model vs layout vs results separated; future/invalid versions specified; D-03 reviewed |
| T-17 / M4 | Implement local export and transactional import | T-16; provisional D-04 file guard | Portable exchange; `project`, `apps/web` | Fresh-session and self-hosted round trip; malformed/oversized/unsupported files preserve current work |
| T-18 / M4 | Complete graph workspace and conversion integration | T-15 pass, T-17 | Supported editor, model inspector, results; `editor-communications`, `apps/web` | FR-005/FR-006/FR-014 end-to-end, explicit unsupported conversion, no numerical formula in UI |
| T-19 / M5 | Measure and approve resource/cancellation budgets | T-07, T-18; D-05 candidate devices | D-04 evidence and guards; `simulation-core`, `project` | Measured cases and safe rejection/cancellation; approved budgets, no invented numbers |
| T-20 / M5 | Select and test browser/device support matrix | T-11, T-18, T-19 | D-05 support policy; `apps/web` | Guest, lab, graph, import/export, and numerical comparison on chosen environments |
| T-21 / M5 | Evaluate and remediate accessibility | T-11, T-14, T-18; D-06 standard | Test findings and fixes; `apps/web`, `ui` | Core keyboard/screen-reader/plot/diagnostic tasks pass approved standard; compliance claim only after evidence |
| T-22 / M5 | Verify self-hosted essential workflow and docs | T-17–T-21; D-07 review | Reproducible build/use instructions; repository docs | Run–inspect–edit–export/import succeeds without proprietary managed services; contribution/license docs reviewed |
| T-23 / M6 | Review release candidate and rollback evidence | T-19–T-22; [release gates](release-plan.md) | Product release decision | All P0 traceability and D-01–D-07 disposition reviewed; regression and rollback plan exercised |

## Suggested sequencing and parallel work

T-01–T-03 establish decisions and guardrails. T-04 can proceed alongside T-05 but reuse decisions wait for its audit. T-06–T-08 form the UI-independent core; T-09 can begin in parallel once the catalog model is known. T-12–T-15 are a **hard checkpoint** before treating graph-dependent first-release tasks as committed. T-16 may draft early, but schema approval and T-17 wait for the model/graph boundary. T-19–T-22 can run in parallel after integrated workflows exist; T-23 collects their evidence.

## Trace and change control

The [MVP matrix](mvp.md) maps capabilities to Stage 1 IDs. The [validation plan](validation-plan.md) maps evidence to each decision; [milestones](milestones.md) define release-blocking exits. If T-15 fails, do not close FR-005, FR-006, or FR-014; request explicit product-scope review. New domains, hosted services, and plugins require separate future plans.
