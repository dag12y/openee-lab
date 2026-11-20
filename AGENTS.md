# OpenEE Lab — AI Agent Instructions

## Project mission

OpenEE Lab is an open-source engineering simulation platform, beginning with the required university Chapter 1 and Chapter 2 simulations.

This repository is a shared team project. Preserve its architecture, numerical correctness, code quality, and collaborative development workflow.

## Before making any changes

1. Read this file and the relevant project documentation.
2. Read the student's assigned GitHub Issue in full.
3. Inspect existing source code, tests, and contracts before proposing implementation.
4. Identify which parts of the requested functionality already exist.
5. Explain the intended implementation plan before making substantial changes.

Do not assume an empty project or generate an unrelated application.

## Scope and ownership

- Work only on the assigned GitHub Issue.
- Do not implement another student's topic.
- Do not refactor unrelated modules.
- Coordinate shared API changes through a separate issue or PR.
- Preserve backward compatibility with existing simulations.
- Ask the developer for decisions when requirements or interfaces are genuinely ambiguous.

## Engineering architecture

Follow these boundaries:

- **Numerical foundation:** Shared sampling, signal representation, validation, and transform utilities.
- **Simulation modules:** Topic-specific mathematical models, calculations, diagnostics, and tests.
- **Execution layer:** Run orchestration, worker execution, cancellation, and stale-result protection.
- **Frontend:** Interactive controls, plots, result interpretation, and engineering workspaces.

Keep mathematical computation independent of UI components.

Reuse existing contracts and numerical packages wherever appropriate.

Do not introduce a new framework, state-management library, plotting library, or major dependency without approval.

## Frontend development

Students may build topic-specific frontend features once shared frontend conventions and integration APIs are approved.

Do not independently generate a complete frontend application.

Before implementing a frontend:
- Identify the shared component and plotting APIs.
- Define required inputs, ranges, units, and defaults.
- Define expected visualizations and output interpretation.
- Handle loading, validation errors, cancellation, and empty results.
- Preserve accessibility and responsive layout.
- Ensure displayed results correspond to the latest model revision.

If the shared frontend foundation is unavailable, document the proposed interface and build numerical functionality and tests first.

## Numerical correctness

- Define mathematical equations and assumptions.
- Validate user-controlled inputs.
- Use explicit physical units.
- Reuse existing sampling and spectral conventions.
- Distinguish amplitude, power, and power spectral density.
- Include independent analytical reference tests.
- Account for numerical edge cases.
- Use deterministic random seeds when appropriate.
- Respect bounded resource limits.

Never fabricate numerical verification results.

## Git workflow

- Never commit directly to main.
- Create a feature branch from the latest main.
- Use focused commits.
- Open a Draft Pull Request for design or incomplete implementation.
- Reference the assigned GitHub Issue.
- Use `Refs #N` for partial work.
- Use `Closes #N` only when every acceptance criterion is satisfied.
- Never merge or force-push without explicit authorization.

## Completion checklist

Before submitting:
- Run relevant tests and TypeScript checks.
- Check existing regression tests.
- Document any added dependency.
- Explain all files changed.
- Identify assumptions, limitations, and unresolved integration requirements.
- Summarize what was implemented versus what remains.

The goal is a correct, maintainable, integrated simulation—not simply code that runs.