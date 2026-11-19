# Product scope

**Status:** Draft; MVP choices are Proposed.  
**Purpose:** Separate assignment integration, architecture validation, first public release, and long-term ecosystem.

## Long-term direction and platform foundation

The five [product pillars](vision.md#long-term-product-pillars) define the destination: workspace, built-in simulations, plugin ecosystem, community, and learning. The workspace is the central place where specialized editors and tools can appear. Extensibility is a governing design concern, while actual third-party extension loading and execution remain **Future**.

**Accepted product principles:** browser-first access without mandatory authentication; numerical correctness and reproducibility; UI-independent simulation logic; domain-appropriate engines and representations; modularity without premature microservices; security and resource limits; and an open, self-hostable core. These constrain future technical choices; no particular engine interface, graph architecture, project schema, or deployment design is approved by this document.

## Proposed first public release (MVP)

A browser-based, account-free platform slice in the first communication domain: a constrained engineering workspace, one verified built-in simulation with a guided path, result inspection, and local save/reopen of supported projects. Conventional AM remains the **Proposed** example; choosing it does not make AM the organizing model for other domains. The same supported simulation behavior should be available through the guided path and workspace. This scope is a proposal, not an approved assignment commitment.

| Area | Proposed in scope | Explicit boundary |
| --- | --- | --- |
| Built-in simulation and learning | One verified communication example, proposed as conventional AM, with editable valid parameters, views, equations, explanations, and reset | Other experiments and disciplines await prioritization |
| Engineering workspace | Place, connect, configure, run, and inspect a small set of built-in signal blocks; inspect model parameters | No full editor suite, arbitrary code, general-purpose graph language, or cross-domain graph |
| Projects | Export and reopen a portable, versioned project locally through a browser-supported file workflow | No account, server storage, collaboration, or hosted community publishing |
| Simulation | Deterministic, validated AM examples with units and defined sampling assumptions | No claim that the separate AM simulator is numerically correct or reusable |
| Access and safety | Browser-first, keyboard-operable core flow, validated inputs, bounded work, clear errors | No authentication or hosted execution service in the MVP |

**Proposed built-in graph scope:** source, carrier, AM modulator, and result/plot blocks, sufficient to reproduce the guided example. This is one specialized editor path, not a universal representation or a completed workspace platform. **Significant implementation risk:** graph editing and faithful conversion from a built-in simulation require a Stage 2 feasibility checkpoint before the public-release scope is confirmed. Conversion must preserve supported simulation semantics; unsupported conversions must fail clearly or require an explicit fork, with no silent information loss.

## Assignment deliverables versus product ambition

**Confirmed Stage 1 assignment deliverable:** these six product documentation files. No implementation is requested in this stage.

**Existing university assignment:** a separate simulator covers conventional AM, DSB-SC, SSB, and VSB. Its required integration, demonstration, schedule, and assessment rubric are not supplied. After numerical and architectural audit, any of those modes may be integrated into the assignment path; they are not automatically required for the public release.

**Proposed architecture-validation slice:** use conventional AM to exercise numerical verification, inspectable model metadata, workspace conversion, and project exchange before committing to a wider implementation. This slice is a planning and validation step, not the assignment deliverable or a public launch.

**Long-term ambition:** the five product pillars across engineering domains. This ambition does not enlarge the Stage 1 deliverable or automatically expand the MVP.

## Out of scope for the proposed MVP

Additional modulation modes, including DSB-SC, SSB, and VSB, are not automatically part of the proposed public MVP; their assignment integration remains possible after audit. FM, PM, digital modulation, circuit/control/digital/DSP engines, a full specialized-editor suite, plugin loading or execution, community hosting and discovery, cloud accounts, hosted sharing or forking, simultaneous editing, mobile-native apps, reusable subgraphs, and user-defined expressions are outside this proposed public scope. Numerical auditing of the existing AM simulator is not a Stage 1 task.

## Future expansion

**Proposed sequence, subject to review:** (1) strengthen the communication workspace and add audited experiments; (2) add specialized tools and separate domain engines where validated demand and models exist; (3) introduce reusable extension points, then restricted expressions and sandboxed plugin execution after security and resource policies; (4) add community publishing, discovery, and forking after storage, privacy, moderation, and governance decisions. These tracks may evolve independently. Optional managed cloud services must preserve an open, self-hostable core.

## Dependencies and assumptions

- **Assumption:** Conventional AM is sufficient to establish the first end-to-end learning and simulation path; the assignment may require more.
- **Assumption:** Local file-based persistence meets the first save/reopen journey. Browser storage and export format remain implementation choices.
- **Risk and checkpoint:** A limited graph and semantics-preserving conversion may be too costly for the first release. Stage 2 must test feasibility and present a scope decision before implementation is committed.
- **Dependency:** Define reference equations, units, sampling behavior, tolerances, and test cases before treating any engine output as trustworthy.
- **Dependency:** Audit the separate AM simulator before borrowing numerical behavior or architecture.
- **Open question:** What accessibility target, browser support range, and resource budgets should be approved for release?
- **Open question:** What minimal extension boundary should the first release preserve, without committing to a public plugin API?
- **Open question:** What does the assignment require, and which audited simulator modes should follow its integration path?

See [requirements](requirements.md) for testable criteria and [user journeys](user-journeys.md) for intended flows.
