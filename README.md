# OpenEE Lab

**Status:** Phase 0 planning documentation (Stages 1–4) is complete and merged. The `apps/web` prototype now includes a Conventional AM lab and a Chapter 1 Random Processes lab; broader platform features and numerical/accessibility validation remain in progress.

OpenEE Lab is an open-source, extensible, browser-based electrical engineering platform in planning. Its intended scope spans engineering work, simulation, extension, community exchange, and learning. Communication systems are the first proposed working domain, not the platform's identity.

## Long-term product pillars

- **Engineering Workspace:** specialized editors and tools for constructing and analyzing systems.
- **Built-in Simulations:** ready-to-use experiments across electrical engineering disciplines.
- **Plugin Ecosystem:** extensible components, engines, tools, and integrations.
- **Community:** publish, discover, share, and fork projects and extensions.
- **Learning:** guided experiments, explanations, and visualizations.

These are long-term aims, not implemented features. The platform foundation calls for UI-independent simulation, domain-appropriate models, and portable projects. The existing university AM assignment, a conventional AM architecture-validation slice, and the [proposed first public release](docs/roadmap/mvp.md) have distinct scopes; none defines the long-term ecosystem.

The **proposed public MVP** is a narrow, account-free communication-domain slice: one verified built-in simulation and guided path, a limited engineering workspace with a genuine signal graph, and local portable project exchange. Conventional AM is the candidate first example. The graph and faithful simulation-to-workspace conversion remain subject to a feasibility checkpoint; this proposal is not an approved release commitment. Additional engines, plugin execution, and hosted community features are future work.

## Documentation

Start with the [documentation guide](docs/README.md). The [product vision](docs/product/vision.md), [architecture decisions](docs/architecture/architecture-decisions.md), and [implementation roadmap](docs/roadmap/milestones.md) give the direction, open technical gates, and proposed sequence. The full Stage 1–4 reading order is in the guide.

## Development and contributions

Planning documents are ready for implementation review; they do not establish numerical correctness, accessibility compliance, or release readiness. The seven technical decisions [D-01–D-07](docs/architecture/architecture-decisions.md) remain open pending implementation and validation evidence. The separate university AM simulator covers conventional AM, DSB-SC, SSB, and VSB, but its numerical correctness and architecture have not been audited. Assignment integration may include those modes after audit; the public MVP does not automatically inherit them.

Feedback on scope, learning outcomes, acceptance criteria, numerical validation, accessibility, and self-hosting is welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the documentation and pull-request workflow. Proposed decisions require review before they become implementation commitments.
