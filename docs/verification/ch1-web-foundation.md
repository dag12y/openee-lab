# CH1-F01 guided web foundation

**Status** — Initial browser integration for review. D-01 through D-07 remain open. [Issue #20](https://github.com/dag12y/openee-lab/issues/20)

## Design and tooling

The app uses native HTML with TypeScript and Vite. For one interactive lab, DOM composition keeps forms semantic, avoids a client framework dependency, and gives topic authors a small mounting API. Hash routes support static hosting without route rewrites. Vite builds the browser and dedicated worker bundles. TypeScript and Playwright Core run at development time only. Vite is MIT licensed, while TypeScript and Playwright Core are Apache-2.0 licensed. The application has no external runtime dependencies or hosted services. [Design system](../design/design-system.md) · [Guided labs](../design/guided-labs.md) · [Lockfile](../../apps/web/package-lock.json)

Canvas draws a line for the sampled waveform and stems for discrete spectrum bins. Plots use engine-provided numeric buffers and spacing, with a named figure, axis labels, units and a textual peak summary outside the canvas. Rendering scales to available space. The CSS uses semantic surface, text, focus, action and trace tokens with system light and dark themes and a narrow single-column layout. Keyboard paths use native links, inputs and buttons, a skip link and route focus. The browser tests establish keyboard behavior in Chromium. Formal screen-reader and cross-browser review remain open.

## Run locally

Use Node 24 or newer. From `apps/web` run:

```sh
npm ci --ignore-scripts
npm run dev
npm run build
npm run preview
CHROMIUM_PATH=/usr/bin/chromium npm test
```

The tests use an installed Chromium and serve the production build locally. The default executable is `/usr/bin/chromium`. Set `LAB_SCREENSHOT` to a writable image path to capture the verified AM result during the test.

## Execution and result association

Conventional AM is a Chapter 2 demonstration. The lab uses T-07 validation for field diagnostics and the T-08 controller for run IDs, revisions, outcome correlation and current-result selection. The module Worker reuses the existing bounded dispatch decoder, validates the canonical model and compares the locally recreated T-06 fingerprint. The browser adapter checks result sizes, units, sampling metadata and finite values. The numerical engine runs in the worker.

The view admits one pending run and the adapter admits one worker. Cancellation invalidates handlers and terminates the worker before resolving a correlated cancelled outcome. Edits, reset and route cleanup stop pending work, and a subsequent run gets a fresh worker. Errors and the provisional 15-second watchdog produce failed outcomes. Reset restores defaults and clears the charts. The worker is a responsiveness boundary and supplies no hostile-code isolation. [T-07 engine](am-engine.md) · [T-08 lifecycle](run-lifecycle.md)

## Student feature integration

1. Define a topic's canonical parameters, versioned model and engine, T-06 diagnostics and output units in its domain module. Use the shared numerical primitives and independent references. Keep sampled outputs distinct from metadata used for the form. [CH1-F00](ch1-shared-numerics.md)
2. Add a feature module under `apps/web/src` that exports a mount function. Compose the shared controls and build the topic's plots from engine results. Each topic can have different inputs and result shapes.
3. Provide a reviewed typed domain dispatch adapter that preserves T-08 revision and outcome association, including bounded output validation. The current controller and codec bind to AM, so a Chapter 1 integration needs that adapter work before catalog activation.
4. After engine and browser tests pass, add its mount function to the existing entry in `catalog.ts`. A planned entry without a mount function remains unavailable. Use the shared navigation and theme.

```ts
function mountTopic(root: HTMLElement): () => void {
  const frequency = numericField("topic-frequency", "Frequency", "Hz", 50, "Greater than zero");
  root.append(frequency.root);
  // Bind topic form submission to its reviewed execution adapter.
  // Render each result with plot({ title, xLabel, yLabel, step, values, mode }).
  return () => root.replaceChildren();
}
```

`numericField` exposes its native input and an accessible error setter. `actions` provides Run, Reset and Cancel. `diagnostics` displays structured engine messages. `plot` takes an explicitly labeled uniformly spaced series starting at zero. Extend that API through review if a topic needs nonzero axes, multiple traces or a different plot kind. [UI primitives](../../apps/web/src/ui.ts) · [Plot component](../../apps/web/src/plot.ts) · [Catalog](../../apps/web/src/catalog.ts)

This increment provides a path through parts of T-09 through T-11. Broader Chapter 1 and Chapter 2 delivery, browser support policy, numerical tolerance approval and measured performance budgets remain open. [Roadmap](../roadmap/implementation-plan.md)
