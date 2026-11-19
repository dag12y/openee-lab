# M0 licensing and dependency proposal

**Status:** Proposed for maintainer approval; no repository license or dependency selection is approved.
**Purpose:** Compare plausible open-source licenses and set a preliminary review policy before implementation.
**Scope:** T-03 planning. This document does not create a LICENSE file, relicense existing work, or authorize reuse of the separate university simulator.

## License comparison

| Option | Reuse and redistribution | Contributor and redistribution duties | Patent considerations | Compatibility and ecosystem implication |
| --- | --- | --- | --- | --- |
| [MIT](https://opensource.org/license/mit) | Permissive use, modification, sublicensing, and commercial redistribution, including proprietary derivatives | Retain copyright and permission notice in copies/substantial portions; no source-publication obligation | No express patent grant or termination clause in the short license text | Simple and widely reusable; downstream changes may remain closed, and patent expectations are less explicit |
| [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0.html) | Permissive source/binary redistribution, including proprietary derivatives | Preserve license and relevant notices; mark changed files; carry a NOTICE file if one exists and applies. Intentional contributions are under Apache-2.0 unless explicitly stated otherwise or governed by a separate agreement | Express contributor patent grant with patent-litigation termination | Supports broad use and a clear patent position; compatible as an inbound component to GPLv3 combinations, but Apache-only distribution cannot absorb GPLv3-covered combined code under Apache terms alone |
| [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.en.html) | Use and modification are allowed; distribution of covered derivatives carries copyleft conditions | On conveying covered binaries/derivatives, provide corresponding source and preserve GPL terms/notices; contributor provenance and rights still need review | GPLv3 includes patent provisions; distribution obligations are more involved | Stronger reciprocity keeps distributed derivatives open; combining and distributing code requires careful compatibility review. Ordinary GPLv3 does not itself impose the AGPL network-use source obligation |

The [FSF compatibility analysis](https://www.gnu.org/licenses/license-compatibility.en.html) describes the direction of Apache-2.0 and GPLv3 compatibility; it is not a blanket permission for every dependency combination. License compatibility depends on how code is combined and distributed. The existing university simulator's license and contributor rights have not been checked, so no code or asset reuse is authorized by this comparison.

## Recommendation for review

**Recommend Apache-2.0** for the planned open core, subject to maintainer approval and a contributor-rights review. It allows academic, commercial, and self-hosted reuse while giving contributors and adopters an explicit patent framework. This fits a platform intended to invite future domain engines and tools without requiring every downstream integration to adopt copyleft. The tradeoff is that downstream forks can be proprietary; if reciprocal publication of distributed changes is a higher priority, GPL-3.0 merits a separate product and legal review. Choosing Apache-2.0 would not make hosted services or plugins part of the public MVP.

There is currently **no LICENSE file**. Until the copyright holders approve and add one, do not describe the repository as already licensed under Apache-2.0 or import third-party code on the assumption that the recommendation is in force. Determine copyright ownership of existing documentation and any future simulator reuse, then record the approved license and notice practice. A future contributor agreement or sign-off policy is a separate decision; this proposal does not impose one.

## Preliminary dependency policy

1. **Need and boundary:** add a dependency only for a demonstrated first-slice need. Prefer small, maintained libraries over a general plugin framework, backend service, or universal graph abstraction. Essential run, inspect, edit, and portable exchange must remain self-hostable without proprietary managed services (NFR-008).
2. **License and provenance:** record package version, source, SPDX license identifier, notices, transitive licenses, and how it is combined/distributed. Review incompatible or unknown terms before adoption. Audit the university simulator's license separately before any copying or adaptation.
3. **Security:** assess maintenance activity, known advisories, supply-chain provenance, permissions, browser exposure, and whether untrusted project data reaches the library. Browser workers are not a sandbox for hostile plugins. Define update and vulnerability-response ownership before use.
4. **Reproducibility:** use an exact lockfile and documented toolchain once implementation starts. Record numerical-library versions and algorithms in run provenance where they affect results; verify upgrades against independent references and project round trips. Avoid unreviewed floating version ranges in release builds.
5. **Compatibility and accessibility:** test a candidate in the approved browser/device matrix and first-release keyboard/screen-reader flows. Do not infer graph feasibility or numerical correctness merely because a library renders graphs or computes FFTs.
6. **Review record:** each proposed dependency needs its purpose, alternative considered, license/security findings, maintained owner role, version/update plan, and validation impact in its PR. No package is selected or installed by M0.

**T-03 disposition:** License recommendation and dependency criteria are recorded, but license choice, copyright/provenance review, and concrete dependency approvals remain open. Related [open-core scope](../product/scope.md), [implementation boundaries](../architecture/implementation-boundaries.md), [risk register](../roadmap/risk-register.md), and [contribution guidance](../../CONTRIBUTING.md).
