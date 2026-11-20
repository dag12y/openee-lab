# OpenEE Lab — Student AI Agent Initial Prompt

> **Student:** Ask your AI coding agent: **“Read `INITIAL_PROMPT.md` and complete GitHub Issue #N. Follow its workflow, work on a feature branch, and open a Pull Request. Do not merge.”** Replace `N` with your assigned issue number (Chapter 1: #10–#16).
>
> This file is an instruction for coding agents working inside the checked-out OpenEE Lab repository. Read the entire file before changing anything.

## 0. Required input and objective

The student specifies exactly one GitHub Issue number (`#N`). The issue is the authoritative source for the assigned topic and its acceptance criteria. Never guess the issue number, the student identity, or the scope. If the issue number is missing, ask for it before making changes.

**Repository:** `dag12y/openee-lab`  
**Default base branch:** `main`  
**Output:** a focused implementation on a feature branch, verified tests, and a Pull Request against `main`, with a clear final report. **Do not merge.**

## 1. Read project context before implementing

1. Confirm this checkout belongs to `dag12y/openee-lab` and inspect `git status`, current branch, and remotes.
2. Open the specified issue with GitHub integration, `gh issue view N --repo dag12y/openee-lab`, or the GitHub website. **Read its full description, checklists, comments, and any linked dependencies.** If you cannot access the issue, ask the student to paste its complete contents; do not invent its requirements.
3. Read `AGENTS.md` if it exists, plus `README.md` and the relevant files under `docs/`. At minimum read `docs/verification/ch1-shared-numerics.md`, and inspect `packages/numerics`, `packages/contracts`, and relevant code and tests. Follow existing package-specific agent guidance, if present.
4. Check existing implementations and identify what is already available, so you do not duplicate it.
5. Extract an issue-specific checklist: required mathematical models, experiments, inputs and units, numerical outputs, independent reference tests, integration requirements, and documentation. Identify any unresolved or conflicting requirements.

## 2. Safe branch setup

- Before changing files, make sure the working tree is clean. **If it is not clean, do not stash, reset, delete, or overwrite changes without the student's approval.**
- Fetch the latest remote refs and fast-forward local `main` when possible. Do not force-update or rewrite shared history.
- Create a new descriptive topic branch from up-to-date `main`, preferably the name suggested by the issue, such as `feat/ch1-s3-fourier-series`. If that branch already exists, inspect it and ask whether to continue it; never overwrite it.
- **Never work directly on `main`. Never push directly to `main`. Never force-push or merge without explicit approval.**
- Show the student the branch name and a short issue-specific implementation plan before substantial changes. If the student has already authorized autonomous implementation, proceed within the issue scope after presenting the plan; request clarification only for decisions that materially affect architecture or correctness.

## 3. Implementation boundaries

Implement **the assigned issue only**, in the existing OpenEE Lab codebase.

### Mathematical and simulation work

- Begin with the lecture-mapped mathematical models and independent expected outputs.
- Implement a headless, domain-specific numerical module. Keep computation separate from frontend components.
- Prefer existing T-06 engine contracts, sampling/spectrum conventions, diagnostics, versioned models, and `packages/numerics` helpers. Check the actual APIs rather than assuming they exist.
- Define units, parameter domains, initial conditions, boundary cases, resource guards, and reproducible inputs. Use stable seeded randomness if applicable and coordinate shared transforms/PRNG design with neighboring issue owners.
- Add independent analytical or justified statistical tests, including invalid-input and edge-case tests. Do not merely compare the implementation against itself.
- Avoid unrelated refactors, new global frameworks, second run controllers, unreviewed shared APIs, or duplicated FFT/DFT/sampling libraries.

### Frontend work

The Chapter 1 shared numerical foundation exists, but a standardized browser frontend and a general Chapter 1 worker adapter may **not** yet exist. **Inspect the repository and issue before assuming they do.**

- If the issue explicitly requires a topic-specific UI **and** approved shared frontend components exist, implement controls, graphs, validation/error/loading states, correct latest-run display, units, and accessible result descriptions using those components.
- If shared frontend infrastructure is absent, **do not create a standalone React/Vite/Next.js application or change the global design system**. Complete the numerical module, tests and documentation; provide a small UI integration proposal and note the frontend dependency in the PR.
- Do not build other students' simulations or introduce plotting/state-management dependencies without review.

## 4. Work in reviewable steps

1. **Scope/design:** Summarize the issue requirements, equations, expected interactions, existing reusable APIs, and file plan.
2. **Numerical implementation:** Add the smallest cohesive solution and validation.
3. **Verification:** Add independent tests and run them; confirm relevant existing regressions still pass.
4. **Integration/documentation:** Explain how to integrate this topic into the existing engine and future UI, including current limitations.
5. **Self-review:** Check for unrelated modifications, hard-coded assumptions, numerical mistakes, missing units, unbounded work, and changes to other students' files.

Do not claim that tests passed unless actually executed. If something cannot be run, say exactly why.

## 5. Git and Pull Request requirements

- Use focused commits on the feature branch. Do not commit secrets, local environment files, generated bulky artifacts, or unrelated changes.
- Push **only** the feature branch to `origin` after showing the student what changed. Do not force-push.
- Open a **Draft Pull Request** against `main` when substantial implementation is underway; mark ready for review when the requested acceptance criteria are demonstrably met. If GitHub write access is unavailable, provide the exact `git push` and `gh pr create` commands for the student.
- Link the issue: use **`Refs #N`** for partial work; **`Closes #N`** only when all issue acceptance criteria, including any required UI/integration, are complete.
- PR description must include: summary, issue, scope, key mathematical conventions, implementation files, commands/tests and results, screenshots if a UI exists, limitations, and remaining dependencies.
- **Never merge the PR yourself.** The repository maintainer reviews and merges it under branch protection.

## 6. Final response to the student

Report:

- Issue number and title, branch name, commit SHA and PR URL (if created)
- What was implemented and what was intentionally deferred
- Equations, parameters, physical units and numerical assumptions
- Files changed and how the new module connects to OpenEE Lab
- Tests executed and their actual outcomes
- Any blockers, open questions, shared API requests, and frontend integration dependencies
- Confirmation that `main` was not modified or merged

## Issue index (navigation only — read the actual issue)

| Issue | Topic |
| --- | --- |
| [#10](https://github.com/dag12y/openee-lab/issues/10) | S1: Signal Fundamentals & Euler Identity |
| [#11](https://github.com/dag12y/openee-lab/issues/11) | S2: LTI Systems & Convolution |
| [#12](https://github.com/dag12y/openee-lab/issues/12) | S3: Fourier Series & Transform-Domain Analysis |
| [#13](https://github.com/dag12y/openee-lab/issues/13) | S4: Fourier Transform & Frequency Domain |
| [#14](https://github.com/dag12y/openee-lab/issues/14) | S5: Probability & Random Variables |
| [#15](https://github.com/dag12y/openee-lab/issues/15) | S6: Random Processes |
| [#16](https://github.com/dag12y/openee-lab/issues/16) | S7: Spectral Analysis, Noise & Systems |

**Priority:** Deliver correct, reviewable, integrable student-topic simulations—not seven disconnected demos.
