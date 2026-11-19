# User journeys

**Status:** Draft; MVP journeys are Proposed and future journeys are explicitly Future.  
**Purpose:** Show first-release user outcomes and distinct future platform journeys.

The proposed public-release journeys exercise a narrow communication-domain slice of the engineering workspace, built-in simulations, and learning pillars. The separate university AM assignment may integrate more modes after audit. A conventional AM vertical slice can validate the flows before a public release. Plugin and hosted community journeys are future capabilities.

## First-time visitor

**Proposed.** A visitor opens the platform in a browser without creating an account, sees the available workspace and built-in simulation entry points, and starts the first guided communication example (currently proposed as conventional AM). The page explains the model and shows a default result with labeled units. The visitor changes one parameter and reads the updated result and explanation. Invalid settings produce a clear correction. This journey depends on FR-001–FR-004 and NFR-004.

## Student using a guided AM lab

**Proposed.** A student explores how message and carrier parameters affect a conventional AM waveform and spectrum. They compare plotted changes with the displayed equation, inspect model and sampling assumptions, and reset to a known example. The expected learning outcome is the ability to connect parameter changes with observable signal behavior; the educator's required outcomes remain an open question. Numerical examples must be verified before this journey is treated as reliable.

## User building a signal-processing graph

**Proposed; feasibility checkpoint required.** A user opens the engineering workspace's first specialized editor, places approved communication blocks, connects source and carrier through a modulator to a result view, and sets parameters. They run the graph, inspect block settings and output, then correct an incomplete or invalid connection if prompted. They can compare an equivalent graph with the guided experiment within a declared tolerance. Stage 2 must test whether this editor is feasible for the first release. Later editors may use different models and interactions.

## Built-in simulation to editable workspace

**Proposed; feasibility checkpoint required.** A user runs a built-in simulation, inspects its model identity and version, units, sampling configuration, and assumptions, then chooses to open it in the workspace. For supported conversions, the editable model retains the simulation's semantics and yields equivalent results within declared tolerances. The user modifies a parameter, simulates again, and exports a portable project file. If the model cannot be converted faithfully, the product explains why or offers an explicit fork that identifies what changes; it never silently discards model information. This journey links FR-009 and FR-014 to project exchange in FR-007.

## User saving and reopening a project

**Proposed.** After configuring a supported built-in simulation or graph, a user exports a portable, versioned project file. In a fresh browser session or self-hosted deployment, they reopen it and find the supported model, metadata, parameters, blocks, and connections. Rerunning yields reproducible results within documented tolerances. If the file is malformed or its version unsupported, the product explains the issue and preserves the current work. This exchange requires no account or hosted community service.

## Future journeys

- **Future educator:** An educator assembles or selects a guided experiment and shares it with a class. Lab authoring, classroom distribution, and assessment need separate approval.
- **Future extension author:** An advanced user packages a component, tool, or engine extension and tests it under approved permissions and resource limits. Reusable subgraphs and restricted expressions may provide earlier, smaller extension steps; third-party plugin execution needs its own security decision.
- **Future community participant:** A user publishes a project or extension, discovers others' work, and forks it with attribution. Hosting, licensing, privacy, moderation, and governance must be decided first.
- **Future cross-domain engineer:** A user works with communications, circuits, controls, digital electronics, or DSP using suitable specialized editors and engines. Cross-domain interoperability requires separate research.

See [scope](scope.md) for boundaries and [requirements](requirements.md) for acceptance criteria.
