# Contributing to OpenEE Lab

**Status:** Planning-stage contributor guidance. Application build and test commands will be added when implementation exists.

OpenEE Lab is an open-source electrical engineering platform. The [documentation index](docs/README.md) is the starting point for its product scope, UX, architecture, and roadmap. Contributions should preserve the distinction between the university AM assignment, the conventional AM validation slice, the proposed public MVP, and future platform capabilities.

## Propose a documentation change

Open an issue or draft pull request describing the problem, affected documents, proposed wording, and any product or technical decision it would change. Use relative Markdown links. Mark unresolved choices **Proposed** or **Open**; do not present a future capability as implemented or silently change Stage 1 requirement priorities. For a narrow correction, include the supporting source and the consequence for linked documents.

## Branch and pull-request workflow

Start from an up-to-date `main`, create a focused branch, and commit only files related to the change. Open a pull request against `main` with a summary, scope impact, verification performed, and unresolved questions. Prefer a draft PR while decisions or evidence are incomplete. Review the diff and check links before requesting review. Do not force-push shared work or merge a PR without the required review and repository checks.

## Traceability and engineering evidence

Link changes to applicable [requirements](docs/product/requirements.md) (`FR-…` and `NFR-…`) and [architecture decisions](docs/architecture/architecture-decisions.md) (`D-01` through `D-07`). If a proposal changes public scope or a P0 requirement, say so explicitly and request product review. Decision recommendations remain open until their required evidence is reviewed.

Future simulation-code contributions must define model conventions, units, sampling behavior, version/provenance, analytical or otherwise independent reference cases, and boundary behavior. Compare outputs under reviewed tolerances rather than relying on screenshots, same-engine snapshots, or the unaudited university simulator as an oracle. Include reproducibility and failure-path evidence appropriate to the [validation plan](docs/roadmap/validation-plan.md). Keep numerical logic independent of UI frameworks.

## Report bugs and design concerns

Open a GitHub issue with the affected document or future workflow, expected and observed behavior, reproduction steps where possible, model/version and sampling settings for numerical concerns, and any data-loss or safety impact. Avoid attaching private project data without permission. For design concerns, identify the user journey and relevant requirement or decision ID. Build, run, and test instructions will be documented once application code exists.
