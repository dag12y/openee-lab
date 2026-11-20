# M0 licensing and dependency record

**Status:** Apache-2.0 selected by the maintainer for the current repository; dependency policy is preliminary and individual dependencies remain unapproved.
**Purpose:** Record the license selection, provenance review, and preliminary dependency review policy before implementation.
**Scope:** T-03 evidence. This decision does not authorize copying or adapting the separate university simulator or lecture PDFs.

## License comparison

| Option | Reuse and redistribution | Contributor and redistribution duties | Patent considerations | Compatibility and ecosystem implication |
| --- | --- | --- | --- | --- |
| [MIT](https://opensource.org/license/mit) | Permissive use, modification, sublicensing, and commercial redistribution, including proprietary derivatives | Retain copyright and permission notice in copies/substantial portions; no source-publication obligation | No express patent grant or termination clause in the short license text | Simple and widely reusable; downstream changes may remain closed, and patent expectations are less explicit |
| [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0.html) | Permissive source/binary redistribution, including proprietary derivatives | Preserve license and relevant notices; mark changed files; carry a NOTICE file if one exists and applies. Intentional contributions are under Apache-2.0 unless explicitly stated otherwise or governed by a separate agreement | Express contributor patent grant with patent-litigation termination | Supports broad use and a clear patent position; compatible as an inbound component to GPLv3 combinations, but Apache-only distribution cannot absorb GPLv3-covered combined code under Apache terms alone |
| [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.en.html) | Use and modification are allowed; distribution of covered derivatives carries copyleft conditions | On conveying covered binaries/derivatives, provide corresponding source and preserve GPL terms/notices; contributor provenance and rights still need review | GPLv3 includes patent provisions; distribution obligations are more involved | Stronger reciprocity keeps distributed derivatives open; combining and distributing code requires careful compatibility review. Ordinary GPLv3 does not itself impose the AGPL network-use source obligation |

The [FSF compatibility analysis](https://www.gnu.org/licenses/license-compatibility.en.html) describes the direction of Apache-2.0 and GPLv3 compatibility; it is not a blanket permission for every dependency combination. License compatibility depends on how code is combined and distributed. The existing university simulator's license and contributor rights have not been checked, so no code or asset reuse is authorized by this comparison.

## License decision

**Maintainer decision: Apache-2.0** is the intended license for OpenEE Lab. It permits academic, commercial, and self-hosted reuse while giving contributors and adopters an explicit patent framework. This fits a platform intended to invite future domain engines and tools without requiring every downstream integration to adopt copyleft. Downstream forks can be proprietary. The selection does not make hosted services or plugins part of the public MVP.

### Copyright and provenance review

The tracked tree was inspected at this decision: it contains project Markdown documentation and `.gitignore`, with no application or university-simulator source, lecture PDFs, downloaded assets, dependency manifests, or third-party notice files. Git history records one contributor email (`dagimyibabe19@gmail.com`) under the names `dagm` and `dagm yibabe`; no other contributor or imported-code provenance appears in the repository history. The maintainer explicitly selected Apache-2.0 for this repository. That evidence is sufficient to add the official [Apache-2.0 license text](../../LICENSE) for the current repository content. Git authorship alone is not a warranty of title; any later third-party material requires its own rights and notice review.

The separate university AM simulator is **not** included in this review and must not be presumed licensed for reuse. The instructor's lecture PDFs were inspected locally for the [assignment scope record](../roadmap/m0-scope-record.md) but are not repository content. Before copying any simulator code, assets, or lecture material, identify its copyright holders, license or permission, third-party components, and required notices. Confirm the preferred copyright-holder wording for future file headers or a NOTICE file if needed; the official LICENSE text itself does not require a project-specific copyright line. A contributor sign-off or agreement policy remains a separate future decision.

## Preliminary dependency policy

1. **Need and boundary:** add a dependency only for a demonstrated first-slice need. Prefer small, maintained libraries over a general plugin framework, backend service, or universal graph abstraction. Essential run, inspect, edit, and portable exchange must remain self-hostable without proprietary managed services (NFR-008).
2. **License and provenance:** record package version, source, SPDX license identifier, notices, transitive licenses, and how it is combined/distributed. Review incompatible or unknown terms before adoption. Audit the university simulator's license separately before any copying or adaptation.
3. **Security:** assess maintenance activity, known advisories, supply-chain provenance, permissions, browser exposure, and whether untrusted project data reaches the library. Browser workers are not a sandbox for hostile plugins. Define update and vulnerability-response ownership before use.
4. **Reproducibility:** use an exact lockfile and documented toolchain once implementation starts. Record numerical-library versions and algorithms in run provenance where they affect results; verify upgrades against independent references and project round trips. Avoid unreviewed floating version ranges in release builds.
5. **Compatibility and accessibility:** test a candidate in the approved browser/device matrix and first-release keyboard/screen-reader flows. Do not infer graph feasibility or numerical correctness merely because a library renders graphs or computes FFTs.
6. **Review record:** each proposed dependency needs its purpose, alternative considered, license/security findings, maintained owner role, version/update plan, and validation impact in its PR. No package is selected or installed by M0.

**T-03 disposition:** The maintainer selected Apache-2.0 and the repository-level provenance review supports licensing the current tracked content. The preliminary dependency criteria are recorded; no concrete dependency has been approved. Reuse of the separate simulator remains blocked pending its own provenance audit. D-01 through D-07 retain their evidence-gated statuses. Related [open-core scope](../product/scope.md), [implementation boundaries](../architecture/implementation-boundaries.md), [risk register](../roadmap/risk-register.md), and [contribution guidance](../../CONTRIBUTING.md).
