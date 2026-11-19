# Product vision

**Status:** Draft; overall product direction is accepted for further planning, release and technical choices remain Proposed.  
**Purpose:** State the problem, audience, mission, and criteria that guide product decisions.

## Problem and users

Electrical engineering work is often split across isolated simulators, editors, teaching demos, and sharing channels. Users need a coherent place to construct models, run trustworthy simulations, inspect behavior, and reuse or exchange work. Learning is one important use of that platform.

Target users include students, educators, practicing engineers, independent learners, researchers, and extension authors. **Proposed initial users:** people exploring communication systems, including students using the first guided simulation. Later domains should serve the broader audience without making that initial domain the product identity.

## Vision and mission

**Vision:** Anyone can open a browser, build an electrical engineering system, simulate it, understand its behavior, and share the result.

**Mission:** Provide an open foundation where engineering tools, simulations, learning experiences, and eventually extensions and community contributions can grow together.

## Long-term product pillars

1. **Engineering Workspace:** multiple specialized editors and engineering tools.
2. **Built-in Simulations:** ready-to-use experiments across electrical engineering disciplines.
3. **Plugin Ecosystem:** extensible components, simulation engines, tools, and integrations.
4. **Community:** publishing, discovering, sharing, and forking projects and extensions.
5. **Learning:** guided experiments, explanations, and visualizations.

All five are long-term direction. Plugin execution and community hosting are **Future**, subject to separate security, governance, and operational decisions.

## Core principles

- **Accepted:** The browser is the primary access point; basic use requires no account.
- **Accepted:** Numerical correctness and reproducibility are fundamental. Results need defined models, units, and verification evidence.
- **Accepted:** Simulation logic is independent of UI frameworks.
- **Accepted:** Engineering domains may need different engines and model representations. A single universal graph is not assumed.
- **Accepted:** Start with a focused release and favor modularity over premature microservices.
- **Accepted:** Security and resource limits are product requirements, especially for user-supplied models and future extensibility.
- **Accepted:** Essential simulation functionality remains open source and self-hostable; optional managed services may follow.

## Platform foundation and first working release

**Platform foundation:** agreed product principles call for UI-independent simulation, domain-appropriate representations, reproducible project data, security and resource boundaries, and an open, self-hostable core. The exact contracts, formats, engines, and deployment design are open technical decisions, not approved architecture.

**Proposed conventional AM vertical slice:** an architecture-validation exercise for simulation, model inspection, and supported workspace editing. It is distinct from the university assignment and does not alone constitute a public release.

**Proposed first public release:** one verified communication simulation, a limited workspace path for constructing and inspecting it, a guided learning path, and portable local project exchange. Conventional AM is the current candidate example; the graph's feasibility needs a checkpoint. See [scope](scope.md) and [requirements](requirements.md).

**Future:** additional communications modes, circuit/control/digital/DSP engines, reusable subgraphs, restricted expressions, sandboxed plugins, and community publishing and discovery. Each domain should be evaluated for its own model instead of inheriting the communication graph by default.

## Success criteria

For the proposed first release, success means a visitor can run a verified communication experiment without signing in; a user can construct and inspect its supported model in a limited workspace; a learner can connect parameters to plots and equations; and a saved project can reopen and reproduce results. Accessibility, safe input handling, and bounded computation must meet the [nonfunctional requirements](requirements.md). Longer-term success includes useful tools and simulations across domains and a safe, active extension and community ecosystem; no metrics for those future outcomes are approved yet.

## Open questions

- Which learning outcomes and demonstration format does the university assignment require?
- Which assignment modes should be integrated after auditing the existing simulator, and which, if any, belong in the public release?
- What technical boundaries and graph feasibility evidence should Stage 2 establish?
- What hosted community sharing should follow portable local exchange?
